---
layout: post
title: >
    Using Bpftrace to Trace PostgreSQL Vacuum Operations
tags: [PostgreSQL, eBPF, Debugging]
author: jan
excerpt_separator: <!--more-->
---

The [eBPF technology](https://ebpf.io/) of the Linux kernel allows it to monitor applications with minimal overhead. [UProbes](https://github.com/torvalds/linux/blob/master/kernel/events/uprobes.c) can be used to trace the invocation and exit of functions in programs. Modern tools to observe databases (like [pg-lock-tracer](https://jnidzwetzki.github.io/2023/01/11/trace-postgresql-locks-with-pg-lock-tracer.html)) are built on top of eBPF. However, these fully flagged tools are often written in C and Python and require some development effort. Sometimes, a 'quick and dirty' solution for a particular observation would be sufficient. With bpftrace, users can create eBPF programs with a few lines of code. In this article, we develop a simple bpftrace program to observe the execution of vacuum calls in PostgreSQL and analyze the delay.

<!--more-->

## Used Environment

PostgreSQL is a database management system that uses [vacuum operations](https://www.postgresql.org/docs/current/sql-vacuum.html) to reclaim space from dead (e.g., updated or deleted) tuples. 
In this post, we will trace the vacuum calls and determine the needed time for the vacuum operations per table.

In the following examples, a PostgreSQL 14 server is used. The PostgreSQL binary is located at `/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres`. In addition, the examples are executed in a database with these two tables:

```sql
CREATE TABLE testtable1 (
   id int NOT NULL,
   value int NOT NULL
);

CREATE TABLE testtable2 (
   id int NOT NULL,
   value int NOT NULL
);
```

__Note:__ Depending on the used C compiler and applied optimizations, the symbols of internal (i.e., as `static` declared) functions could not be visible. In this case, uprobes can not be used to trace the function invocations. To address this issue, there are two possible solutions: (1) remove the `static` modifier from the function declaration and recompile PostgreSQL, or (2) create a full [debug build](https://github.com/jnidzwetzki/pg-lock-tracer/#postgresql-build) of PostgreSQL.

## Using funclatency-bpfcc to Trace Function Calls

Let's explore the solutions that already exist before developing our tool to trace the vacuum operations. The tool `funclatency-bpfcc` is available for most Linux distributions (on Debian, it is contained in the package _bpfcc-tools_) and allows it to trace a function enter and exit and measure the function latency (i.e., the time the function needs to complete).

In PostgreSQL, the function `vacuum_rel` is invoked when a vacuum operation on a relation is performed. To trace these function calls with `funclatency-bpfcc`, the path of the PostgreSQL binary and the function name have to be provided. For instance:

```shell
$ sudo funclatency-bpfcc -r /home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres:vacuum_rel

Tracing 1 functions for "/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres:vacuum_rel"... Hit Ctrl-C to end.
```

Afterward, a eBPF program is loaded into the Linux kernel, a uprobe is defined on the function enter and one uprobe is defined on the function exit. The latency between these two events is measured and stored. 

To execute some vacuum operations, we perform the following SQL statement in a second session:

```sql
database=# VACUUM FULL;
VACUUM FULL
```

This SQL statement triggers PostgreSQL to perform a vacuum operation of all tables of the currently open database. After the vacuum operations are done, the `funclatency-bpfcc` program can be stopped (by executing CTRL+C). This ends the observation of the binary and shows the recorded execution times on the terminal.

```shell
$ sudo funclatency-bpfcc -r /home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres:vacuum_rel
[...]
^C
Function = b'vacuum_rel' [876997]
     nsecs               : count     distribution
         0 -> 1          : 0        |                                        |
         2 -> 3          : 0        |                                        |
         4 -> 7          : 0        |                                        |
         8 -> 15         : 0        |                                        |
        16 -> 31         : 0        |                                        |
        32 -> 63         : 0        |                                        |
        64 -> 127        : 0        |                                        |
       128 -> 255        : 0        |                                        |
       256 -> 511        : 0        |                                        |
       512 -> 1023       : 0        |                                        |
      1024 -> 2047       : 0        |                                        |
      2048 -> 4095       : 0        |                                        |
      4096 -> 8191       : 0        |                                        |
      8192 -> 16383      : 0        |                                        |
     16384 -> 32767      : 0        |                                        |
     32768 -> 65535      : 0        |                                        |
     65536 -> 131071     : 0        |                                        |
    131072 -> 262143     : 0        |                                        |
    262144 -> 524287     : 0        |                                        |
    524288 -> 1048575    : 0        |                                        |
   1048576 -> 2097151    : 0        |                                        |
   2097152 -> 4194303    : 0        |                                        |
   4194304 -> 8388607    : 2        |*                                       |
   8388608 -> 16777215   : 13       |***********                             |
  16777216 -> 33554431   : 44       |****************************************|
  33554432 -> 67108863   : 7        |******                                  |
  67108864 -> 134217727  : 1        |                                        |

avg = 22765358 nsecs, total: 1525279002 nsecs, count: 67

Detaching...
```

The output contains the information that the function `vacuum_rel` was called 67 times and the average function time is `22765358 nsecs`. In addition, a histogram of the function latency is printed. This gives a lot of helpful information, but it might be helpful to get the information which vacuum calls for which relation needs how much time. This is something that is not supported by this tool because it does not evaluate the parameters of the function (e.g., the OID of relation that the current function invocation should vacuum). However, this is something that we can do with `bpftrace`. 

## Tracing Function Entries

Let's start with a very simple bpftrace program that prints a line once the `vacuum_rel` function is invoked in the PostgreSQL binary. `bpftrace` is called with the eBPF program that should be loaded into the Linux kernel. The eBPF programs that are passed to bpftrace have the following [syntax](https://github.com/iovisor/bpftrace/blob/master/docs/reference_guide.md#language):

```
<probe1> {
        <Actions>
}

[...]

<probeN> {
        <Actions>
}
```

The syntax to define a uprobe on a userland binary is: `uprobe:library_name:function_name[+offset]`. For instance, to define an uprobe on the function invocation of `vacuum_rel` in the binary `/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres` and print the line `Vacuum started`, the following bpftrace call can be used:

```c
$ sudo bpftrace -e '
uprobe:/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres:vacuum_rel {
    printf("Vacuum started\n");
}
'

Attaching 1 probe...
Vacuum started
Vacuum started
Vacuum started
Vacuum started
Vacuum started
Vacuum started
Vacuum started
Vacuum started
Vacuum started
[...]
```

As soon as the `VACUUM FULL` SQL statement in PostgreSQL is executed in another terminal session, the program starts to print the message on the screen. This is a good start, but we still have less information available than output by the existing tool `funclatency-bpfcc`. The latency of the function calls is missing.

# Tracing Function Returns / Latency

To measure the latency of the function invocations, we need two things:

* We need to define a second probe that is invoked when the function observed returns; this can be done by a `uretproble`.
* The time between the function invocation and the return has to be measured.

A `uretproble` in bpftrace can be defined using the same syntax (`uretprobe:binary:function`) as the already defined `uprobe`. In addition, bpftrace allows it to create variables like associative arrays. We use such an array to capture the start time of a function invocation `@start[tid] = nsecs;`. The key of the array is the id of the current thread `tid`. So, multiple threads (and processes like in our case with PostgreSQL) can be traced simultaneously without overriding the last function invitation start time.

In the uretprobe we take the current time and subtract the time of the function invocation (`nsecs - @start[tid]`) to get the time the function call needs. In addition, we use a function predicate (`/@start[tid]/`) to let bpftrace know that we only want to execute the function body of the `uretprobe` as soon as this array value is defined. Using this predicate, we prevent handling a function return without seeing the function enter before (e.g., we start the bpftrace program in the middle of a running function call, and we get only the `uretprobe` invocation for this function call).

__Note:__ Is it not guaranteed that the eBPF events are delivered and processed in-order by bpftrace. Especially when a function call is short and we have a lot of function invocations, the events could be processed out-of-order (e.g., we see two function enter events followed by two function return events). In this case, function latency observations with bpftrace become imprecise. To avoid this, we use `VACUUM FULL` calls instead of `vacuum` calls. These calls are [much more expensive](https://www.postgresql.org/docs/current/sql-vacuum.html) since they rewrite the table. Therefore, they take longer and can be reliably observed by bpftrace.

```c
$ sudo bpftrace -e '
uprobe:/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres:vacuum_rel
{
        printf("Performing vacuum\n");
        @start[tid] = nsecs;
}

uretprobe:/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres:vacuum_rel
/@start[tid]/
{
        printf("Vacuum call took %d ns\n", nsecs - @start[tid]);
        delete(@start[tid]);
}
'
```

After running this bpftrace call and executing `VACUUM FULL` in a second session, we see the following output:

```
Attaching 2 probes...
Performing vacuum
Vacuum call took 37486735 ns
Performing vacuum
Vacuum call took 16491130 ns
Performing vacuum
Vacuum call took 32443568 ns
Performing vacuum
Vacuum call took 17959933 ns
[...]
```

For each call of the `vacuum_rel` in PostgreSQL, we measure the time the vacuum operation needs. However, it would be convenient if we could also trace the OID or the name of the relation that is vacuumed by the current vacuum operation. This requires the handling of the function parameters of the observed function.

## Handle Function Parameters

The function `vacuum_rel` has the following signature in PostgreSQL 14. The first parameter is the `Oid` (an [unsigned int](https://github.com/postgres/postgres/blob/1951d21b29939ddcb0e30a018cf413b949e40d97/src/include/postgres_ext.h#L31)) of the processed relation. The second parameter is a `RageVar` struct, which _could_ contain the name of the relation. The third parameter is a `VacuumParams` struct, which contains additional parameters for the vacuum operation and the last parameter is a `BufferAccessStrategy`, which defines the access strategy of the used buffer.

```c
static bool vacuum_rel(Oid relid,
        RangeVar *relation,
        VacuumParams *params,
        BufferAccessStrategy bstrategy 
)
```

Bpftrace allows it to access the function parameter using the keywords `arg0`, `arg1`, ..., `argN`. To include the Oid in the output our logging, we need only to print the first parameter of the function.

```c
$ sudo bpftrace -e '

uprobe:/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres:vacuum_rel
{
        printf("Performing vacuum of OID %d\n", arg0);
        @start[tid] = nsecs;
}

uretprobe:/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres:vacuum_rel
/@start[tid]/
{
        printf("Vacuum call took %d ns\n", nsecs - @start[tid]);
        delete(@start[tid]);
}
'
```

When the `VACUUM FULL` operation is executed again in a second terminal, the output looks as follows:

```
Attaching 2 probes...
[...]
Performing vacuum of OID 1153888
Vacuum call took 37486734 ns
Performing vacuum of OID 1153891
Vacuum call took 49535256 ns
Performing vacuum of OID 2619
Vacuum call took 39575635 ns
Performing vacuum of OID 2840
Vacuum call took 40683526 ns
Performing vacuum of OID 1247
Vacuum call took 14683600 ns
Performing vacuum of OID 4171
Vacuum call took 20587503 ns
```

To determine which Oid belongs to which relation, the following SQL statement can be executed: 

```sql
blog=# SELECT oid, relname FROM pg_class WHERE oid IN (1153888, 1153891);
   oid   |  relname   
---------+------------
 1153888 | testtable1
 1153891 | testtable2
(2 rows)
```

The result shows that the Oids `1153888` and `1153891` belong to the tables `testtable1` and `testtable2`, which we have created in one of the first sections of this article. These values belong to our test environment. In your environment, different Oids might be shown.

## Handle Function Struct Parameters

So far, we have processed simple parameters with `bpftrace` (like Oids, which are unsigned integers). However, many parameters in PostgreSQL are structs. Furthermore, these structs can be handled in bpftrace programs as well. 

The second parameter of the `vacuum_rel` function is a RangeVar struct. This struct is [defined in PostgreSQL 14](https://github.com/postgres/postgres/blob/2a8b40e3681921943a2989fd4ec6cdbf8766566c/src/include/nodes/primnodes.h#L63) as follows:

```c
typedef struct RangeVar
{
	NodeTag	type;
	char *catalogname;
	char *schemaname;
	char *relname;
	[...]
}
```

To process the struct, the following bpftrace program can be used. Please note, that the internal `NodeTag` data type of PostgreSQL is replaced by a simple int. The `NodeTag` data type is an `enum`. Enums are backed by the integer data type in C. To handle this enum correctly, we could (1) also copy the enum definition into the eBPF program, or (2) we could replace it with a data type of the same length. To keep the bpftrace program simple, the second option is used here. The next three struct members are char pointer which contains the catalogname, the schema, and the name of the relation. The `schemaname` and the `relname` are the fields we are interested in. The struct contains more members, but these members are ignored to keep the example clear.

```c
$ sudo bpftrace -e '
struct RangeVar
{
	int type;
	char *catalogname;
	char *schemaname;
	char *relname;
};

uprobe:/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres:vacuum_rel
{
        printf("[PID %d] Performing vacuum of OID %d (%s.%s)\n", pid, arg0, str(((struct RangeVar*) arg1)->schemaname), str(((struct RangeVar*) arg1)->relname));
        @start[tid] = nsecs;
}

uretprobe:/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres:vacuum_rel
/@start[tid]/
{
        printf("[PID %d] Vacuum call took %d ns\n", pid, nsecs - @start[tid]);
        delete(@start[tid]);
}
'
```

After the struct is defined, the members of the struct can be accessed as in a regular C program. For example: `((struct RangeVar*) arg1)->schemaname`. In addition, we also print the process id (PID) of the program that has triggered the uprobe. This allows it to identify the process that has performed the vacuum operation.

When running the following SQL statements in a second terminal:

```sql
VACUUM FULL public.testtable1;
VACUUM FULL public.testtable2;
```

The bpftrace program shows the following output:

```
Attaching 2 probes...
[PID 616516] Performing vacuum of OID 1153888 (public.testtable1)
[PID 616516] Vacuum call took 23683600 ns
[PID 616516] Performing vacuum of OID 1153891 (public.testtable2)
[PID 616516] Vacuum call took 24240837 ns
```

The table names are extracted from the `RangeVar` data structure and shown in the output. However, this data structure is not always populated by PostgreSQL. The data structure might be empty when running `VACUUM FULL` without specifying a table name. Therefore, we use two single invocations with explicit table names to force PostgreSQL to populate this data structure.

## Optimizing the Bpftrace Program Using Maps

The bpftrace programs we have developed so far use one or more `printf` statements directly. A `printf` call is slow and reduces the throughput the bpftrace program can monitor. 

This can be optimized by storing the data in a map that is printed when bpftrace is stopped. To do this, we introduce three new maps `@start`, `@oid`, and `@vacuum`. The first two maps are populated in the uprobe event of the `vacuum_rel` function. The map `@start` contains the time when the probe is triggered, and the map `@oid` contains the oid of the parameter function.

When the function is left and the `uretprobe` is activated, the `@vacuum`  map is populated. The key is the Oid and the value are the needed time to perform the vacuum operation. In addition, the keys of the first two maps are removed.

When bpftrace exits (i.e., by pressing CRTL+C), all populated maps are printed automatically. By using these three maps, we have separated the actual monitoring from the output; the expensive printf function is called after the monitoring is done. 

In addition, in the following program, we use the two functions `BEGIN` and `END` that are called by bpftrace when the observation begins and ends.

```c
$ sudo sudo bpftrace -e '

uprobe:/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres:vacuum_rel
{
        @start[tid] = nsecs;
        @oid[tid] = arg0;
}

uretprobe:/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres:vacuum_rel
/@start[tid]/
{

        @vacuum[@oid[tid]] = nsecs - @start[tid];
        delete(@start[tid]);
        delete(@oid[tid]);

}

BEGIN
{
        printf("VACUUM calles are traced, press CTRL+C to stop tracing\n");
}

END 
{
        printf("\n\nNeeded time in ns to perform VACUUM FULL per Oid\n");
}
'
```

After bpftrace is started, the first message is printed. After the program is stopped, the second message is printed. In addition, the content of the `@vacuum` map is printed. For each Oid, the needed time for the vacuum operations is shown.

```
VACUUM calles are traced, press CTRL+C to stop tracing
^C

Needed time in ns to perform VACUUM FULL per Oid

@vacuum[1153888]: 7526823
@vacuum[1153891]: 8462672
@vacuum[2613]: 10764797
@vacuum[2995]: 11429589
@vacuum[6102]: 11436539
@vacuum[12801]: 14373934
@vacuum[6106]: 14396012
@vacuum[3118]: 14507167
@vacuum[3596]: 14695385
@vacuum[12811]: 14871237
@vacuum[3429]: 15106778
@vacuum[3350]: 15158742
@vacuum[2611]: 15432053
@vacuum[3764]: 15534169
@vacuum[2601]: 16055863
@vacuum[3602]: 16128624
@vacuum[2605]: 16405419
@vacuum[2616]: 16914195
@vacuum[3576]: 17003920
[...]
```

## Conclusion
This article provides a brief overview of eBPF. To trace the function latency of PostgreSQL vacuum calls, we used the tool `funclatency-bpfcc`. Additionally, we utilized bpftrace to create a tool that allows for more in-depth observation of the calls. Our bpftrace script also takes into account the parameters of the PostgreSQL `vacuum_rel` function, enabling us to monitor the vacuum time per relation.
