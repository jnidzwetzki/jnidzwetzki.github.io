---
layout: post
title: >
    Memory Contexts in PostgreSQL
tags: [Howto, PostgreSQL]
author: jan
excerpt_separator: <!--more-->
---

The [PostgreSQL](https://www.postgresql.org/) database server uses _memory 

<!--more-->


```C
AllocSetContextCreate(CurrentMemoryContext,
													 "DecompressChunk per_batch",
													 ALLOCSET_DEFAULT_SIZES);
```