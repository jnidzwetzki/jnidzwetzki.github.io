---
layout: post
title: >
    Trace PostgreSQL locks with pg_lock_tracer
tags: [PostgreSQL, Tracing]
author: jan
excerpt_separator: <!--more-->
---

The DBMS PostgreSQL uses locks to synchronize access to resources like tables. To get more information about the locks, the [table](https://www.postgresql.org/docs/15/view-pg-locks.html) `pg_locks` shows which relation is currently locked by which process. However, this relation shows only the current state of the locks. To show the locking activity in real-time, the new lock tracing tool `pg_lock_tracer` can be used. `pg_lock_tracer` is an open-source tool that I have just recently created. It can be downloaded from the [website](https://github.com/jnidzwetzki/pg-lock-tracer) of the project.

<!--more-->

## Goal of the Tool
The tool employs a _Berkeley Packet Filter_ ([BPF](https://en.wikipedia.org/wiki/Berkeley_Packet_Filter)) program to get the locking activity of a PostgreSQL process in real-time with very low overhead. In addition, statistics about the taken locks (e.g., number of locks, lock types, delay) are measured by the tool. After the tool is running, the taken locks of the process are shown in real-time.

The tracer is intended for developers or system administrators to get additional information about the internals of PostgreSQL. In addition to the [lock types](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-TABLES), table open and close activity, transactions, deadlocks, errors, and the way the lock is grated is shown ([fast-path locking](https://www.postgresql.org/message-id/E1QifmZ-0002KR-Ph@gemulon.postgresql.org) or [local locks](https://github.com/postgres/postgres/blob/master/src/backend/storage/lmgr/README#L78)).

The output of the tool is intended to be readable by a human. However, by using the `--json` flag, the output is generated in JSON format and can be processed by further tools.

## Download and Usage

To install the lock tracker, the Python package installer `pip` can be used:

```
pip install git+https://github.com/jnidzwetzki/pg-lock-tracer
```

This command installs the lock tracker with most needed dependencies. However, the BPF Python binding needs to be installed via the package manager of the used Linux distribution; they are currently not available via pip. To install them on a Ubuntu or Debian based system, the following command can be used:

```
apt install python3-bpfcc
```

### Execute the Tracer

In this section, a simple query is traced. After the tracer is installed, it can be executed. The following command uses the PostgreSQL binary `/home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres` and observes the process with the ID `327578` (the SQL query `SELECT * from pg_backend_pid();` can be used to determine the PID of the PostgreSQL backend process). 

To resolve the used _Object identifiers_ (OIDs) in the lock call, `pg_lock_tracer` can connect to the catalog of the database and get the real names of the tables. For example, the OID 3081 is translated into `pg_catalog.pg_extension_name_index`. Because every database has its own catalog with OIDs, the OID resolver has to be specified per traced process. By using the `--statistics` parameter, statistics about the locks are shown before the tool is terminated.

```
pg_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres -p 327578 -r 327578:sql://jan@localhost/test2 --statistics
```

### Execute the SQL Query

After the tracer is running, a SQL query can be executed. In this example, the following SQL is used: 

```sql
CREATE TABLE metrics(ts timestamptz NOT NULL, id int NOT NULL, value float);
```

### Output of the Tracer

```
===> Ready to trace queries
745064333930117 [Pid 327578] Query begin 'create table metrics(ts timestamptz NOT NULL, id int NOT NULL, value float);'
745064333965769 [Pid 327578] Transaction begin
745064334157640 [Pid 327578] Table open 3079 (pg_catalog.pg_extension) AccessShareLock
745064334176147 [Pid 327578] Lock object 3079 (pg_catalog.pg_extension) AccessShareLock
745064334204453 [Pid 327578] Lock granted (fastpath) 3079 (pg_catalog.pg_extension) AccessShareLock
745064334224361 [Pid 327578] Lock granted (local) 3079 (pg_catalog.pg_extension) AccessShareLock (Already hold local 0)
745064334243659 [Pid 327578] Lock was acquired in 67512 ns
745064334285877 [Pid 327578] Lock object 3081 (pg_catalog.pg_extension_name_index) AccessShareLock
745064334309610 [Pid 327578] Lock granted (fastpath) 3081 (pg_catalog.pg_extension_name_index) AccessShareLock
745064334328475 [Pid 327578] Lock granted (local) 3081 (pg_catalog.pg_extension_name_index) AccessShareLock (Already hold local 0)
745064334345266 [Pid 327578] Lock was acquired in 59389 ns
745064334562977 [Pid 327578] Lock ungranted (fastpath) 3081 (pg_catalog.pg_extension_name_index) AccessShareLock
745064334583578 [Pid 327578] Lock ungranted (local) 3081 (pg_catalog.pg_extension_name_index) AccessShareLock (Hold local 0)
745064334608957 [Pid 327578] Table close 3079 (pg_catalog.pg_extension) AccessShareLock
745064334631046 [Pid 327578] Lock ungranted (fastpath) 3079 (pg_catalog.pg_extension) AccessShareLock
745064334649932 [Pid 327578] Lock ungranted (local) 3079 (pg_catalog.pg_extension) AccessShareLock (Hold local 0)
745064334671897 [Pid 327578] Table open 3079 (pg_catalog.pg_extension) AccessShareLock
745064334688382 [Pid 327578] Lock object 3079 (pg_catalog.pg_extension) AccessShareLock
745064334712042 [Pid 327578] Lock granted (fastpath) 3079 (pg_catalog.pg_extension) AccessShareLock
745064334731081 [Pid 327578] Lock granted (local) 3079 (pg_catalog.pg_extension) AccessShareLock (Already hold local 0)
745064334748288 [Pid 327578] Lock was acquired in 59906 ns
745064334772367 [Pid 327578] Lock object 3081 (pg_catalog.pg_extension_name_index) AccessShareLock
745064334795943 [Pid 327578] Lock granted (fastpath) 3081 (pg_catalog.pg_extension_name_index) AccessShareLock
745064334814983 [Pid 327578] Lock granted (local) 3081 (pg_catalog.pg_extension_name_index) AccessShareLock (Already hold local 0)
745064334832570 [Pid 327578] Lock was acquired in 60203 ns
[...]
```

The output of the tracer is truncated to keep the example readable. The full output of the tracer for the query can be found [here](https://github.com/jnidzwetzki/pg-lock-tracer/blob/main/examples/create_table_trace.json).


After the query is executed, the lock tracer can be terminated by pressing `CTRL` + c. It stops to trace the process, shows the collected statistics and terminates afterward.

```
Lock statistics:
================

Locks per oid
+----------------------------------------------+----------+------------------------------+
|                  Lock Name                   | Requests | Total Lock Request Time (ns) |
+----------------------------------------------+----------+------------------------------+
|     pg_catalog.pg_depend_reference_index     |    20    |           1174663            |
|             pg_catalog.pg_depend             |    8     |            456525            |
|              pg_catalog.pg_type              |    5     |            282986            |
|     pg_catalog.pg_type_typname_nsp_index     |    4     |            229317            |
|         pg_catalog.pg_type_oid_index         |    4     |            300239            |
|             pg_catalog.pg_class              |    3     |            180540            |
|        pg_catalog.pg_class_oid_index         |    3     |            172549            |
|     pg_catalog.pg_depend_depender_index      |    3     |            171186            |
|    pg_catalog.pg_class_relname_nsp_index     |    2     |            114311            |
|           pg_catalog.pg_attribute            |    2     |            113041            |
|  pg_catalog.pg_attribute_relid_attnum_index  |    2     |            113299            |
|                public.metrics                |    2     |            223162            |
| pg_catalog.pg_class_tblspc_relfilenode_index |    1     |            56426             |
|  pg_catalog.pg_attribute_relid_attnam_index  |    1     |            57238             |
|            pg_catalog.pg_shdepend            |    1     |            65878             |
|    pg_catalog.pg_shdepend_reference_index    |    1     |            63127             |
+----------------------------------------------+----------+------------------------------+

Lock types
+---------------------+---------------------------+
|      Lock Type      | Number of requested locks |
+---------------------+---------------------------+
|   AccessShareLock   |             32            |
|   RowExclusiveLock  |             28            |
| AccessExclusiveLock |             2             |
+---------------------+---------------------------+
```

## More Options of the Tracker.
The lock tracer provides a lot of additional options. For example, the types of the events can be restricted or stack traces can be generated for every locking event. To trace only locking events (`-t LOCK`) and generate stack traces for every lock event (`-s LOCK`), the tracer can be invoked as follows:

```
pg_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres -p 1051967 -r 1051967:sql://jan@localhost/test2 -s LOCK -t LOCK
```

The output of the tracer looks as follows:

```
[...]
1990162746005798 [Pid 1051967] Lock object 3079 (pg_catalog.pg_extension) AccessShareLock
	LockRelationOid+0x0 [postgres]
	table_open+0x1d [postgres]
	parse_analyze+0xed [postgres]
	pg_analyze_and_rewrite+0x49 [postgres]
	exec_simple_query+0x2db [postgres]
	PostgresMain+0x833 [postgres]
	ExitPostmaster+0x0 [postgres]
	BackendStartup+0x1b1 [postgres]
	ServerLoop+0x2d9 [postgres]
	PostmasterMain+0x1286 [postgres]
	startup_hacks+0x0 [postgres]
	__libc_start_main+0xea [libc-2.31.so]
	[unknown]
[...]
```

To resolve one of these addresses to a line in the source code, the debugger `gdb` can be used. For example, to resolve `exec_simple_query+0x2db` to a line, the following command has to be executed:

```
gdb /home/jan/postgresql-sandbox/bin/REL_14_2_DEBUG/bin/postgres
[...]
(gdb) info line *(exec_simple_query+0x2db)
Line 1130 of "postgres.c" starts at address 0x5d4758 <exec_simple_query+696> and ends at 0x5d477f <exec_simple_query+735>.
```

It can be seen that the address `exec_simple_query+0x2db` resolves to line 1130 of the file `postgres.c`.

More information about all the options of `pg_lock_tracer` can be found in the help output:

```
usage: pg_lock_tracer [-h] [-v] [-j] -p PID [PID ...] -x PATH [-r [OIDResolver ...]]
                      [-s [{DEADLOCK,LOCK,UNLOCK} ...]] [-t [{TRANSACTION,QUERY,TABLE,LOCK,ERROR} ...]]
                      [-o OUTPUT_FILE] [--statistics] [-d]

optional arguments:
  -h, --help            show this help message and exit
  -v, --verbose         be verbose
  -j, --json            generate output as JSON data
  -p PID [PID ...], --pid PID [PID ...]
                        the pid(s) to trace
  -x PATH, --exe PATH   path to binary
  -r [OIDResolver ...], --oid-resolver [OIDResolver ...]
                        OID resolver for a PID. The resolver has to be specified in format <PID:database-
                        url>
  -s [{DEADLOCK,LOCK,UNLOCK} ...], --stacktrace [{DEADLOCK,LOCK,UNLOCK} ...]
                        print stacktrace on every of these events
  -t [{TRANSACTION,QUERY,TABLE,LOCK,ERROR} ...], --trace [{TRANSACTION,QUERY,TABLE,LOCK,ERROR} ...]
                        events to trace (default: All events are traced)
  -o OUTPUT_FILE, --output OUTPUT_FILE
                        write the trace into output file
  --statistics          print lock statistics
  -d, --dry-run         compile and load the BPF program but exit afterward

usage examples:
# Trace use binary '/home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres' for tracing and trace pid 1234
pg_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres -p 1234

# Trace two PIDs
pg_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres -p 1234 -p 5678

# Be verbose
pg_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres -p 1234 -v 

# Use the given db connection to access the catalog of PID 1234 to resolve OIDs
pg_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres -p 1234 -r 1234:psql://jan@localhost/test2

# Output in JSON format
pg_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres -p 1234 -j

# Print stacktrace on deadlock
pg_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres -p 1234 -s DEADLOCK

# Print stacktrace for locks and deadlocks
pg_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres -p 1234 -s LOCK, DEADLOCK

# Trace only Transaction and Query related events
pg_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres -p 1234 -t TRANSACTION QUERY

# Write the output into file 'trace'
pg_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres -p 1234 -o trace

# Show statistics about locks
pg_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres -p 1234 --statistics
```

## Summary
`pg_lock_tracer` is my new open-source tracing tool for PostgreSQL lock activity. It uses the Berkeley Packet Filter (BPF) to trace a running PostgreSQL process and shows the lock activity in real-time. The tool can be downloaded from the [website](https://github.com/jnidzwetzki/pg-lock-tracer) of the project. 