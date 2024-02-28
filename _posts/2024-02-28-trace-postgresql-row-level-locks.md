---
layout: post
title: >
    Trace PostgreSQL Row-Level Locks with pg_row_lock_tracer
tags: [PostgreSQL, Tracing]
author: jan
excerpt_separator: <!--more-->
---

PostgreSQL uses several types of locks to coordinate parallel running transactions and grant access to resources like tuples, tables, and in-memory data structures. 

Heavy locks are used to control the access to tables. Lightweight locks (LWLocks) control access to data structures, such as adding data to the write-ahead-log (WAL). Row-level locks are used to control access to tuples. For example, individual tuples need to be locked when an SQL statement like `SELECT * FROM table WHERE i > 10 FOR UPDATE;`. The tuples that are returned by the query are internally locked with an exclusive lock (`LOCK_TUPLE_EXCLUSIVE`). Another transaction that tries to lock the same tuples has to wait until the first transaction unlocks the tuples.

In this article, the tool `pg_row_lock_tracer` is discussed. The tool employs eBPF and UProbes to trace the row-locking behavior of PostgreSQL. It can be downloaded from the [website](https://github.com/jnidzwetzki/pg-lock-tracer) of the pg-lock-tracer project.

This is the third article that deals with the tracing of PostgreSQL locks. The first article deals with the [tracing of heavyweight locks](/2023/01/11/trace-postgresql-locks-with-pg-lock-tracer.html). The second article deals with [LW locks](/2023/01/17/trace-postgresql-lw-locks.html).

<!--more-->

## Background
PostgreSQL implements [four different row lock modes](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS). They can be requested by adding `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`, or `FOR KEY SHARE` to a SELECT statement. Also, operations like updates acquire these locks automatically before a tuple is updated. For example, when a transaction successfully performs a `FOR UPDATE` lock on a tuple, an update operation of another parallel running transaction is blocked until the lock of the first transaction is released. Row-locks can be requested by calling the function [heapam_tuple_lock](https://github.com/postgres/postgres/blob/2a6b47cb50eb9b62b050de2cddd03a9ac267e61f/src/backend/access/heap/heapam_handler.c#L359).


### Lock Types
Internally, these locks are called `LockTupleKeyShare`, `LockTupleShare`, `LockTupleNoKeyExclusive`, and `LockTupleExclusive`. They are defined in the enum [LockTupleMode](https://github.com/postgres/postgres/blob/f0827b443e6014a9d9fdcdd099603576154a3733/src/include/nodes/lockoptions.h#L49). These locks have different strengths and some locks are _compatible_ (i.e., multiple transactions can hold locks at the same time for the same row) or locks can be _conflicting_ (i.e., only one lock can be taken at the same time and before a conflicting lock is granted, the requesting transaction has to wait).

### Lock Behavior
The user has the ability to specify various lock behaviors in addition to different lock modes. For instance, if a tuple is already locked and a second transaction requests a conflicting lock and would have to wait, the user can choose to skip the lock. The possible behaviors are defined in the enum [LockWaitPolicy](https://github.com/postgres/postgres/blob/f0827b443e6014a9d9fdcdd099603576154a3733/src/include/nodes/lockoptions.h#L36).

For example, the following SQL query acquires a `LockTupleExclusive` row lock if the lock would not be conflicting. All already locked tuples are not tried to lock by the current transaction. 

```sql
SELECT * FROM table WHERE i > 10 FOR UPDATE SKIP LOCKED;
```

The transaction that has successfully acquired the locks can assume that nobody else could modify the tuples in parallel. So, the returned values by the SELECT statement could be processed, modified, and changed in subsequent UPDATE statements and COMMITTED afterward.

### Lock Results
The possible results of the lock operation are defined in the enum [TM_Result](https://github.com/postgres/postgres/blob/f0827b443e6014a9d9fdcdd099603576154a3733/src/include/access/tableam.h#L71). The lock can be granted `TM_Ok`, or the lock can not be granted since the tuple is invisible for the used snapshot `TM_Invisible`, already modified by the same backend progress `TM_SelfModified`, updated `TM_Updated` or deleted`TM_Deleted`. In addition, when the lock is instructed not to wait, it could return `TM_BeingModified` when another transaction currently modifies the tuple, or it would block `TM_WouldBlock`. 

## pg_row_lock_tracer
`pg_row_lock_trace` makes it possible to trace the locking behavior of these row-level locks of a PostgreSQL process in real time using eBPF and UProbes. In addition, statistics about the requested locks and the locking results can be generated.

## Download and Usage

The lock tracer can be installed via the Python package installer `pip`:

```shell
pip install pg-lock-tracer
```

Afterward, the locks of one or more running processes can be traced:

```
# Trace the row locks of the given PostgreSQL binary
pg_row_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_14_9_DEBUG/bin/postgres

# Trace the row locks of the PID 1234
pg_row_lock_tracer -p 1234 -x /home/jan/postgresql-sandbox/bin/REL_14_9_DEBUG/bin/postgres

# Trace the row locks of the PID 1234 and 5678
pg_row_lock_tracer -p 1234 -p 5678 -x /home/jan/postgresql-sandbox/bin/REL_14_9_DEBUG/bin/postgres

# Trace the row locks of the PID 1234 and be verbose
pg_row_lock_tracer -p 1234 -x /home/jan/postgresql-sandbox/bin/REL_14_9_DEBUG/bin/postgres -v

# Trace the row locks and show statistics
pg_row_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_14_9_DEBUG/bin/postgres --statistics
```

A sample output of the tool looks as follows:

```
[...]
2783502701862408 [Pid 2604491] LOCK_TUPLE_END TM_OK in 13100 ns
2783502701877081 [Pid 2604491] LOCK_TUPLE (Tablespace 1663 database 305234 relation 313419) - (Block and offset 7 143) - LOCK_TUPLE_EXCLUSIVE LOCK_WAIT_BLOCK
2783502701972367 [Pid 2604491] LOCK_TUPLE_END TM_OK in 95286 ns
2783502701988387 [Pid 2604491] LOCK_TUPLE (Tablespace 1663 database 305234 relation 313419) - (Block and offset 7 144) - LOCK_TUPLE_EXCLUSIVE LOCK_WAIT_BLOCK
2783502702001690 [Pid 2604491] LOCK_TUPLE_END TM_OK in 13303 ns
2783502702016387 [Pid 2604491] LOCK_TUPLE (Tablespace 1663 database 305234 relation 313419) - (Block and offset 7 145) - LOCK_TUPLE_EXCLUSIVE LOCK_WAIT_BLOCK
2783502702029375 [Pid 2604491] LOCK_TUPLE_END TM_OK in 12988 ns
```

The tool's output contains the tuples that are being locked and it shows the used type of locks. Tuples are identified by the block and offset in a particular page of a relation (`Block and offset 7 145`). The output also contains additional options of the lock call, such as `LOCK_WAIT_BLOCK`. Additionally, the result of the lock operation (`TM_OK`) is also included in the output.

When the option `--statistics` is used, statistics about the traced locks can be collected. The statistics are shown during the termination of the tool (after hitting CTRL+C). 

```
Lock statistics:
================

Used wait policies:
+---------+-----------------+----------------+-----------------+
|   PID   | LOCK_WAIT_BLOCK | LOCK_WAIT_SKIP | LOCK_WAIT_ERROR |
+---------+-----------------+----------------+-----------------+
| 2604491 |       1440      |       0        |        0        |
+---------+-----------------+----------------+-----------------+

Lock modes:
+---------+---------------------+------------------+---------------------------+----------------------+
|   PID   | LOCK_TUPLE_KEYSHARE | LOCK_TUPLE_SHARE | LOCK_TUPLE_NOKEYEXCLUSIVE | LOCK_TUPLE_EXCLUSIVE |
+---------+---------------------+------------------+---------------------------+----------------------+
| 2604491 |          0          |        0         |             0             |         1440         |
+---------+---------------------+------------------+---------------------------+----------------------+

Lock results:
+---------+-------+--------------+-----------------+------------+------------+------------------+---------------+
|   PID   | TM_OK | TM_INVISIBLE | TM_SELFMODIFIED | TM_UPDATED | TM_DELETED | TM_BEINGMODIFIED | TM_WOULDBLOCK |
+---------+-------+--------------+-----------------+------------+------------+------------------+---------------+
| 2604491 |  1440 |      0       |        0        |     0      |     0      |        0         |       0       |
+---------+-------+--------------+-----------------+------------+------------+------------------+---------------+
```

## Summary
`pg_row_lock_tracer` is a tracer for PostgreSQL row-level locks. The tool is available [on GitHub](https://github.com/jnidzwetzki/pg-lock-tracer/) for download. It uses eBPF and UProbes to trace the row lock activity in real-time. Like the related programs (`pg_lock_tracer` and `pg_lw_lock_tracer`), this tool is also intended for debugging and analyzing lock behavior and performance problems.

This is the third article that deals with tracing PostgreSQL locks. A description of a lock tracer for heavyweight locks can be found in the [first part](/2023/01/11/trace-postgresql-locks-with-pg-lock-tracer.html) of this article series about locks. Tracing LW locks is discussed in the [second part](/2023/01/17/trace-postgresql-lw-locks.html) of the series about lock tracing in PostgreSQL.