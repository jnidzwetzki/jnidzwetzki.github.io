---
layout: post
title: PG Plan Alternatives
img: "assets/img/portfolio/pg_plan_alternatives.svg"
date: 01 March 2026
---

The optimizer of PostgreSQL uses cost-based algorithms to determine the best execution plan for a given query. The query tree of a query can be inspected with the `EXPLAIN` command. However, PostgreSQL does not offer a way to inspect all alternative plans that the optimizer considered during the planning phase. [pg_plan_alternatives](https://github.com/jnidzwetzki/pg_plan_alternatives) uses eBPF to instrument the optimizer and trace all alternative plans that were considered during the planning phase. 

{% include aligner.html images="portfolio/pg_plan_alternatives.svg" %}