---
layout: post
title: >
    Trace PostgreSQL Row-Level Locks with pg_row_lock_tracer
tags: [PostgreSQL, Tracing]
author: jan
excerpt_separator: <!--more-->
---

PostgreSQL uses several types of locks to coordinate parallel transactions and manage access to resources like tuples, tables, and in-memory data structures. 

Heavyweight locks are used to control access to tables. Lightweight locks (LWLocks) manage access to data structures, such as adding data to the write-ahead log (WAL). Row-level locks control access to individual tuples. For example, tuples need to be locked when executing an SQL statement like `SELECT * FROM table WHERE i > 10 FOR UPDATE;`. The tuples returned by the query are internally locked with an exclusive lock (`LOCK_TUPLE_EXCLUSIVE`). Another transaction attempting to lock the same tuples must wait until the first transaction releases the locks.

In this article, we discuss the tool `pg_row_lock_tracer`, which uses eBPF and UProbes to trace PostgreSQL's row-locking behavior. The tool can be downloaded from the [pg-lock-tracer project website](https://github.com/jnidzwetzki/pg-lock-tracer).

This is the third article in a series about tracing PostgreSQL locks. The first article covers the [tracing of heavyweight locks](/2023/01/11/trace-postgresql-locks-with-pg-lock-tracer.html), and the second article focuses on [LW locks](/2023/01/17/trace-postgresql-lw-locks.html).

<!--more-->

## Background
PostgreSQL implements [four different row lock modes](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS). These can be requested by adding `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`, or `FOR KEY SHARE` to a SELECT statement. Additionally, operations like updates automatically acquire these locks before modifying a tuple. For example, when a transaction successfully performs a `FOR UPDATE` lock on a tuple, an update operation by another parallel transaction is blocked until the first transaction releases the lock. Row locks can be requested by calling the function [heapam_tuple_lock](https://github.com/postgres/postgres/blob/2a6b47cb50eb9b62b050de2cddd03a9ac267e61f/src/backend/access/heap/heapam_handler.c#L359).

### Lock Types
Internally, these locks are called `LockTupleKeyShare`, `LockTupleShare`, `LockTupleNoKeyExclusive`, and `LockTupleExclusive`. They are defined in the enum [LockTupleMode](https://github.com/postgres/postgres/blob/f0827b443e6014a9d9fdcdd099603576154a3733/src/include/nodes/lockoptions.h#L49). These locks have varying strengths, and some are _compatible_ (i.e., multiple transactions can hold locks simultaneously on the same row), while others are _conflicting_ (i.e., only one lock can be held at a time, and a conflicting lock request must wait).

### Lock Behavior
Users can specify various lock behaviors in addition to different lock modes. For instance, if a tuple is already locked and a second transaction requests a conflicting lock, the user can choose to skip the lock instead of waiting. The possible behaviors are defined in the enum [LockWaitPolicy](https://github.com/postgres/postgres/blob/f0827b443e6014a9d9fdcdd099603576154a3733/src/include/nodes/lockoptions.h#L36).

For example, the following SQL query acquires a `LockTupleExclusive` row lock if it does not conflict with existing locks. Any already locked tuples are skipped by the current transaction:

```sql
SELECT * FROM table WHERE i > 10 FOR UPDATE SKIP LOCKED;
```

A transaction that successfully acquires these locks can assume that no other transaction will modify the tuples in parallel. The returned values from the SELECT statement can then be processed, modified, and updated in subsequent UPDATE statements before being committed.

### Lock Results
The possible outcomes of a lock operation are defined in the enum [TM_Result](https://github.com/postgres/postgres/blob/f0827b443e6014a9d9fdcdd099603576154a3733/src/include/access/tableam.h#L71). A lock can be granted (`TM_Ok`), or it may fail for various reasons: the tuple is invisible to the current snapshot (`TM_Invisible`), already modified by the same backend process (`TM_SelfModified`), updated (`TM_Updated`), or deleted (`TM_Deleted`). Additionally, if the lock is instructed not to wait, it may return `TM_BeingModified` if another transaction is currently modifying the tuple, or `TM_WouldBlock` if the lock would otherwise block.

## pg_row_lock_tracer
`pg_row_lock_tracer` enables real-time tracing of PostgreSQL row-level locks using eBPF and UProbes. It also provides statistics about requested locks and their outcomes.

## Download and Usage

The lock tracer can be installed via the Python package installer `pip`:

```shell
pip install pg-lock-tracer
```

Once installed, the locks of one or more running processes can be traced:

```
# Trace the row locks of the given PostgreSQL binary
pg_row_lock_tracer -x /home/jan/postgresql-sandbox/bin/REL_14_9_DEBUG/bin/postgres

# Trace the row locks of PID 1234
pg_row_lock_tracer -p 1234 -x /home/jan/postgresql-sandbox/bin/REL_14_9_DEBUG/bin/postgres

# Trace the row locks of PIDs 1234 and 5678
pg_row_lock_tracer -p 1234 -p 5678 -x /home/jan/postgresql-sandbox/bin/REL_14_9_DEBUG/bin/postgres

# Trace the row locks of PID 1234 with verbose output
pg_row_lock_tracer -p 1234 -x /home/jan/postgresql-sandbox/bin/REL_14_9_DEBUG/bin/postgres -v

# Trace the row locks and display statistics
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

The tool's output shows the tuples being locked, the type of locks used, and additional options such as `LOCK_WAIT_BLOCK`. It also includes the result of the lock operation (`TM_OK`).

When the `--statistics` option is used, the tool collects and displays statistics about the traced locks upon termination (e.g., after pressing CTRL+C):

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
`pg_row_lock_tracer` is a tool for tracing PostgreSQL row-level locks. It is available for download on [GitHub](https://github.com/jnidzwetzki/pg-lock-tracer/). Using eBPF and UProbes, it enables real-time tracing of row lock activity. Like its related tools (`pg_lock_tracer` and `pg_lw_lock_tracer`), it is designed for debugging and analyzing lock behavior and performance issues.

This is the third article in a series about tracing PostgreSQL locks. The first part discusses a lock tracer for heavyweight locks, while the second part focuses on tracing LW locks.