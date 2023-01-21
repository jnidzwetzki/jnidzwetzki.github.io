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
`pg_lw_lock_trace` is a tracer for lightweight locks. It allows attaching to a running PostgreSQL process and trace (see the lock and unlock) events of lightweight locks. A LWLock can [be taken](https://github.com/postgres/postgres/blob/c9f7f926484d69e2806e35343af7e472fadfede7/src/include/storage/lwlock.h#L113) as a shared `LW_SHARED` or as an exclusive `LW_EXCLUSIVE` lock. In addition, a special `LW_WAIT_UNTIL_FREE` mode is implemented in PostgreSQL to wait until a LWLock [becomes free](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L1593).

## Trace Points

All of these lock events are traced by `pg_lw_lock_trace` and shown in real-time. The tool uses _Userland Statically Defined Tracing_ (USDT) to trace these events. These are [static trace point](https://www.postgresql.org/docs/current/dynamic-trace.html) that are defined in the [source code of PostgreSQL](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L1685). To enable this functionality, PostgreSQL has to be compiled with `--enable-dtrace`.

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
[2057969] Locking 23077 / mode LW_EXCLUSIVE
[2057969] Unlocking 23077
[2057969] Locking 24302 / mode LW_SHARED
[2057969] Unlocking 24302
[2057969] Locking 23077 / mode LW_EXCLUSIVE
[2057969] Unlocking 23077
[2057969] Locking 24302 / mode LW_SHARED
[2057969] Unlocking 24302
[2057969] Locking 24295 / mode LW_EXCLUSIVE
[2057969] Unlocking 24295
[2057969] Locking 23104 / mode LW_EXCLUSIVE
[2057969] Unlocking 23104
```

When the option `--statistics` is used, statistics about the traced locks are shown during the termination of the tool. A [tranche](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/storage/lmgr/lwlock.c#L115) is the identifier of the resource that is protected by the lock.

```
Lock statistics:
================

Locks per tranche
+--------------+----------+
| Tranche Name | Requests |
+--------------+----------+
|    43492     |    2     |
|    43502     |    1     |
|    43557     |    4     |
|    43570     |    1     |
|    43584     |    2     |
|    44775     |    1     |
|    44782     |    2     |
+--------------+----------+

Locks per type
+--------------+----------+
|  Lock type   | Requests |
+--------------+----------+
| LW_EXCLUSIVE |    10    |
|  LW_SHARED   |    3     |
+--------------+----------+
```

## Summary
`pg_lw_lock_trace` is a tracer for PostgreSQL lightweight locks. The tool is available [on GitHub](https://github.com/jnidzwetzki/pg-lock-tracer/) for download. It uses _Userland Statically Defined Tracing_ to trace the LWLock activity in real-time. A description of a lock tracer for heavyweight locks can be found in the [first part](/2023/01/11/trace-postgresql-locks-with-pg-lock-tracer.html) of this article series about locks.