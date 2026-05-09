---
layout: post
title: >
    Tracing PostgreSQL Using eBPF and Hardware Breakpoints
tags: [PostgreSQL, Performance, eBPF, Profiling]
author: jan
excerpt_separator: <!--more-->
---

Hardware breakpoints can trigger eBPF programs when specific memory addresses are accessed, leveraging CPU hardware support for low overhead. By utilizing these hardware breakpoints, we can efficiently monitor PostgreSQL's internal variable updates, such as transaction ID generation and OID assignment. In this post, we will discuss what hardware breakpoints are, whether they have less overhead than uprobes, and how to answer questions like "How many transactions are being executed per second?" or "Which backend is consuming the most OIDs?" with bpftrace.

<!--more-->

In a previous blog post, I discussed how to use eBPF, uprobes/uretprobes, and bpftrace to monitor PostgreSQL's internal functions, such as [vacuum](/2023/08/23/using-bpftrace-to-trace-postgresql.html). uprobes and uretprobes trigger eBPF code in the Linux kernel when a function in user space is entered or exited. Even though uprobes and uretprobes have very low overhead, they still require instrumenting the function entry or exit with a software interrupt. That overhead is especially relevant for functions that are called very frequently. In contrast, hardware breakpoints use CPU hardware features to monitor specific memory addresses and trigger a real hardware interrupt when the monitored address is accessed. Therefore, they also let us catch all updates to a specific variable, even if it is updated in multiple functions, without instrumenting every function that touches it.

# How Uprobes Work Under the Hood?
Uprobes and uretprobes instrument the function entry or exit by replacing the first few instructions with a software (`int3`) interrupt. When the function is called, the CPU executes the software interrupt, triggering a CPU mode switch that enables the eBPF program to run.

When the eBPF program finishes, the kernel needs to execute the instruction that was replaced with `int3`. This is [called out-of-line execution](https://github.com/torvalds/linux/blob/6d35786de28116ecf78797a62b84e6bf3c45aa5a/arch/x86/kernel/uprobes.c#L1605) and requires the kernel to run the original instruction separately, which adds additional overhead.

The instruction replacement can be observed in gdb by inspecting the first few bytes of the function before and after attaching an uprobe to it. For example, let's inspect the `bms_is_member` function in PostgreSQL:

```bash
(gdb) x/10bx bms_is_member
0x55e0c2f7242c <bms_is_member>: 0x55  0x48  0x89  0xe5  0x48  0x83  0xec  0x20
0x55e0c2f72434 <bms_is_member+8>: 0x89  0x7d
```

The first byte of the `bms_is_member` function is `0x55`, which corresponds to the `push rbp` instruction. When running an eBPF program that attaches an uprobe to the `bms_is_member` function (for example, `funccount-bpfcc /home/jan/postgresql-sandbox/bin/REL_17_1_DEBUG/bin/postgres:bms_is_member`), the first byte of the function changes:

```bash
(gdb) x/10bx bms_is_member
0x55e0c2f7242c <bms_is_member>: 0xcc  0x48  0x89  0xe5  0x48  0x83  0xec  0x20
0x55e0c2f72434 <bms_is_member+8>: 0x89  0x7d
```

After executing the `funccount-bpfcc` command, the first byte of the `bms_is_member` function is replaced with `0xcc`, which is the opcode for the `int3` instruction on x86_64 CPUs. This allows the kernel to execute the eBPF program when the `bms_is_member` function is called.

_Note:_ Running `disassemble bms_is_member` in gdb will show the original instructions, since gdb uses the same `int3` instruction to set breakpoints and will replace the `int3` instruction with the original instruction when disassembling.

# How Hardware Breakpoints Work?

In contrast to uprobes, hardware breakpoints do not require any instruction replacement. Instead, they use CPU hardware features to monitor specific memory addresses and trigger a real hardware interrupt when the monitored address is accessed. When the CPU attempts to access that specific address (to read, write, or execute), a hardware comparator triggers, which allows for much lower overhead when monitoring frequently accessed functions or variables.

On x86_64 CPUs, hardware breakpoints are usually available, but the exact number of slots depends on the CPU. A quick sanity check is to look for the `de` flag, which indicates debug extensions, with the following command:

```bash
grep -m1 flags /proc/cpuinfo | grep -o 'de' && echo "CPU supports hardware breakpoints" || echo "CPU does not support hardware breakpoints"
```

Unfortunately, there is no simple way to check how many hardware breakpoints are available, but x86_64 CPUs typically support up to four hardware breakpoints. One way to determine the number of available hardware breakpoints is to use gdb to set hardware breakpoints until it fails. For example, the gdb command `hbreak` can be used to set a hardware breakpoint at a specific memory address.

# Example Use Cases
In this section, we will discuss how to use eBPF hardware breakpoints to monitor PostgreSQL's internal operations, like transaction ID generation and OID assignment. To be able to attach uprobes to PostgreSQL properly, a [debug build of PostgreSQL](https://github.com/jnidzwetzki/pg-lock-tracer/#postgresql-build) is used in the following examples.

## Monitoring PostgreSQL Transaction ID Generation

To use hardware breakpoints to trigger an eBPF program when a specific variable is accessed, we can use the `bpftrace` tool. The first step is to identify the memory address of the variable we want to monitor. For example, to monitor PostgreSQL's transaction ID generation, we can inspect the `nextXid` variable. To determine the memory address of `nextXid`, we can use gdb to attach to a running PostgreSQL process and print the address of the variable:

```bash
gdb -p $(pgrep -o postgres)
(gdb) print &TransamVariables->nextXid
$1 = (FullTransactionId *) 0x7f6791925608
```

Afterward, we can use that information in `bpftrace` to set a hardware breakpoint on the memory address of `TransamVariables->nextXid` and trigger an eBPF program whenever it is accessed. Furthermore, the eBPF program can read the value of `nextXid` (see the `*(uint64 *)0x7f6791925608` expression in the `bpftrace` command below) and print it along with the process ID and command name of the process that accessed it:

```bash
sudo bpftrace  -e "
watchpoint:0x7f6791925608:8:w {
  \$val = *(uint64 *)0x7f6791925608;
 printf(\"[XID Event] PID: %-6d | comm: %-10s | next xid: %lu\n\", pid, comm, \$val);
}"
```

In this example, the `watchpoint` probe is used to set a hardware breakpoint on the memory address `0x7f6791925608`, which corresponds to `TransamVariables->nextXid`. The `:8:w` suffix indicates that we want to monitor an 8-byte write access to that address. 

When `pg_current_xact_id()` is called in a second terminal, PostgreSQL allocates a new transaction ID, which updates `nextXid`. This triggers the hardware breakpoint and executes the eBPF program, which prints the new value of `nextXid`. For example:

```sql
test2=# SELECT pg_current_xact_id();
 pg_current_xact_id
--------------------
               2246
(1 row)

test2=# SELECT pg_current_xact_id();
 pg_current_xact_id
--------------------
               2247
(1 row)
```

The output of the `bpftrace` command shows the process ID, command name, and the new value of `nextXid` each time it is updated:

```
Attaching 1 probe...
[XID Event] PID: 117447 | comm: postgres   | next xid: 2247
[XID Event] PID: 117447 | comm: postgres   | next xid: 2248
```

To monitor the transaction ID generation rate, we can use `bpftrace` to count the number of times the hardware breakpoint is triggered every second. The eBPF program stores those counts in an eBPF map called `@count`. The `interval:s:1` probe prints the contents of `@count` every second and then clears the map for the next interval:

```bash
sudo bpftrace -e '
watchpoint:0x7f6791925608:8:w {
 @count[comm] = count();
}

interval:s:1 {
 time("%H:%M:%S: ");
 print(@count);
 clear(@count);
}'
```

When running the above `bpftrace` command, it prints the number of times the hardware breakpoint was triggered every second, which corresponds to the number of transactions being created in PostgreSQL. For example, the output might look like this:

```bash
21:49:45:
21:49:46: @count[postgres]: 1
21:49:47: @count[postgres]: 23
21:49:48: @count[postgres]: 24
21:49:49: @count[postgres]: 2
21:49:50:
21:49:51: @count[postgres]: 1
21:49:52: @count[postgres]: 1
21:49:53: @count[postgres]: 2
```

That means that in the one-second interval starting at 21:49:46, the hardware breakpoint was triggered once, which corresponds to one transaction being created in PostgreSQL. In the next one-second interval starting at 21:49:47, the hardware breakpoint was triggered 23 times, which corresponds to 23 transactions being created in PostgreSQL, and so on.

## Monitoring PostgreSQL OID Assignment

Using the same approach, we can also monitor PostgreSQL's OID assignment by setting a hardware breakpoint on the `TransamVariables->nextOid` variable. The first step is to determine the memory address of the `nextOid` variable using gdb:

```bash
(gdb) print &TransamVariables->nextOid
$1 = (Oid *) 0x7f6791925600
```

For monitoring OID assignment, we can use a simple `bpftrace` command to set a hardware breakpoint on the memory address of `TransamVariables->nextOid` and print the new value of `nextOid` whenever it is updated:

```bash
sudo bpftrace  -e "
watchpoint:0x7f6791925600:4:w {
  \$val = *(uint32 *)0x7f6791925600;
 printf(\"[OID Event] PID: %-6d | comm: %-10s | next oid: %lu\n\", pid, comm, \$val);
}"
```

When in a second terminal, a new OID is assigned in PostgreSQL (e.g., by creating a new table), the `nextOid` variable is updated, which triggers the hardware breakpoint and executes the eBPF program, printing the new value of `nextOid`:

```sql
test2=# CREATE TABLE test100();
CREATE TABLE
test2=# CREATE TABLE test101();
CREATE TABLE
test2=# CREATE TABLE test102();
CREATE TABLE
test2=# SELECT 'test100'::regclass::oid;
  oid
-------
 57539
(1 row)
```

The output of the `bpftrace` command shows the process ID, command name, and the new value of `nextOid` each time it is updated. It also shows that the OID of table `test100` is 57539. The first line of the output corresponds to the OID assignment for table `test100`; after the table was created, `nextOid` was incremented to 57540.

```
[OID Event] PID: 117447 | comm: postgres   | next oid: 57540
[OID Event] PID: 117447 | comm: postgres   | next oid: 57541
[OID Event] PID: 117447 | comm: postgres   | next oid: 57542
```

To monitor which backend is consuming the most OIDs, we can use an eBPF program that counts the number of times the hardware breakpoint is triggered for each backend process. The `interval:s:5` probe prints the contents of the `@count` map every five seconds and then clears the map for the next interval:

```bash
sudo bpftrace -e '
watchpoint:0x7f6791925600:4:w {
 @count[tid, comm] = count();
}

interval:s:5 {
 time("%H:%M:%S: ");
 print(@count);
 clear(@count);
}'
```

The output of the above `bpftrace` command will show the number of times the hardware breakpoint was triggered for each backend process every five seconds, which corresponds to the number of OIDs being assigned by each PostgreSQL backend. For example, the output might look like this:

```
21:47:15:
21:47:20:
21:47:25: @count[519125, postgres]: 6
21:47:30: @count[519125, postgres]: 6
21:47:35: @count[673992, postgres]: 6
@count[519125, postgres]: 6
21:47:40:
21:47:45: @count[673992, postgres]: 18
```

That means that the process with ID 519125 triggered the hardware breakpoint 6 times in the five-second interval starting at 21:47:25 and 6 times in the next five-second interval. The process with ID 673992 triggered the hardware breakpoint 6 times in the five-second interval starting at 21:47:35 and 18 times in the next five-second interval, which indicates that it is consuming more OIDs than the process with ID 519125.

# Benchmarking Hardware Breakpoints vs Uprobes

To compare the overhead of hardware breakpoints and uprobes, we can use a simple C program that performs heavy computations in a loop and updates a global variable, which is monitored by either a hardware breakpoint or an uprobe.

```c
#include <stdio.h>
#include <stdint.h>
#include <time.h>
#include <stdbool.h>
#include <math.h>

// Global variable for the hardware watchpoint
volatile uint64_t target_var = 0;

// Function for the uprobe
__attribute__((noinline))
void trace_target_func(uint64_t val) {
    target_var = val;
}

int main() {
    uint64_t iterations = 0;
    struct timespec start, now;
    double elapsed;
    double dummy_math = 0.0;

    printf("Target address for watchpoint: %p\n", (void*)&target_var);
    printf("Symbol for uprobe: trace_target_func\n\n");

    clock_gettime(CLOCK_MONOTONIC, &start);

    while (true) {
        // Perform some heavy computations to simulate a workload
        for(int i = 0; i < 500; i++) {
            dummy_math += sin(i) * cos(iterations);
            dummy_math = sqrt(fabs(dummy_math + 1.0));
        }

        // Triggers the probe
        trace_target_func((uint64_t)dummy_math + iterations);

        iterations++;

        // Measure throughput every second
        clock_gettime(CLOCK_MONOTONIC, &now);
        elapsed = (now.tv_sec - start.tv_sec) + (now.tv_nsec - start.tv_nsec) / 1e9;

        if (elapsed >= 1.0) {
            printf("Throughput: %.2f thousand iterations/s | Current Value: %.2f\n",
                   (iterations / elapsed) / 1e3, dummy_math);
            iterations = 0;
            clock_gettime(CLOCK_MONOTONIC, &start);
        }
    }
    return 0;
}
```

In the following example, the program is compiled using `gcc -O3 perf_test.c -lm -o perf_test` and executed afterward. When running the program, the output looks on my machine (using a low-powered optimized `Intel(R) Pentium(R) Silver J5005 CPU`) like this:

```
Target address for watchpoint: 0x55c55f9eb040
Symbol for uprobe: trace_target_func

Throughput: 56.13 thousand iterations/s | Current Value: 1.51
Throughput: 55.80 thousand iterations/s | Current Value: 1.84
Throughput: 56.11 thousand iterations/s | Current Value: 1.55
Throughput: 56.42 thousand iterations/s | Current Value: 1.80
```

When attaching an uprobe to the `trace_target_func` function using `sudo bpftrace -e 'uprobe:./perf_test:trace_target_func { @ = count(); }'` to count the number of times the function is called, the throughput drops significantly:

```
Throughput: 34.46 thousand iterations/s | Current Value: 1.32
Throughput: 34.99 thousand iterations/s | Current Value: 1.32
Throughput: 35.07 thousand iterations/s | Current Value: 1.63
Throughput: 34.78 thousand iterations/s | Current Value: 1.58
```

When attaching a hardware breakpoint to the `target_var` variable using `sudo bpftrace -e 'watchpoint:0x558b32ba9040:8:w { @ = count(); }'`, the output drops as well, but it is slightly less significant than with uprobes:

```
Throughput: 38.61 thousand iterations/s | Current Value: 1.46
Throughput: 38.80 thousand iterations/s | Current Value: 1.84
Throughput: 38.75 thousand iterations/s | Current Value: 1.66
Throughput: 39.09 thousand iterations/s | Current Value: 1.84
```

So, we have roughly `56.115` thousand iterations/s without any probes, `34.825` thousand iterations/s with an uprobe, and `38.8125` thousand iterations/s with a hardware breakpoint. This means that the overhead of the uprobe is around `38%` and the overhead of the hardware breakpoint is around `30%` in this specific benchmark. The exact overhead can vary depending on the CPU architecture, the workload, and how frequently the monitored function or variable is accessed.

The reason for the still significant overhead in both cases is the CPU mode switch required to execute the eBPF program when the probe is triggered. The way the eBPF program is triggered affects overhead, but the CPU mode switch itself and the execution of the eBPF program are the main contributors. 


# Conclusion
In this blog post, we discussed how to use eBPF hardware breakpoints to monitor PostgreSQL's internal operations, such as transaction ID generation and OID assignment. We also compared the overhead of hardware breakpoints with uprobes and found that hardware breakpoints can have a slightly lower overhead than uprobes.
