---
layout: post
title: >
    Index the PostgreSQL Source Code with Elixir
tags: [PostgreSQL, Development]
author: jan
excerpt_separator: <!--more-->
---

When working with the internals of PostgreSQL, it is helpful to navigate the source code quickly and look up symbols and definitions efficiently. I use VS Code for programming. However, finding definitions does not always work reliably, and the full-text search is slow and often returns too many results, missing the desired hit (e.g., the definition of a function). For a long time, I kept the [Doxygen build](https://doxygen.postgresql.org/) of PostgreSQL open in my browser. However, Doxygen can be cumbersome to use and only shows the current version of PostgreSQL. Sometimes, the source code for an older version is needed. To address these issues, I set up a local copy of the [Elixir Cross Referencer](https://github.com/bootlin/elixir). 

<!--more-->

The [Elixir Cross Referencer](https://github.com/bootlin/elixir) is a source code indexer that provides a web interface and an API for quickly looking up symbols. I had used it several times while navigating the [Linux source code](https://elixir.bootlin.com/linux/latest/source) and wondered what it would take to set up a local installation for PostgreSQL.

To my surprise, it was easier than expected. Elixir can be installed using Docker, and custom images for new projects can be created effortlessly. For instance, to create a new Docker image containing a copy of the PostgreSQL source code, the following commands need to be executed:

```
$ git clone https://github.com/bootlin/elixir.git

$ cd elixir

$ docker build -t elixir:postgresql-11-01-2024 --build-arg GIT_REPO_URL=https://github.com/postgres/postgres.git --build-arg PROJECT=postgresql . -f docker/debian/Dockerfile
```

The last command builds a new Docker image called `elixir:postgresql-11-01-2024`. This process takes some time to complete. The two `build-arg` parameters are sufficient to clone and index the PostgreSQL repository. Once the image is created, it should appear as an available image in the local Docker installation.

```
$ docker images

REPOSITORY                                                       TAG                     IMAGE ID       CREATED        SIZE
elixir                                                           postgresql-11-01-2024   fb993f66c1cc   2 hours ago    2.38GB
```

Next, a new container can be started using the image. I use the parameter `-p 8081:80` to map port 80 of the container to port 8081 on my local system.

```
$ docker run elixir:postgresql-11-01-2024 -d -p 8081:80
```

Once the container is running, the PostgreSQL source code can be accessed by opening the URL `http://172.17.0.2:8081/postgresql/latest/source`.

{% include aligner.html images="elixir-postgresql.jpg,elixir-postgresql2.jpg" %}

If you want to customize the header of the Elixir installation, you can modify the file `templates/header.html` before building the Docker image. More information about customizing the image can be found in [the project's documentation](https://github.com/bootlin/elixir#building-docker-images).

