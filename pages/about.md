---
layout: page
title: About Me
permalink: /about/
feature-img: "assets/img/pexels/travel.jpeg"
tags: [Page]
position: 2
---

# Hi there 👋

I'm Jan — a software engineer and computer scientist ([Dr. rer. nat.](https://www.fernuni-hagen.de/universitaet/stimmen/nidzwetzki.shtml)) working on **database internals, mostly PostgreSQL**. My research background is in spatial and spatio-temporal data management — storing and querying spatial and multi-dimensional data at scale. I'm based in Hamburg, Germany, and have over 25 years of industry experience.

Today I work on PostgreSQL internals at [PlanetScale](https://planetscale.com/). Before that I worked on database internals at [Nile](https://www.thenile.dev/) and [Timescale](https://timescale.com/), and I hold a Dr. rer. nat. for a thesis on distributed databases. On this blog I write about database internals, profiling (perf, flame graphs, eBPF), and query optimization.

- 📫 Contact: jnidzwetzki@gmx.de
- 🔗 [LinkedIn](https://www.linkedin.com/in/jnidzwetzki) - [GitHub](https://github.com/jnidzwetzki) - [Google Scholar](https://scholar.google.com/citations?hl=en&user=8u8bUJYAAAAJ)
- ⚡ Fun fact: the first Linux distribution I ever installed was SuSE 6.1 (Kernel 2.2.6), in 1999. My first computer had a 100 MHz Pentium 1 and 16 MB RAM and otherwise ran Windows 95.

# Projects

Open-source tools I have built or maintain. See the [portfolio](/portfolio/) for the full list and screenshots.

**PostgreSQL tooling**

- [pg_lock_tracer](/portfolio/pglocktracer) — A collection of tools to trace PostgreSQL lock internals (heavyweight locks, LWLocks, row-level locks) using eBPF.
- [pg_plan_alternatives](/portfolio/pgplanalternatives) — Show every alternative plan considered by the PostgreSQL optimizer during planning, using eBPF to instrument the optimizer.
- [Query Plan Explorer](/portfolio/queryplanexplorer) — Visualize PostgreSQL query plan flips and plan stability across different parameter values.

**Research databases**

- [SECONDO](/portfolio/secondo) — I maintain the kernel of this extensible DBMS for spatial and spatio-temporal data, developed at the FernUniversität in Hagen.
- [BBoxDB](/portfolio/bboxdb) — A distributed key-bounding-box-value store for multi-dimensional data (e.g., spatial and spatio-temporal data), built from scratch as my PhD project. BBoxDB Streams adds continuous range queries and spatial joins over data streams.
- [Distributed SECONDO](/portfolio/distributed-secondo) — A distributed version of SECONDO on top of Apache Cassandra, built for my master's thesis.

# Curriculum Vitae

- **2026–present — Software Engineer, [PlanetScale](https://planetscale.com/)** — PostgreSQL internals (internal and community work).

- **2024–2026 — Founding Engineer, [Nile](https://www.thenile.dev/)** — a tenant-aware, storage/compute-decoupled and distributed version of PostgreSQL. My work focused on decoupling compute from storage by streaming and decoding WAL, tenant-aware query routing across compute nodes, and planner changes to keep per-tenant queries efficient on shared tables.

- **2022–2024 — Software Engineer, [Timescale](https://timescale.com/)** — a time-series extension for PostgreSQL. My [contributions](https://github.com/timescale/timescaledb/commits?author=jnidzwetzki) focused on planner improvements, custom scan nodes, join pushdown support for the multi-node version, faster continuous aggregates, and the first [SIMD-accelerated](https://github.com/timescale/timescaledb/commit/a094f175eb7c98173c78f557880ccd2d89b791f8) vectorized functions.

- **2014–2022 — Dr. rer. nat. in Computer Science, FernUniversität in Hagen** (part-time) — [thesis](https://ub-deposit.fernuni-hagen.de/receive/mir_mods_00001836) on distributed databases, awarded [best PhD thesis](https://www.fernuni-hagen.de/universitaet/themen/dies-academicus-2022-abstracts.shtml) of the year by the Faculty of Mathematics and Computer Science. Created [BBoxDB](/portfolio/bboxdb) and [Distributed SECONDO](/portfolio/distributed-secondo), and contributed to the [SECONDO](/portfolio/secondo) extensible database system.

- **2009–2014 — B.Sc. & M.Sc. Computer Science, FernUniversität in Hagen** (part-time) — focus on operating systems and distributed and cooperative systems; master's thesis [recognized](https://www.springer.com/de/book/9783658124434) by Springer as one of the best of the year.

- **Earlier** — Staatlich geprüfter Informatiker (DAA Technical College, 2006–2009, completed while working full-time) and an apprenticeship as IT Specialist for System Integration (2002–2005). Earlier roles spanned system administration, network administration, software development, and a CTO position.

For more detail, see my [LinkedIn](https://www.linkedin.com/in/jnidzwetzki) profile.

# Interests

* Database systems and operating systems
* Software architecture — especially distributed, scalable, and fault-tolerant systems
* Performance optimization, profiling, and benchmarking
* Economics, financial markets, and algorithmic trading systems

# Selected Publications and Talks

A full list is on [Google Scholar](https://scholar.google.com/citations?hl=en&user=8u8bUJYAAAAJ) or [DBLP](https://dblp.org/pid/166/7698.html).

### Talks

* Profiling PostgreSQL: perf, Flame Graphs, and eBPF Tools in Practice - [PostgreSQL Conference Germany 2026](https://www.postgresql.eu/events/pgconfde2026/schedule/session/7538-profiling-postgresql-perf-flame-graphs-and-ebpf-tools-in-practice/) / [Slides](https://www.postgresql.eu/events/pgconfde2026/sessions/session/7538/slides/858/pg_conf_ger_2026.pdf)
* Handling Time-Series Data in a Relational DBMS: Challenges and Solutions - [Keynote at GvDB 2024](https://ceur-ws.org/Vol-3710/invited2.pdf)

### Publications

* Large Language Models, Agents, and the MCP in Database Development - [Datenbank-Spektrum 2026](https://rdcu.be/fl2Ez)
* Unfair by design: eBPF-based scheduling of mixed database workloads - [Pre-print on arxiv.org](https://arxiv.org/abs/2605.02377) (co-author)
* BBoxDB Streams: Scalable Processing of Multi-Dimensional Data Streams - [Distributed and Parallel Databases 2022](https://doi.org/10.1007/s10619-022-07408-8)
* Distributed Arrays: An Algebra for Generic Distributed Query Processing - [Distributed and Parallel Databases 2021](https://link.springer.com/article/10.1007/s10619-021-07325-2) (co-author)
* BBoxDB Streams: Distributed Processing of Real-World Streams of Position Data - [EDBT 2021](https://edbt2021proceedings.github.io/docs/p170.pdf) / [Slides](/assets/downloads/bboxdb_streams_edbt2021_slides.pdf)
* BBoxDB: A Distributed and Highly Available Key-Bounding-Box-Value Store - [Distributed and Parallel Databases 2020](https://link.springer.com/article/10.1007/s10619-019-07275-w)
* Demo Paper: Large-Scale Spatial Data Processing With User-Defined Filters in BBoxDB - [IEEE Big Spatial Data 2019](https://ieeexplore.ieee.org/document/9005999) / [Poster](/assets/downloads/bsd2019_poster.pdf) / [Slides](/assets/downloads/bboxdb_udf_slides_ieee_bigdata_2019.pdf) — won the IEEE Best Demo and Short Paper Award
* BBoxDB - A Scalable Data Store for Multi-Dimensional Big Data - [CIKM 2018](https://dl.acm.org/citation.cfm?id=3269208) / [Poster](/assets/downloads/cikm2018_poster.pdf)
* Distributed SECONDO: An Extensible and Scalable Database Management System - [Distributed and Parallel Databases 2017](https://link.springer.com/article/10.1007%2Fs10619-017-7198-9)
* Distributed SECONDO: A Highly Available and Scalable System for Spatial Data Processing - [SSTD 2015](https://link.springer.com/chapter/10.1007%2F978-3-319-22363-6_28) / [Poster](/assets/downloads/sstd2015_poster.pdf)
* Optimierte Speicherzuteilung an Operatoren in Datenbanksystemen (_Optimized Memory Allocation to Operators in Database Systems_) - [Informatiktage 2013](https://dl.gi.de/handle/20.500.12116/4635) / [Poster](/assets/downloads/gi2013_poster.pdf)

### Theses

* BBoxDB: A Distributed Key-Bounding-Box-Value Store - [My PhD Thesis](https://ub-deposit.fernuni-hagen.de/receive/mir_mods_00001836)
* Distributed SECONDO - A Distributed DBMS Based on SECONDO and Apache Cassandra - [My Master Thesis](https://www.springer.com/de/book/9783658124434)
* Operator Cost Models for Progress Estimation and Optimization in Database Systems - My Bachelor Thesis

# GPG Key
* Jan Nidzwetzki &lt;jnidzwetzki@gmx.de&gt;
* Fingerprint: `A8FA E105 7812 65C5 7A53 58C9 918E 92F4 0507 962E`
* Full key: [keys.openpgp.org](https://keys.openpgp.org/search?q=jnidzwetzki@gmx.de)

<details markdown="1">
<summary>Public key block</summary>

```
-----BEGIN PGP PUBLIC KEY BLOCK-----

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
=JqBO
-----END PGP PUBLIC KEY BLOCK-----
```

</details>

```
                           .-----.
                          ( Hello )
                          /`-----'
       _.---._    /\\    /
    ./'       "--`\//   /
  ./              o \  /
 /./\  )______   \__ \
./  / /\ \   | \ \  \ \
   /_/  \_\  |_|\_\  \7
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

