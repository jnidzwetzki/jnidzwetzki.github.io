---
layout: post
title: >
    Memory Contexts in PostgreSQL
tags: [Howto, PostgreSQL]
author: jan
excerpt_separator: <!--more-->
---

The [PostgreSQL](https://www.postgresql.org/) database server is written in the programming language C. This article describes how dynamic memory is handled in the PostgreSQL database server. In contrast to plain C programs, `MemoryContexts` are used.

<!--more-->

The PostgreSQL database server is written in C, like many database management systems. This programming language does not contain a _garbage collector_ and offers the developer with the functions `malloc()` and `free()` a way to request and release memory dynamically. Even though this is a well-known concept, handling memory this way is error-prone because the developer is responsible for keeping track of the memory allocations. When memory is requested and no longer be used, it has to be manually released (i.e., by calling `free()`). If the memory is not released, it stays allocated even when no reference to this memory area exists. This is called a [memory-leak](https://en.wikipedia.org/wiki/Memory_leak). When the program executes the same error-prone block, again and again, the consumed amount of memory grows and grows until all available memory is requested and the operating system (i.e., the [Out Of Memory Killer](https://www.kernel.org/doc/gorman/html/understand/understand016.html) terminates the program).

Memory leaks and the risk of being terminated by the operating system are problematic for long-running processes such as database servers. To solve this problem, PostgreSQL uses memory contexts to keep track of requested memory.

## MemoryContexts

The idea of a memory context is is manage the memory allocations together with their lifetime. Memory contexts are created at certain points in the code during the processing of a query and released afterward. For example, the _PerTupleContext_ is created and released (or reset, which means the context still exists, but all objects of this context are freed) after each processed tuple. 

Each context has a name and a parent context. When a memory context is released, all memory allocations of the memory context and its child contexts are released. The advance is that all objects that belong are released at once, and the programmer does not have to free every object. This is less error-prone than tracking the lifetime of each object and deleting it at the right moment. Some DBMS use techniques like _reference counter_ (e.g., calling `IncRef()` when the object is used and calling `DeleteIfAllowed()` when the object is no longer used) to keep track of the lifetime of an object. However, these counters have to be adequately updated to ensure the object is deleted at the right moment. Each code path has to call the right amount of increments and decrements, which is also an error-prone way to manage the lifetime of the objects. Creating and deleting memory context are done less often than creating and deleting objects. So, it is much easier to ensure these operations are called correctly. 

During query processing PostgreSQL creates at least the following memory contexts: `CurTransactionContext`, `PerPlanNodeContext`, `PerTupleContext`, and `PerAggreGateContext`. A memory allocation should always be made in the context with the shortest lifetime to free memory as early as possible.

## Create and use MemoryContexts

Memory allocations in PostgreSQL are performed by calling the function `palloc(Size size)`, which allocates memory in the _CurrentMemoryContext_. The function `palloc0(Size size)` does the same, but zeros (initializes the memory with 0) the allocated memory context. The functions `MemoryContextAlloc(MemoryContext context, Size size)` and `MemoryContextAllocZero(MemoryContext context, Size size)` do almost the same, but the memory allocation is performed in the memory context that is passed to the first parameter of the function. If memory should be released before the context is freed, the function `pfree()` can be called.

The current memory context can be changed by calling `MemoryContextSwitchTo(new_context)`, which returns the current memory context and sets the given memory context as the new current memory context. So in PostgreSQL often, the following pattern is used to perform a few operations in another memory context:

```c
/* Switch to new memory context */
MemoryContext old_context = MemoryContextSwitchTo(new_context);

/* Do some work in new memory context */
[...]

/* Switch back to old memory context */
MemoryContextSwitchTo(old_context)
```

To create a new memory context, the function `AllocSetContextCreate` can be used. The parameter needs (1) the parent of the new memory context, (2) the name of the new context, and (3) the amount of memory that should be allocated. The macro `ALLOCSET_DEFAULT_SIZES` can be used to use the default sizes.

```c
MemoryContext new_context = AllocSetContextCreate(CurrentMemoryContext, "MyContext", ALLOCSET_DEFAULT_SIZES);
```

## Reset and Delete MemoryContexts

To clear the allocations of the memory context, it can be reset or deleted. When the context is reset, all memory allocations that are part of the conext are deleted. To reset a memory context, the function `MemoryContextReset` has to be invoked on the memory context that should be reset.

```c
MemoryContextReset(MemoryContext context);
```

The deletion of a memory context can be performed in a similar way. To delete a memory context, the function `MemoryContextDelete` has to be called and the memory context that should be deleted has to be passed as a parameter.

```c
MemoryContextDelete(MemoryContext context);
```

When a memory context is deleted, all child memory contexts are also automatically deleted. The same applies when a memory context is reset, the child contexts are automatically deleted.

When Postgres had complied with the value `CLOBBER_FREED_MEMORY` defined (this is usually done when Postgres was configured with the option `--enable-cassert`), deleted memory is overwritten by `0x7f` bytes. If a memory consisting of these bytes is shown in the debugger, you might work on a reference this is [already deleted](https://wiki.postgresql.org/wiki/Developer_FAQ#Why_are_my_variables_full_of_0x7f_bytes.3F).

## Callbacks

Sometimes it could be useful to perform tasks when a memory context is deleted or reset (e.g., perform some cleanup tasks). To accomplish this, Postgres provides _callbacks_, that are executed when a memory context is deleted or reset. To register a callback on a memory context, the function ```MemoryContextRegisterResetCallback(MemoryContext context, MemoryContextCallback *cb)``` can be used. This function takes a memory context and a callback as a parameter. 

For example, to execute the function `my_callback_func` with the pointer `my_data` as a parameter as soon as the memory context `my_ctx` is reset or deleted, the following code can be used:

```c
MemoryContextCallback callback = (MemoryContextCallback *) MemoryContextAllocZero(my_ctx, sizeof(MemoryContextCallback));
callback->func = my_callback_func;
callback->arg = (void *) my_data;
MemoryContextRegisterResetCallback(my_ctx, callback);
```

## Information about the used memory

To get more information, how large the existing memory contexts are, the function `MemoryContextStats(TopMemoryContext)` can be called in PostgreSQL. To invoke the function, a debugger can be used.

```shell
gdb -p <pid of the postgres process>

MemoryContextStats(TopMemoryContext)
```

After the function is called, the Postgres process writes information about all existing memory context and their current usage into the default logfile. 

```
TopMemoryContext: 68720 total in 5 blocks; 14624 free (15 chunks); 54096 used
  RowDescriptionContext: 8192 total in 1 blocks; 6880 free (0 chunks); 1312 used
  MessageContext: 8192 total in 1 blocks; 6880 free (1 chunks); 1312 used
  Operator class cache: 8192 total in 1 blocks; 512 free (0 chunks); 7680 used
  smgr relation table: 16384 total in 2 blocks; 4544 free (3 chunks); 11840 used
  TransactionAbortContext: 32768 total in 1 blocks; 32504 free (0 chunks); 264 used
  Portal hash: 8192 total in 1 blocks; 512 free (0 chunks); 7680 used
  TopPortalContext: 8192 total in 1 blocks; 7928 free (0 chunks); 264 used
  Relcache by OID: 16384 total in 2 blocks; 3424 free (3 chunks); 12960 used
  CacheMemoryContext: 524288 total in 7 blocks; 134280 free (3 chunks); 390008 used
    index info: 2048 total in 2 blocks; 408 free (1 chunks); 1640 used: pg_db_role_setting_databaseid_rol_index
    index info: 3072 total in 2 blocks; 1088 free (2 chunks); 1984 used: pg_opclass_am_name_nsp_index
    index info: 2048 total in 2 blocks; 880 free (1 chunks); 1168 used: pg_foreign_data_wrapper_name_index
    index info: 2048 total in 2 blocks; 912 free (2 chunks); 1136 used: pg_enum_oid_index
    index info: 2048 total in 2 blocks; 616 free (1 chunks); 1432 used: pg_class_relname_nsp_index
[...]
```

__Note:__ As an alternative to the debugger you can also call the function `pg_log_backend_memory_contexts(PID)` in PostgreSQL (e.g., `SELECT * FROM pg_log_backend_memory_contexts(1234);`). The function also dumps the statistics about the memory context of the process into the logfile.