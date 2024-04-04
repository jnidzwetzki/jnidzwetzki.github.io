---
layout: post
title: >
    Introduction to Snapshots and Tuple Visibility in PostgreSQL
tags: [PostgreSQL, Snapshots, MVCC]
author: jan
excerpt_separator: <!--more-->
---

Like many relational DBMSs, PostgreSQL uses multi-version concurrency control (MVCC) to support parallel running transactions and coordinate parallel access to tuples. Snapshots are used to determine which version of a tuple is visible in which transaction. Each transaction that modifies data, has a transaction ID (`txid`). Tuples are stored together with two attributes (`xmin`, `xmax`) that determine in which snapshots (and in which transactions) they are visible.

This blog post discusses some of the implementation details of snapshots.

<!--more-->

## Tuple Visibility

The following table is used in this article to illustrate how snapshots work in PostgreSQL.

```sql
CREATE TABLE temperature (
  time timestamptz NOT NULL,
  value float
);
```

So, let's insert the first record in this table. This is done by creating a new transaction, getting the current transaction ID if available, inserting a new tuple, getting the transaction ID again, and committing the transaction.

```sql
BEGIN;

SELECT * FROM txid_current_if_assigned();
 txid_current_if_assigned
--------------------------

(1 row)

INSERT INTO temperature VALUES(now(), 4);

SELECT * FROM txid_current_if_assigned();
 txid_current_if_assigned
--------------------------
                  5062286
(1 row)

COMMIT;
```

An important thing that can be seen in this example is that PostgreSQL only assigns a transaction ID to the transaction as soon as data is modified. This is done to prevent unneeded work and to prevent transaction IDs from exhaustion. Even if the transaction ID is a 32-bit integer, the value is exhausted at some point. PostgreSQL can deal with this overflow (i.e., tuples can be frozen to handle [transaction ID wrap-arounds](https://www.postgresql.org/docs/current/routine-vacuuming.html#VACUUM-FOR-WRAPAROUND) properly).

The [system attributes](https://www.postgresql.org/docs/16/ddl-system-columns.html) `xmin` and `xmax` determine the first transaction and the last transaction that are able to see a particular tuple. In addition, the `ctid` attribute shows the number of the tuple on the corresponding page. The values for these attributes are shown when they are mentioned explicitly in a `SELECT` statement:

```sql
SELECT xmin, xmax, ctid, * FROM temperature;
  xmin   | xmax |  ctid |             time              | value
---------+------+-------+-------------------------------+-------
 5062286 |    0 | (0,1) | 2024-04-02 22:06:03.035868+02 |     4
(1 row)
```

The output means that all transactions that have a transaction ID `>= 5062286` see this tuple. When the tuple is deleted, the `xmax` value is populated with the largest transaction ID that can see this tuple. The `ctid` of 0,1 means that the tuple is the first tuple on page 0. Now we delete the tuple:

```sql
BEGIN;

DELETE FROM temperature;

SELECT * FROM txid_current_if_assigned();
 txid_current_if_assigned
--------------------------
                  5062291
(1 row)

COMMIT;
```

However, when a `SELECT` statement is performed, nothing is returned, instead of a tuple with a populated `xmin` and `xmax` value.

```sql
SELECT xmin, xmax, ctid, * FROM temperature;
 xmin | xmax | ctid | time | value
------+------+------+------+-------
(0 rows)
```

The reason for this behavior is the internal scanner. If a tuple is not visible by the current transaction snapshot. To get these values from the tuple, we need to use more low-level tools instead of a simple `SELECT`. 

The [pageinspect](https://www.postgresql.org/docs/current/pageinspect.html) extension for PostgreSQL allows us to get all tuples that are stored on a page and also decode the internal flags and attributes. The extension needs to be loaded and afterward, the pages of a relation can be examined.

```sql
-- Load the extension
CREATE EXTENSION pageinspect;

-- Get the tuples of the first page of the relation 'temperature'
SELECT lp, t_xmin, t_xmax FROM heap_page_items(get_raw_page('temperature', 0));

 lp | t_xmin  | t_xmax
----+---------+---------
  1 | 5062286 | 5062291
```

The output shows that the first tuple of page 0 (the `ctid`  of `(0,1)` in the output above) has a `t_max` value of `5062291`, which is identical to the transaction ID, which has deleted the tuple. So, every transaction with a transaction ID larger than `5062291` does not see this tuple.

## Snapshots
When PostgreSQL scans a table, a snapshot has to be specified. See the `table_beginscan` function, which takes the snapshot data as the second parameter:

```c
static inline TableScanDesc table_beginscan(Relation rel,
    Snapshot snapshot, int nkeys, struct ScanKeyData *key)
```

### Internal Data Structures
Usually, the [transaction snapshot](https://github.com/postgres/postgres/blob/06c418e163e913966e17cb2d3fb1c5f8a8d58308/src/backend/utils/time/snapmgr.c#L216) is used as a parameter for this function. The structure [SnapshotData](https://github.com/postgres/postgres/blob/06c418e163e913966e17cb2d3fb1c5f8a8d58308/src/include/utils/snapshot.h#L142) contains all the information that are part of a snapshot. In this blog post, we will focus on the following attributes:

```c
typedef struct SnapshotData
{
  [...]
	/*
	 * An MVCC snapshot can never see the effects of XIDs >= xmax. It can see
	 * the effects of all older XIDs except those listed in the snapshot. xmin
	 * is stored as an optimization to avoid needing to search the XID arrays
	 * for most tuples.
	 */
	TransactionId xmin;			/* all XID < xmin are visible to me */
	TransactionId xmax;			/* all XID >= xmax are invisible to me */

	/*
	 * For normal MVCC snapshot this contains the all xact IDs that are in
	 * progress, unless the snapshot was taken during recovery in which case
	 * it's empty. For historic MVCC snapshots, the meaning is inverted, i.e.
	 * it contains *committed* transactions between xmin and xmax.
	 *
	 * note: all ids in xip[] satisfy xmin <= xip[i] < xmax
	 */
	TransactionId *xip;
	uint32		xcnt;			/* # of xact ids in xip[] */
  [...]
}
```

The field `xmin` defines the oldest active transaction in the system. All transactions with a txid lower than this value have already been committed. So, all tuples which have a lower txid should be visible in this snapshot. xmax contains the most recent transaction ID known by the snapshot. All tuples with a txid > xmax are invisible by the current snapshot. 

For what reason are the fields `xip` and `xcnt` needed? For the transaction IDs between `xmin` and `xmax`, it needs to be determined if the transaction was committed or in progress when the snapshot was created.

A DBMS processes the queries of multiple users. They can start transactions at any time. The start time and the commit time of these transactions are not ordered. This means that there might be transactions with a transaction ID larger than `xmin` that are already committed when the snapshot is created. However, some other transactions in the range `[xmin, xmax]` have still not been committed. Since the data of the committed and uncommitted transactions needs to be handled properly, an array of transaction IDs `xip` of the length `xcnt` is defined. It contains all transactions that are larger than `xmin` and lower than `xmax`, which were in progress when the snapshot was taken.

### Example

To illustrate the behavior, let's perform a practical example using three transactions. 

#### Transaction 1

```sql
BEGIN;

INSERT INTO temperature VALUES(now(), 5);

SELECT * FROM txid_current_if_assigned();
 txid_current_if_assigned
--------------------------
                  5062310
(1 row)
```

The first transaction inserts new data into the table `temperature` but stays uncommitted. The transaction has a transaction ID of `5062310`.

#### Transaction 2

```sql
BEGIN;

INSERT INTO temperature VALUES(now(), 5);

SELECT * FROM txid_current_if_assigned();
 txid_current_if_assigned
--------------------------
                  5062311
(1 row)
```

Also, the second transaction inserts data into the same table but also stays uncommitted. The ID of this transaction is `5062311`.

#### Transaction 3

```sql
SELECT * FROM pg_current_snapshot();
 pg_current_snapshot
---------------------
 5062310:5062310:
(1 row)
```

The third transaction uses the function `pg_current_snapshot` to get the current snapshot. The output of the function means that all changes by transactions with an ID lower than `5062310` are visible. Changes that are equal to or larger than transaction ID `5062310` are not visible, and no uncommitted transaction exists at this point.

So, what happened to the still pending transactions `5062310` and `5062311`? Since no further transactions have been committed so far in this demo system, PostgreSQL has not changed the current transaction ID. However, this can be changed:

```sql
 SELECT * FROM pg_current_xact_id_if_assigned();
 pg_current_xact_id_if_assigned
--------------------------------

(1 row)

SELECT * FROM pg_current_xact_id();
 pg_current_xact_id
--------------------
            5062312
(1 row)

SELECT * FROM pg_current_snapshot();
       pg_current_snapshot
---------------------------------
 5062310:5062313:5062310,5062311
(1 row)
```

In contrast to the function `pg_current_xact_id_if_assigned`, the function `pg_current_xact_id` forces to assign a transaction ID to the current transaction. In our case, this is `5062312`. The usage of this transaction ID also leads to an update of the snapshot. 

The first value stays the same. Still, all tuples that are modified by transactions with an ID lower than `5062310` are visible in the current snapshot. However, the upper limit (`xmax`) has changed. Now, all changes that are equal to or larger than `5062313` are not visible in the current snapshot. Since our transaction ID is `5062312`, it makes sense that these changes should not be visible. What about the new part `5062310,5062311`? This is the `xip` part of the snapshot and means that the two transactions, `5062310` and `5062311`, were uncommitted at the moment when the snapshot was taken. Therefore, these changes should also not be visible in the current snapshot. As soon as one of these transactions commits and we take a new snapshot, the transaction ID is removed from `zip,`, and therefore, the changes become visible in the current snapshot. 

### Exporting Snapshots

Another interesting feature of PostgreSQL is the ability to ¢[export snapshots](https://www.postgresql.org/docs/current/functions-admin.html) and load them in other sessions. The export of a snapshot can be done by calling the function `pg_export_snapshot`. The function returns the ID of the snapshot and creates a corresponding file in the `pg_snapshots` folder of the data directory.

```sql
BEGIN;

SELECT * FROM pg_export_snapshot();
 pg_export_snapshot
---------------------
 0000000C-000005F6-1
(1 row)
```

This file contains the same information as returned by `pg_current_snapshot`, which we discussed above. In addition, it contains further information about the used isolation level or the used database ID. 


```bash
$ cat ~/postgresql-sandbox/data/REL_15_1_DEBUG/pg_snapshots/0000000C-000005F6-1
vxid:12/1526
pid:1362769
dbid:706615
iso:1
ro:0
xmin:5062310
xmax:5062313
xcnt:2
xip:5062310
xip:5062311
sof:0
sxcnt:0
rec:0
```

This exported snapshot could be loaded into another transaction by calling `SET TRANSACTION SNAPSHOT 0000000C-000005F6-1` to run with the same snapshot as the transaction that created the snapshot.

### Snapshots and Transaction Isolation Level
Depending on the [isolation level](https://www.postgresql.org/docs/current/transaction-iso.html), the snapshot is taken when the transaction is started (_Repeatable read_) or for every statement in the transaction (_Read committed_). When a new snapshot is created for each statement inside of a transaction, the committed data from other transactions becomes visible in the current transaction. If only one snapshot is created for the entire transaction, the `xmax` value stays constant, no new data from transactions with a higher ID becomes visible, and reads are repeatable.


## Summary
This blog post discusses the basics of multi-version concurrency control in PostgreSQL. Afterward, snapshots are introduced and how they control the visibility of tuples. Also the integration with the table scan API is discussed.