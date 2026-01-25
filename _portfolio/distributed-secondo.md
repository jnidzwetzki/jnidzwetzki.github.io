---
layout: post
title: Distributed SECONDO - A Distributed Extensible Database System
img: "assets/img/portfolio/distributed_secondo.png"
date: 27 September 2015
---

I have created [Distributed SECONDO](https://secondo-database.github.io/DSecondo/DSECONDO-Website/index.html), a distributed version of the [SECONDO](https://secondo-database.github.io/) database management system. Distributed SECONDO is a research prototype and extends the capabilities of SECONDO by enabling it to operate in a distributed computing environment, allowing for the management and querying of large-scale spatial and spatio-temporal data across multiple nodes. It uses Apache Cassandra as the underlying distributed storage system, providing scalability, job scheduling, and fault tolerance.

I started the development of Distributed SECONDO during my time as a master student at the University of Hagen. The project was part of my master's thesis, which is awarded as one of the best theses of the year 2014 by the publisher Springer. The thesis is avaialable as a book  ["Entwicklung eines skalierbaren und verteilten Datenbanksystems"](https://link.springer.com/book/10.1007/978-3-658-12444-1) (in German).

{% include aligner.html images="portfolio/dsecondo-book.webp,portfolio/distributed_secondo_ring.jpg" %}

More information can be found in the papers:

* [Distributed SECONDO: A Highly Available and Scalable System for Spatial Data Processing. SSTD 2015: 491-496](https://link.springer.com/article/10.1007/s10619-017-7198-9)
* [Distributed SECONDO: an extensible and scalable database management system. Distributed Parallel Databases 35(3-4): 197-248 (2017)](https://link.springer.com/chapter/10.1007/978-3-319-22363-6_28)