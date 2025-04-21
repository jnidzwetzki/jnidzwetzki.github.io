---
layout: post
title: >
    Introduction to Snapshots and Tuple Visibility in PostgreSQL
tags: [PostgreSQL, Snapshots, MVCC]
author: jan
excerpt_separator: <!--more-->
---

Like many relational DBMSs, PostgreSQL uses multi-version concurrency control (MVCC) to support parallel transactions and coordinate concurrent access to tuples. Snapshots are used to determine which version of a tuple is visible in a given transaction. Each transaction that modifies data has a transaction ID (`txid`). Tuples are stored with two attributes (`xmin`, `xmax`) that determine in which snapshots (and transactions) they are visible.

This blog post discusses some implementation details of snapshots.

<!--more-->

## Tuple Visibility

The following table is used in this article to illustrate how snapshots work in PostgreSQL.

```sql
CREATE TABLE temperature (
  time timestamptz NOT NULL,
  value float
);
```

Let's insert the first record into this table. This is done by creating a new transaction, checking the current transaction ID (if assigned), inserting a new tuple, checking the transaction ID again, and committing the transaction.

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

An important observation in this example is that PostgreSQL only assigns a transaction ID to a transaction when data is modified. This optimization prevents unnecessary work and avoids transaction ID exhaustion. Even though the transaction ID is a 32-bit integer, it can eventually be exhausted. PostgreSQL handles this overflow by freezing tuples to manage [transaction ID wraparounds](https://www.postgresql.org/docs/current/routine-vacuuming.html#VACUUM-FOR-WRAPAROUND) properly.

The [system attributes](https://www.postgresql.org/docs/16/ddl-system-columns.html) `xmin` and `xmax` determine the first and last transactions that can see a particular tuple. Additionally, the `ctid` attribute indicates the tuple's position on the corresponding page. These attributes are displayed when explicitly mentioned in a `SELECT` statement:

```sql
SELECT xmin, xmax, ctid, * FROM temperature;
  xmin   | xmax |  ctid |             time              | value
---------+------+-------+-------------------------------+-------
 5062286 |    0 | (0,1) | 2024-04-02 22:06:03.035868+02 |     4
(1 row)
```

The output indicates that all transactions with a transaction ID `>= 5062286` can see this tuple. When the tuple is deleted, the `xmax` value is updated with the transaction ID of the deleting transaction. The `ctid` value `(0,1)` means the tuple is the first on page 0. Now, let's delete the tuple:

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

However, when a `SELECT` statement is executed, no rows are returned, even though the tuple has `xmin` and `xmax` values.

```sql
SELECT xmin, xmax, ctid, * FROM temperature;
 xmin | xmax | ctid | time | value
------+------+------+------+-------
(0 rows)
```

This behavior is due to the internal scanner. If a tuple is not visible in the current transaction snapshot, it is skipped. To retrieve these values, we need to use lower-level tools instead of a simple `SELECT`.

The [pageinspect](https://www.postgresql.org/docs/current/pageinspect.html) extension for PostgreSQL allows us to examine all tuples stored on a page and decode their internal flags and attributes. After loading the extension, we can inspect the pages of a relation.

```sql
-- Load the extension
CREATE EXTENSION pageinspect;

-- Get the tuples of the first page of the relation 'temperature'
SELECT lp, t_xmin, t_xmax FROM heap_page_items(get_raw_page('temperature', 0));

 lp | t_xmin  | t_xmax
----+---------+---------
  1 | 5062286 | 5062291
```

The output shows that the first tuple on page 0 (with `ctid` `(0,1)`) has a `t_xmax` value of `5062291`, which matches the transaction ID that deleted the tuple. Thus, any transaction with a transaction ID greater than `5062291` will not see this tuple.

## Snapshots

When PostgreSQL scans a table, a snapshot must be specified. The `table_beginscan` function takes the snapshot data as its second parameter:

```c
static inline TableScanDesc table_beginscan(Relation rel,
    Snapshot snapshot, int nkeys, struct ScanKeyData *key)
```

### Internal Data Structures

Typically, the [transaction snapshot](https://github.com/postgres/postgres/blob/06c418e163e913966e17cb2d3fb1c5f8a8d58308/src/backend/utils/time/snapmgr.c#L216) is used as a parameter for this function. The structure [SnapshotData](https://github.com/postgres/postgres/blob/06c418e163e913966e17cb2d3fb1c5f8a8d58308/src/include/utils/snapshot.h#L142) contains all the information that is part of a snapshot. In this blog post, we focus on the following attributes:

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

The `xmin` field defines the oldest active transaction in the system. All transactions with a transaction ID lower than this value have already been committed. Thus, all tuples with a lower transaction ID should be visible in this snapshot. The `xmax` field contains the most recent transaction ID known to the snapshot. All tuples with a transaction ID greater than `xmax` are invisible in the current snapshot.

Why are the `xip` and `xcnt` fields needed? For transaction IDs between `xmin` and `xmax`, it must be determined whether the transaction was committed or in progress when the snapshot was created.

A DBMS processes queries from multiple users, who can start transactions at any time. The start and commit times of these transactions are not ordered. This means there might be transactions with a transaction ID larger than `xmin` that were already committed when the snapshot was created. However, some other transactions in the range `[xmin, xmax]` might still be uncommitted. Since the data of committed and uncommitted transactions must be handled properly, an array of transaction IDs `xip` of length `xcnt` is defined. It contains all transactions larger than `xmin` and lower than `xmax` that were in progress when the snapshot was taken.

### Example

To illustrate this behavior, let's perform a practical example using three transactions.

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

The first transaction inserts new data into the `temperature` table but remains uncommitted. The transaction has a transaction ID of `5062310`.

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

The second transaction also inserts data into the same table but remains uncommitted. The transaction ID is `5062311`.

#### Transaction 3

```sql
SELECT * FROM pg_current_snapshot();
 pg_current_snapshot
---------------------
 5062310:5062310:
(1 row)
```

The third transaction uses the `pg_current_snapshot` function to get the current snapshot. The output indicates that all changes by transactions with an ID lower than `5062310` are visible. Changes equal to or larger than transaction ID `5062310` are not visible, and no uncommitted transactions exist at this point.

So, what happened to the still-pending transactions `5062310` and `5062311`? Since no further transactions have been committed in this demo system, PostgreSQL has not changed the current transaction ID. However, this can be changed:

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

Unlike the `pg_current_xact_id_if_assigned` function, the `pg_current_xact_id` function forces the assignment of a transaction ID to the current transaction. In this case, the transaction ID is `5062312`. Using this transaction ID also updates the snapshot.

The first value remains the same: all tuples modified by transactions with an ID lower than `5062310` are visible in the current snapshot. However, the upper limit (`xmax`) has changed. Now, all changes equal to or larger than `5062313` are not visible in the current snapshot. Since our transaction ID is `5062312`, it makes sense that these changes should not be visible. What about the new part `5062310,5062311`? This is the `xip` part of the snapshot, indicating that transactions `5062310` and `5062311` were uncommitted when the snapshot was taken. Therefore, these changes should also not be visible in the current snapshot. As soon as one of these transactions commits and we take a new snapshot, the transaction ID is removed from `xip`, and the changes become visible in the current snapshot.

### Exporting Snapshots

Another interesting feature of PostgreSQL is the ability to [export snapshots](https://www.postgresql.org/docs/current/functions-admin.html) and load them in other sessions. A snapshot can be exported by calling the `pg_export_snapshot` function. The function returns the snapshot ID and creates a corresponding file in the `pg_snapshots` folder of the data directory.

```sql
BEGIN;

SELECT * FROM pg_export_snapshot();
 pg_export_snapshot
---------------------
 0000000C-000005F6-1
(1 row)
```

This file contains the same information as returned by `pg_current_snapshot`, which we discussed earlier. Additionally, it includes further information about the isolation level and the database ID.

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

This exported snapshot can be loaded into another transaction by calling `SET TRANSACTION SNAPSHOT '0000000C-000005F6-1'` to run with the same snapshot as the transaction that created it.

### Snapshots and Transaction Isolation Level

Depending on the [isolation level](https://www.postgresql.org/docs/current/transaction-iso.html), the snapshot is taken when the transaction starts (_Repeatable Read_) or for every statement in the transaction (_Read Committed_). When a new snapshot is created for each statement inside a transaction, committed data from other transactions becomes visible in the current transaction. If only one snapshot is created for the entire transaction, the `xmax` value remains constant, no new data from transactions with a higher ID becomes visible, and reads are repeatable.

## Summary

This blog post discusses the basics of multi-version concurrency control in PostgreSQL. It then introduces snapshots and explains how they control the visibility of tuples. The integration with the table scan API is also discussed.