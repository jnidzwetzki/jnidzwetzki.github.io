---
layout: post
title: >
    eBPF Tracing of PostgreSQL Spinlocks
tags: [PostgreSQL, Performance, eBPF, Profiling]
author: jan
excerpt_separator: <!--more-->
---

PostgreSQL uses a process-based architecture where each connection is handled by a separate process. Some data structures are shared between these processes, for example, the shared buffer cache or the write-ahead log (WAL). To coordinate access to these shared resources, PostgreSQL uses several locking mechanisms, including spinlocks. Spinlocks are intended for very short-term protection of shared structures: rather than immediately putting a waiting process to sleep, they busy-wait and repeatedly check whether the lock is free. Under contention, PostgreSQL also applies an adaptive backoff that can include brief sleeps.

This article explains what spinlocks are and how they are implemented in PostgreSQL. It also describes how spinlocks can be monitored and demonstrates how my new `pg_spinlock_tracer` [tool](https://github.com/jnidzwetzki/pg-lock-tracer) can be used to trace spinlock internals using eBPF.

<!--more-->

# What are Spinlocks?
When multiple processes need to access a shared resource, locks are used to ensure that only one process can modify the resource at a time. If a lock is not available, the waiting process is put to sleep until the lock can be acquired. This reduces CPU usage since the waiting process does not consume CPU cycles while sleeping. However, putting a process to sleep and waking it up again involves context switches, which take time and add latency to the operation. If the lock is expected to be held for a very short time, it may be more efficient for the waiting process to continuously check if the lock is available instead of sleeping. That is what spinlocks do: the lock spins in a loop, repeatedly checking the lock's status until it can be acquired. Using a spinlock avoids the sleep/wakeup latency but can consume CPU cycles while spinning. If the hardware has only a few CPU cores, spinning can waste CPU cycles and lead to worse overall performance.

# Implementation in PostgreSQL
The PostgreSQL implementation of spinlocks is mainly in `src/include/storage/s_lock.h` and `src/backend/storage/lmgr/s_lock.c`. The spinlock API provides four basic operations:

* `SpinLockInit`: Initializes a spinlock.
* `SpinLockAcquire`: Acquires a spinlock, blocking until it is available. 
* `SpinLockRelease`: Releases a spinlock.
* `SpinLockFree`: Checks if a spinlock is free.

_Note:_ `SpinLockAcquire` can also [raise a `FATAL` error](https://github.com/postgres/postgres/blob/7467041cde9ed1966cb3ea18da8ac119b462c2e4/src/backend/storage/lmgr/s_lock.c#L89) if the lock cannot be acquired within a certain time limit. In that case, the server terminates, performs recovery on restart, and becomes available again once recovery finishes.

## Using Spinlocks
To use a spinlock, it must first be initialized using `SpinLockInit`.

```c
slock_t mutex;
SpinLockInit(&mutex);
```

After initialization, the lock can be acquired and released as needed:

```c
SpinLockAcquire(&mutex);
/* critical section */
SpinLockRelease(&mutex);
```

To determine if a spinlock is currently held by another process, the function `SpinLockFree` can be used:

```c
if (!SpinLockFree(&mutex))
    /* lock is held by another process */
```

Spinlocks are used in several places in the PostgreSQL codebase, for example, to coordinate access in the write-ahead log (WAL) [implementation](https://github.com/postgres/postgres/blob/7467041cde9ed1966cb3ea18da8ac119b462c2e4/src/backend/access/transam/xlog.c#L1137) or during [checkpoints](https://github.com/postgres/postgres/blob/1653ce5236c4948550e52d15d54e4b6bb66a23b1/src/backend/postmaster/checkpointer.c#L426).

## Implementation Details
The implementation is split into a platform-independent part and platform-specific parts. The platform-independent code in `s_lock.c` defines the API and higher-level behavior, while `s_lock.h` pulls in platform-specific assembly implementations depending on the target architecture.

### Acquiring a Spinlock
To acquire a spinlock, PostgreSQL performs an atomic test-and-set (TAS) on the lock variable. The lock value is 0 when [free](https://github.com/postgres/postgres/blob/7467041cde9ed1966cb3ea18da8ac119b462c2e4/src/backend/storage/lmgr/s_lock.c#L118) and 1 when held. The TAS operation is atomic to avoid races where two processes both observe a free lock and try to acquire it simultaneously.

The platform-independent code for acquiring a lock [looks as follows](https://github.com/postgres/postgres/blob/7467041cde9ed1966cb3ea18da8ac119b462c2e4/src/backend/storage/lmgr/s_lock.c#L97C1-L112C2):

```c
int
s_lock(volatile slock_t *lock, const char *file, int line, const char *func)
{
	SpinDelayStatus delayStatus;

	init_spin_delay(&delayStatus, file, line, func);

	while (TAS_SPIN(lock))
	{
		perform_spin_delay(&delayStatus);
	}

	finish_spin_delay(&delayStatus);

	return delayStatus.delays;
}
```

A struct `SpinDelayStatus` is used to track the number of spins and delays (this will be discussed in the next section). The platform-dependent macro `TAS_SPIN` performs the fast-path check and the actual test-and-set operation on the lock variable. As long as the lock is held by another process, `TAS_SPIN` returns 1 and the loop continues, calling `perform_spin_delay` before the next attempt. Once the lock becomes available, `TAS_SPIN` returns 0 and the loop terminates.

The implementation of `TAS_SPIN` for the x86-64 architecture [looks as follows](https://github.com/postgres/postgres/blob/7467041cde9ed1966cb3ea18da8ac119b462c2e4/src/include/storage/s_lock.h#L216C1-L230C2):

```c
#define TAS_SPIN(lock)    (*(lock) ? 1 : TAS(lock))

static __inline__ int
tas(volatile slock_t *lock)
{
	slock_t		_res = 1;

	__asm__ __volatile__(
		"   lock         \n"
		"   xchgb  %0,%1 \n"
:		"+q"(_res), "+m"(*lock)
:		/* no inputs */
:		"memory", "cc");
	return (int) _res;
}
```

The macro `TAS_SPIN` first checks whether the lock variable is non-zero; if so, it returns 1 immediately without performing the atomic exchange. If the lock variable is 0, it calls `TAS(lock)` (which ultimately invokes `tas`) to perform the atomic test-and-set operation.

The `tas` function performs the atomic exchange using inline assembly. The `lock` prefix ensures the instruction is executed atomically across multiple CPU cores. The `xchgb` instruction swaps `_res` and the lock variable: `_res` starts at 1, so if the lock was free (0), the swap sets the lock to 1 and `_res` becomes 0 (success). If the lock was already 1, `_res` becomes 1 (failure to acquire). The function returns `_res` (0 on success, 1 on failure).

### Spinlock Contention
When the lock cannot be acquired, the [function `perform_spin_delay`](https://github.com/postgres/postgres/blob/7467041cde9ed1966cb3ea18da8ac119b462c2e4/src/backend/storage/lmgr/s_lock.c#L126) is invoked. It implements an adaptive backoff and looks like this:

```c
void
perform_spin_delay(SpinDelayStatus *status)
{
    [...]
	if (++(status->spins) >= spins_per_delay)
	{
		if (++(status->delays) > NUM_DELAYS)
			s_lock_stuck(status->file, status->line, status->func);

		if (status->cur_delay == 0) /* first time to delay? */
			status->cur_delay = MIN_DELAY_USEC;

		[...]
		pg_usleep(status->cur_delay);
		[...]

		/* increase delay by a random fraction between 1X and 2X */
		status->cur_delay += (int) (status->cur_delay *
			pg_prng_double(&pg_global_prng_state) + 0.5);

		/* wrap back to minimum delay when max is exceeded */
		if (status->cur_delay > MAX_DELAY_USEC)
			status->cur_delay = MIN_DELAY_USEC;

		status->spins = 0;
    }
}
```

On each invocation of the function, the number of spins is increased by one. If the number of spins exceeds a certain threshold (`spins_per_delay`), PostgreSQL sleeps for a few microseconds (`pg_usleep`) before the next attempt to acquire the lock. This turns PostgreSQL's spinlocks into a hybrid approach (spin first, then sleep) and serves as a safety mechanism to prevent excessive CPU usage under high contention. It is only performed after a certain number of spins, which indicates that the lock was held for an extended period by another process.

Additionally, the delay is increased by a random fraction between 1X and 2X on every delay, which means that the delay increases exponentially with the number of delays. If the delay exceeds a certain maximum value (`MAX_DELAY_USEC`, 1000000 microseconds by default), it is wrapped back to a minimum value (`MIN_DELAY_USEC`, 1000 microseconds by default). This prevents the delay from growing indefinitely and ensures that the process will eventually wake up and try to acquire the lock again. The random fraction adds jitter, which can help reduce contention by preventing multiple processes from waking up and trying to acquire the lock at the same time.

If the number of delays exceeds `NUM_DELAYS` (default 1000), PostgreSQL calls [s_lock_stuck](https://github.com/postgres/postgres/blob/7467041cde9ed1966cb3ea18da8ac119b462c2e4/src/backend/storage/lmgr/s_lock.c#L78-L92), which raises a `FATAL` error indicating that the lock appears stuck.

# Monitoring Spinlocks
Monitoring spinlocks and understanding spinlock contention can be crucial for diagnosing performance issues in PostgreSQL. In the following sections, an artificial spinlock contention is created and then observed using the `pg_stat_activity` view and the `pg_spinlock_tracer` tool.

_Note:_ This example should not be executed on a production system, since it will cause the server to become unresponsive and may eventually terminate due to the `FATAL` error raised by `s_lock_stuck`.

## Creating Artificial Spinlock Contention
To create such an artificial contention, two sessions to a database are opened. Afterward, two different tables are created:

```sql
CREATE TABLE data1 (id INT);
CREATE TABLE data2 (id INT);
```

Furthermore, a debugger is attached to the first session, and a breakpoint is set in `ReserveXLogInsertLocation`. This function is responsible for reserving space in the write-ahead log (WAL) for a new record. It uses a spinlock to coordinate access to the WAL insertion point. Afterward, the first session performs an `INSERT` statement, which will cause the process to acquire the spinlock in `ReserveXLogInsertLocation` and then wait at the breakpoint.

```sql
INSERT INTO data1 VALUES (1);
```

After the breakpoint is hit, the following statements should be executed in the debugger until the [line](https://github.com/postgres/postgres/blob/73dd7163c5d19f93b629d1ccd9d2a2de6e9667f6/src/backend/access/transam/xlog.c#L1137) `SpinLockAcquire(&Insert->insertpos_lck);` is executed. 

{% include aligner.html images="spinlock-gdb.png" %}

In the second session, another `INSERT` statement is executed, which will also try to acquire the same spinlock in `ReserveXLogInsertLocation` and wait for the lock to be released by the first session.

```sql
INSERT INTO data2 VALUES (1);
```

Two different tables are used to ensure that the contention is on the spinlock in `ReserveXLogInsertLocation` and not on another lock related to the table access.

## Using pg_stat_activity

The view `pg_stat_activity` of the [cumulative statistics system](https://www.postgresql.org/docs/18/monitoring-stats.html) provides information about the current activity of all sessions in the PostgreSQL server. Lock contention can also be seen in this view.

```sql
mydb=# SELECT pid, backend_start, wait_event_type, wait_event, state, query from pg_stat_activity;
   pid   |         backend_start         | wait_event_type |     wait_event      | state  |  query                                            
---------+-------------------------------+-----------------+---------------------+--------+-----------------------------
 2129513 | 2026-02-08 19:48:26.32229+01  |                 |                     | active | insert into data1 values(1);
 2129736 | 2026-02-08 19:49:00.578201+01 | Timeout         | SpinDelay           | active | insert into data2 values(1);
[...]
```

The output shows that the second session (PID 2129736) is waiting for a `SpinDelay`, which indicates that it is trying to acquire a spinlock but is currently delayed due to contention. More information about this view and the meaning of the different columns can be found in the [documentation](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW).

However, this view only provides a high-level overview of the lock contention and does not provide detailed information about the spinlock behavior, such as the number of spins and delays or the current delay value. For that, a more detailed tracing tool is needed.

## Tracing Spinlocks with pg_spinlock_tracer

To trace spinlock contention in PostgreSQL, I implemented `pg_spinlock_tracer` as part of the [pg-lock-tracer project](https://github.com/jnidzwetzki/pg-lock-tracer). The tool uses eBPF to instrument the `perform_spin_delay` function and prints the contents of the `SpinDelayStatus` struct. For instance, it reports the number of spins and delays, the current delay, and the source location where the spinlock is being attempted.

Unlike the PostgreSQL view, `pg_spinlock_tracer` shows the internals of spinlock acquisition and contention, which can be useful for understanding behavior. A simple output of the tool looks as follows:

```
$ pg_spinlock_delay_tracer -x /home/jan/postgresql-sandbox/bin/REL_17_1_DEBUG/bin/postgres
[...]
13180680737869452 [Pid 1864403] SpinDelay spins=996 delays=939 cur_delay=566086 at ReserveXLogInsertLocation, xlog.c:1132
13180680737874986 [Pid 1864403] SpinDelay spins=997 delays=939 cur_delay=566086 at ReserveXLogInsertLocation, xlog.c:1132
13180680737880522 [Pid 1864403] SpinDelay spins=998 delays=939 cur_delay=566086 at ReserveXLogInsertLocation, xlog.c:1132
13180680737886009 [Pid 1864403] SpinDelay spins=999 delays=939 cur_delay=566086 at ReserveXLogInsertLocation, xlog.c:1132
13180681304189362 [Pid 1864403] SpinDelay spins=0 delays=940 cur_delay=661655 at ReserveXLogInsertLocation, xlog.c:1132
13180681304227806 [Pid 1864403] SpinDelay spins=1 delays=940 cur_delay=661655 at ReserveXLogInsertLocation, xlog.c:1132
13180681304241759 [Pid 1864403] SpinDelay spins=2 delays=940 cur_delay=661655 at ReserveXLogInsertLocation, xlog.c:1132
13180681304255150 [Pid 1864403] SpinDelay spins=3 delays=940 cur_delay=661655 at ReserveXLogInsertLocation, xlog.c:1132
[...]
```

The output shows that PID 1864403 (the second session to PostgreSQL) is trying to acquire a spinlock in `ReserveXLogInsertLocation` (xlog.c:1132). In the example, the process spins up to 999 times; once it reaches the threshold, it sleeps for `cur_delay` microseconds, and the spin counter is reset (visible as `spins=0`). The delay value then grows for subsequent attempts.

# Conclusion
This article provided an overview of spinlocks in PostgreSQL, their implementation details, and how to observe spinlock contention. Spinlocks are a crucial part of PostgreSQL's locking mechanism for short-term protection of shared resources. Understanding how they work and how to analyze contention can be valuable for diagnosing performance issues in PostgreSQL. The cumulative statistics system provides some insights into lock contention. The new `pg_spinlock_tracer` tool offers a more detailed view of the spinlock behavior and contention patterns.
