---
layout: post
title: >
    Trace PostgreSQL LWLocks with pg_lw_lock_tracer
tags: [PostgreSQL, Tracing]
author: jan
excerpt_separator: <!--more-->
---

The Database Management System PostgreSQL uses lightweight locks ([LWLocks](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c)) to control access to shared memory data structures. In this article, the tool `pg_lw_lock_trace` is presented that allows tracing these kinds of locks. The tool can be downloaded from the [website](https://github.com/jnidzwetzki/pg-lock-tracer) of the project.

This is the second article that deals with tracing PostgreSQL locks. The first article deals with the tracing of heavyweight locks and can be found [here](/2023/01/11/trace-postgresql-locks-with-pg-lock-tracer.html).

<!--more-->

## Goal of the Tool
`pg_lw_lock_trace` is a tracer for lightweight locks. It allows attaching to a running PostgreSQL process and trace (see the lock and unlock) events of lightweight locks. A LWLock can [be taken](https://github.com/postgres/postgres/blob/c9f7f926484d69e2806e35343af7e472fadfede7/src/include/storage/lwlock.h#L113) as a shared `LW_SHARED` or as an exclusive `LW_EXCLUSIVE` lock. In addition, a special `LW_WAIT_UNTIL_FREE` mode is implemented in PostgreSQL to wait until a LWLock [becomes free](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L1593). In addition, statistics about the acquired locks and wait times are gathered by `pg_lw_lock_trace`.

## Trace Points

The LWLock events are traced by `pg_lw_lock_trace` in real-time. The tool uses _Userland Statically Defined Tracing_ (USDT) to trace these events. These are [static trace point](https://www.postgresql.org/docs/current/dynamic-trace.html) that are defined in the [source code of PostgreSQL](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L1685). To enable this functionality, PostgreSQL has to be compiled with `--enable-dtrace`.

To check if a PostgreSQL binary was compiled with active trace points, the program `bpftrace` can be used. It allows to list all in a binary defined USDT trace points. For example, the following command can be used to list all trace points of the binary `/home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres`.

```
sudo bpftrace -l "usdt:/home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres:*"
```

When it returns a output as follows, the PostgreSQL binary was compiled with enabled trace points:

```
[...]
usdt:/home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres:postgresql:clog__checkpoint__start
usdt:/home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres:postgresql:clog__checkpoint__done
usdt:/home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres:postgresql:multixact__checkpoint__start
usdt:/home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres:postgresql:multixact__checkpoint__done
usdt:/home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres:postgresql:subtrans__checkpoint__start
usdt:/home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres:postgresql:subtrans__checkpoint__done
usdt:/home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres:postgresql:twophase__checkpoint__start
usdt:/home/jan/postgresql-sandbox/bin/REL_15_1_DEBUG/bin/postgres:postgresql:twophase__checkpoint__done
[...]
```

If it returns an empty output, no trace points are defined in the binary and PostgreSQL needs to be re-compiled with `--enable-dtrace` to use `pg_lw_lock_tracer`.

## Download and Usage

The lock tracker can be installed via the Python package installer `pip`:

```shell
pip install pg-lock-tracer
```

Afterward, the locks of one or more running processes can be traced:

```
# Trace the LW locks of the PID 1234
pg_lw_lock_tracer -p 1234

# Trace the LW locks of the PIDs 1234 and 5678
pg_lw_lock_tracer -p 1234 -p 5678

# Trace the LW locks of the PID 1234 and be verbose
pg_lw_lock_tracer -p 1234 -v

# Trace the LW locks of the PID 1234 and collect statistics
pg_lw_lock_tracer -p 1234 -v --statistics
```

A sample output looks as follows:

```
2893442978058668 [Pid 1698108] Locking LockFastPath / mode LW_EXCLUSIVE
2893442978105987 [Pid 1698108] Unlocking LockFastPath
2893442978236610 [Pid 1698108] Locking ProcArray / mode LW_SHARED
2893442978257685 [Pid 1698108] Unlocking ProcArray
2893442978318499 [Pid 1698108] Locking LockFastPath / mode LW_EXCLUSIVE
2893442978337171 [Pid 1698108] Unlocking LockFastPath
2893442978623668 [Pid 1698108] Locking ProcArray / mode LW_SHARED
2893442978643411 [Pid 1698108] Unlocking ProcArray
2893442978755800 [Pid 1698108] Locking XidGen / mode LW_EXCLUSIVE
2893442978776986 [Pid 1698108] Unlocking XidGen
2893442978801282 [Pid 1698108] Locking LockManager / mode LW_EXCLUSIVE
2893442978828661 [Pid 1698108] Unlocking LockManager
2893442978868272 [Pid 1698108] Locking BufferMapping / mode LW_SHARED
2893442978891632 [Pid 1698108] Unlocking BufferMapping
2893442978913350 [Pid 1698108] Locking BufferContent / mode LW_EXCLUSIVE
2893442978947722 [Pid 1698108] Locking WALInsert / mode LW_EXCLUSIVE
2893442978971584 [Pid 1698108] Unlocking WALInsert
2893442978990777 [Pid 1698108] Unlocking BufferContent
2893442979113613 [Pid 1698108] Locking WALInsert / mode LW_EXCLUSIVE
2893442979135033 [Pid 1698108] Unlocking WALInsert
2893442979161490 [Pid 1698108] Wait for WALWrite
2893444602631050 [Pid 1698108] Lock for WALWrite was acquired in 1623469560 ns
[...]
```

When the option `--statistics` is used, statistics about the traced locks are shown during the termination of the tool. A [tranche](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L115) is the [identifier](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L762) of the resource that is protected by the lock.

```
Lock statistics:
================

Locks per tranche
+---------------+---------------+-------+----------------+
|  Tranche Name | Direct grants | Waits | Wait time (ns) |
+---------------+---------------+-------+----------------+
| BufferContent |       1       |   0   |       0        |
| BufferMapping |       1       |   0   |       0        |
|  LockFastPath |       4       |   0   |       0        |
|  LockManager  |       2       |   0   |       0        |
|  PgStatsData  |       0       |   0   |       0        |
|   ProcArray   |       2       |   0   |       0        |
|   WALInsert   |       2       |   0   |       0        |
|    WALWrite   |       0       |   1   |   1623469560   |
|    XactSLRU   |       0       |   0   |       0        |
|     XidGen    |       1       |   0   |       0        |
+---------------+---------------+-------+----------------+

Locks per type
+--------------+----------+
|  Lock type   | Requests |
+--------------+----------+
| LW_EXCLUSIVE |    10    |
|  LW_SHARED   |    3     |
+--------------+----------+
```

## Summary
`pg_lw_lock_trace` is a tracer for PostgreSQL lightweight locks. The tool is available [on GitHub](https://github.com/jnidzwetzki/pg-lock-tracer/) for download. It uses _Userland Statically Defined Tracing_ to trace the LWLock activity in real-time. Statistics about wait times of the LWLocks are also collected. This makes the tool very useful for performance analysis.

A description of a lock tracer for heavyweight locks can be found in the [first part](/2023/01/11/trace-postgresql-locks-with-pg-lock-tracer.html) of this article series about locks.