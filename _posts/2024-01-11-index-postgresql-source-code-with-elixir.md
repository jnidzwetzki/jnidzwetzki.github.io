---
layout: post
title: >
    Index the PostgreSQL source code with Elixir
tags: [PostgreSQL, Development]
author: jan
excerpt_separator: <!--more-->
---

While working with the internals of PostgreSQL, it is helpful to be able to navigate around the source code quickly and look up symbols and definitions fast. I use VS Studio code for programming. However, finding definitions does not always work reliably, and the full-text search is slow and often returns many results and not the desired hot (e.g., a definition of a function). For a long time, I had the [Doxygen build](https://doxygen.postgresql.org/) of PostgreSQL open in my browser. However, Doxygen is sometimes cumbersome to use and it only shows the current version of PostgreSQL. Sometimes, the source code for an older version is needed. To solve these problems, I set up a local copy of the [Elixir Cross Referencer](https://github.com/bootlin/elixir). 

<!--more-->

The [Elixir Cross Referencer](https://github.com/bootlin/elixir) is a source code indexer that provides a web interface and an API to quickly look up symbols. I used it several times when I navigated through the [Linux source code](https://elixir.bootlin.com/linux/latest/source), and I was wondering what needs to be done to set up a local installation for PostgreSQL.

To my surprise, this is easier than expected. Elixir can be installed using Docker, and custom images for new projects can be created easily. For instance, to create a new Docker image which contains a copy of the PostgreSQL source code, the following commands have to be executed:

```
git clone https://github.com/bootlin/elixir.git

cd elixir

docker build -t elixir:postgresql-11-01-2024 --build-arg GIT_REPO_URL=https://github.com/postgres/postgres.git --build-arg PROJECT=postgresql . -f docker/debian/Dockerfile
```

The last command builds a new Docker image called `elixir:postgresql-11-01-2024`. This command takes some time to complete. The two `build-arg` parameters are enough to clone and index the PostgreSQL repository. After the image is created, it should be shown as an available image of the local Docker installation.

```
$ docker images

REPOSITORY                                                       TAG                     IMAGE ID       CREATED        SIZE
elixir                                                           postgresql-11-01-2024   fb993f66c1cc   2 hours ago    2.38GB
```

Afterward, a new container with the image can be started. I use the parameter `-p 8081:80` to make port 80 of the container available as port 8081 of my local system.

```
docker run elixir:postgresql-11-01-2024 -d -p 8081:80
```

After the container is started, the PostgreSQL source code an be accessed by opening the URL `http://172.17.0.2:8081/postgresql/latest/source`. 

{% include aligner.html images="elixir-postgresql.jpg" %}

If you want to modify the header of the Elixir installation, you can modify the file `templates/header.html` before building the Docker image. More information about customizing the image can be found in [the documentation](https://github.com/bootlin/elixir#building-docker-images) of the project.

