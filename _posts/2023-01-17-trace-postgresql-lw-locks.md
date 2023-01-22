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
===> Ready to trace
2904552881615298 [Pid 1704367] Acquired lock LockFastPath (mode LW_EXCLUSIVE) / LWLockAcquire()
2904552881673849 [Pid 1704367] Unlock LockFastPath
2904552881782910 [Pid 1704367] Acquired lock ProcArray (mode LW_SHARED) / LWLockAcquire()
2904552881803614 [Pid 1704367] Unlock ProcArray
2904552881865272 [Pid 1704367] Acquired lock LockFastPath (mode LW_EXCLUSIVE) / LWLockAcquire()
2904552881883641 [Pid 1704367] Unlock LockFastPath
2904552882095131 [Pid 1704367] Acquired lock ProcArray (mode LW_SHARED) / LWLockAcquire()
2904552882114171 [Pid 1704367] Unlock ProcArray
2904552882225372 [Pid 1704367] Acquired lock XidGen (mode LW_EXCLUSIVE) / LWLockAcquire()
2904552882246673 [Pid 1704367] Unlock XidGen
2904552882270279 [Pid 1704367] Acquired lock LockManager (mode LW_EXCLUSIVE) / LWLockAcquire()
2904552882296782 [Pid 1704367] Unlock LockManager
2904552882335466 [Pid 1704367] Acquired lock BufferMapping (mode LW_SHARED) / LWLockAcquire()
2904552882358198 [Pid 1704367] Unlock BufferMapping
2904552882379951 [Pid 1704367] Acquired lock BufferContent (mode LW_EXCLUSIVE) / LWLockAcquire()
2904552882415333 [Pid 1704367] Acquired lock WALInsert (mode LW_EXCLUSIVE) / LWLockAcquire()
2904552882485459 [Pid 1704367] Unlock WALInsert
2904552882506167 [Pid 1704367] Unlock BufferContent
2904552882590752 [Pid 1704367] Acquired lock WALInsert (mode LW_EXCLUSIVE) / LWLockAcquire()
2904552882611656 [Pid 1704367] Unlock WALInsert
2904552882638194 [Pid 1704367] Wait for WALWrite
2904554401202251 [Pid 1704367] Wait for WALWrite lock took 1518564057 ns
[...]
```

When the option `--statistics` is used, statistics about the traced locks can be collected. The statistics are shown during the termination of the tool (after hitting CTRL+c). 

A [tranche](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L115) is the [identifier](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L762) of the resource that is protected by the lock. LWLocks can be acquired using different functions in PostgreSQL:

* The function `LWLockAcquire(...)` ([link](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L1191)) is the most commonly used function to acquire LWLocks. If the lock can be granted, it is granted and the function returns. Otherwise, the function waits until the lock is available, squires it, and returns.

* The function `LWLockConditionalAcquire(...)` ([link](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L1362)) also tries to acquire the lock. If it is not directly available, it just returns false.

* The function `LWLockAcquireOrWait(...)` ([link](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L1419)) tries to acquire the lock. If it is not directly available, it waits until the lock is available but does __not__ acquire the lock.

From the PostgreSQL source code ([link](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L1419)):
> The semantics of this function are a bit funky.  If the lock is currently free, it is acquired in the given mode, and the function returns true.  If the lock isn't immediately free, the function waits until it is released and returns false, but does not acquire the lock.

Depending on the function used to acquire the LWLock, different counters are increased in the statistics.

```
Lock statistics:
================

Locks per tranche
+---------------+----------+--------------------------+------------------------+-------------------------------+-----------------------------+-------+----------------+
|    Tranche    | Acquired | AcquireOrWait (Acquired) | AcquireOrWait (Waited) | ConditionalAcquire (Acquired) | ConditionalAcquire (Failed) | Waits | Wait time (ns) |
+---------------+----------+--------------------------+------------------------+-------------------------------+-----------------------------+-------+----------------+
| BufferContent |    1     |            0             |           0            |               0               |              0              |   0   |       0        |
| BufferMapping |    1     |            0             |           0            |               0               |              0              |   0   |       0        |
|  LockFastPath |    4     |            0             |           0            |               0               |              0              |   0   |       0        |
|  LockManager  |    2     |            0             |           0            |               0               |              0              |   0   |       0        |
|  PgStatsData  |    0     |            0             |           0            |               4               |              0              |   0   |       0        |
|   ProcArray   |    2     |            0             |           0            |               1               |              0              |   0   |       0        |
|   WALInsert   |    2     |            0             |           0            |               0               |              0              |   0   |       0        |
|    WALWrite   |    0     |            1             |           1            |               0               |              0              |   1   |   1518564057   |
|    XactSLRU   |    0     |            0             |           0            |               1               |              0              |   0   |       0        |
|     XidGen    |    1     |            0             |           0            |               0               |              0              |   0   |       0        |
+---------------+----------+--------------------------+------------------------+-------------------------------+-----------------------------+-------+----------------+

Locks per type
+--------------+----------+
|  Lock type   | Requests |
+--------------+----------+
| LW_EXCLUSIVE |    18    |
|  LW_SHARED   |    3     |
+--------------+----------+
```

## Summary
`pg_lw_lock_trace` is a tracer for PostgreSQL lightweight locks. The tool is available [on GitHub](https://github.com/jnidzwetzki/pg-lock-tracer/) for download. It uses _Userland Statically Defined Tracing_ to trace the LWLock activity in real-time. Statistics about wait times of the LWLocks are also collected. This makes the tool very useful for performance analysis.

A description of a lock tracer for heavyweight locks can be found in the [first part](/2023/01/11/trace-postgresql-locks-with-pg-lock-tracer.html) of this article series about locks.