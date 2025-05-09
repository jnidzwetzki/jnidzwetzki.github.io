---
layout: post
title: >
    Activating Asserts in PostgreSQL
tags: [Howto, PostgreSQL]
author: jan
excerpt_separator: <!--more-->
---

The [PostgreSQL](https://www.postgresql.org/) database server contains many `Assert` statements in its code. These statements are additional checks that can be evaluated to ensure that the performed operations are executed as expected. However, evaluating these statements takes some CPU time. Therefore, they are disabled in most production environments. 

<!--more-->
PostgreSQL is a very extensible and pluggable software. The PostgreSQL server can be extended through extensions. These [PostgreSQL Extensions](https://www.postgresql.org/docs/13/sql-createextension.html) can also use `Assert` statements in their code. 

An example of such a statement is as follows:

```c
Assert(state->number_of_rows >= 0);
```

The `Assert` statements are implemented as C macros. If the condition is fulfilled, nothing happens. If the condition is not met, the software is interrupted, and an error message is logged.

These `Assert` macros are defined in the file `/usr/include/postgresql/12/server/c.h`:

```c
#ifndef USE_ASSERT_CHECKING
#define Assert(condition)       ((void)true)
[...]
#elif defined(FRONTEND)
[...]
#define Assert(p) assert(p)
[...]
#else
[...]
#define Assert(condition) Trap(!(condition), "FailedAssertion")
#endif
```

As shown in the listing, the `Assert` macros are only active if the `USE_ASSERT_CHECKING` option is set (or `FRONTEND` code is compiled). Otherwise, the `Assert` macro is replaced by `true` statements at compile time, which disables the evaluation of the `Assert` conditions. 

To check whether the current PostgreSQL installation evaluates `Assert` statements or not, the following command can be executed:

```bash
grep USE_ASSERT_CHECKING /usr/include/postgresql/12/server/pg_config.h
```

If this returns a value of `1`, the assertions are active. Additionally, all extensions compiled against this server will also evaluate the `Assert` statements.

## Recompiling PostgreSQL with Asserts Enabled

If the check above returns `0`, the PostgreSQL server needs to be recompiled. For Debian-based distributions, it is a good idea to modify and replace the existing Debian package. This ensures that the package behaves exactly like the original Debian package (e.g., includes the distribution's own patches and changes) with the only difference being that the `Assert` statements are checked.

To rebuild the PostgreSQL package, the source repositories must be included in the `/etc/apt/sources.list` file. Depending on whether the package is used from the Debian distribution or from the [PostgreSQL Apt repository](https://www.postgresql.org/download/linux/debian/), different source repositories must be included. 

```
# For the Debian repository
deb-src http://deb.debian.org/debian bullseye main
deb-src http://deb.debian.org/debian bullseye-updates main

# For the official PostgreSQL Apt repository
deb-src http://apt.postgresql.org/pub/repos/apt bullseye-pgdg main
```

In this example, PostgreSQL version 12.10 is used from the PostgreSQL Apt repository running on a Debian 11 distribution. To download and unpack the sources of the PostgreSQL server, the following commands can be used:

```bash
apt-get source postgresql-12
cd postgresql-12-12.10
```

Before the sources can be rebuilt, the necessary build dependencies need to be installed. This can be done as follows:

```bash
apt-get build-dep postgresql
```

Now, the sources can be compiled with the required `Assert` statements. To do this, the environment variable `DEB_BUILD_PROFILES` must be set to the value `pkg.postgresql.cassert`. This enables the required option `--enable-cassert` in the `configure` call during the build process. The build process can be started by executing `dpkg-buildpackage -rfakeroot`.

```bash
export DEB_BUILD_OPTIONS=nocheck
export DEB_BUILD_PROFILES=pkg.postgresql.cassert
dpkg-buildpackage -rfakeroot
```

After the software has been compiled, the following Debian packages should be created in the parent directory:

```bash
jan@debian11-work:~# ls -l *.deb
-rw-r--r-- 1 jan jan    61056 Mar  7 22:51 libecpg6_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan   110940 Mar  7 22:51 libecpg6-dbgsym_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan    19456 Mar  7 22:51 libecpg-compat3_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan    18508 Mar  7 22:51 libecpg-compat3-dbgsym_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan   285252 Mar  7 22:51 libecpg-dev_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan   231952 Mar  7 22:51 libecpg-dev-dbgsym_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan    47648 Mar  7 22:51 libpgtypes3_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan    88972 Mar  7 22:51 libpgtypes3-dbgsym_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan   179048 Mar  7 22:51 libpq5_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan   249980 Mar  7 22:51 libpq5-dbgsym_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan   142964 Mar  7 22:51 libpq-dev_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan 16277416 Mar  7 22:52 postgresql-12_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan 14727144 Mar  7 22:51 postgresql-12-dbgsym_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan  1444016 Mar  7 22:52 postgresql-client-12_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan  1726260 Mar  7 22:52 postgresql-client-12-dbgsym_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan  1892552 Mar  7 22:52 postgresql-doc-12_12.10-1.pgdg110+1_all.deb
-rw-r--r-- 1 jan jan    83916 Mar  7 22:52 postgresql-plperl-12_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan   151000 Mar  7 22:52 postgresql-plperl-12-dbgsym_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan   110372 Mar  7 22:52 postgresql-plpython3-12_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan   159572 Mar  7 22:52 postgresql-plpython3-12-dbgsym_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan    41536 Mar  7 22:52 postgresql-pltcl-12_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan    71884 Mar  7 22:52 postgresql-pltcl-12-dbgsym_12.10-1.pgdg110+1_amd64.deb
-rw-r--r-- 1 jan jan   993124 Mar  7 22:52 postgresql-server-dev-12_12.10-1.pgdg110+1_amd64.deb
```

These packages can be installed by calling `dpkg -i <filenames>` or all produced Debian packages can be installed by executing:

```bash
dpkg -i *.deb
```

Afterward, a PostgreSQL server with active `Assert` macros is installed. This can be verified by executing:

```bash
grep USE_ASSERT_CHECKING /usr/include/postgresql/12/server/pg_config.h
```
