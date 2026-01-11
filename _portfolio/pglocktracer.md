---
layout: post
title: PostgreSQL Lock Tracer
img: "assets/img/portfolio/pglocktracer.png"
date: 31 December 2022
---

[PostgreSQL Lock Tracer](https://github.com/jnidzwetzki/pg-lock-tracer) is a collection of tools designed to provide deep insights into PostgreSQL's locking activities and help troubleshoot performance-related issues. It uses eBPF (extended Berkeley Packet Filter) technology to trace lock events of PostgreSQL processes in real-time with minimal overhead. It provides detailed information about lock acquisitions, wait times, and compiles statistics on the taken locks. Heavy locks, LWLocks, and row level locks are supported.

I wrote three blog posts about the project: 
 * [Part 1: Trace PostgreSQL locks with pg_lock_tracer](/2023/01/11/trace-postgresql-locks-with-pg-lock-tracer.html)
 * [Part 2: Trace PostgreSQL LWLocks with pg_lw_lock_tracer](/2023/01/17/trace-postgresql-lw-locks.html)
 * [Part 3: Trace PostgreSQL Row-Level Locks with pg_row_lock_tracer](/2024/02/28/trace-postgresql-row-level-locks.html)

{% include aligner.html images="portfolio/pglocktracer.png" %}