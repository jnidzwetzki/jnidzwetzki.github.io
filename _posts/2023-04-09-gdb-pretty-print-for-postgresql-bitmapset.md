---
layout: post
title: >
    GDB Pretty Print Extension for PostgreSQL Bitmapsets
tags: [PostgreSQL, GDB, Debugging]
author: jan
excerpt_separator: <!--more-->
---

To store sets of integer values efficiently, PostgreSQL uses internally a data structure called [Bitmapset](https://github.com/postgres/postgres/blob/master/src/include/nodes/bitmapset.h). A wide range of operations are supported on the `Bitmapset`. 

<!--more-->

This data structure is widely used in PostgreSQL code. Internally, so-called `words` of bits are used and store the information on which element is part of the set. For instance, this data structure supports efficient tests if an integer is part of the set (using the `bms_is_member` function), to add new values (using the `bms_add_member`, `bms_add_members`, or `bms_add_range` functions), or to iterate over the values (using the `bms_next_member` and `bms_prev_member` functions). 

## Dumping the Content of the Bitmapset
 However, the content of this data structure is difficult to debug. The debugger does not show the stored content due to the lack of knowledge about the semantics of the bits. A lot of internal PostgreSQL data structures can be dumped using the `pprint` [function](https://github.com/postgres/postgres/blob/c8e1ba736b2b9e8c98d37a5b77c4ed31baf94147/src/backend/nodes/print.c#L54). Unfortunately, the `pprint` function is unable to print the content of the Bitmapset. 
 
 On the PostgreSQL developer mailing list was a [patch](https://postgrespro.com/list/thread-id/1900731) discussed to introduce a function called `bmsToString`. This function can also be used to display the content of a Bitmapset. However, this function can be only called when PostgreSQL is running. When a core dump of a crashed PostgreSQL process is examined with GDB, the function cannot be used.

```
(gdb) call bmsToString(chunk_state->unused_batch_states)
$6 = 0x5588689a8818 "(b 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15)"
```

 Because the Bitmapset data structure is used heavily inside of PostgreSQL and the database server has no reliable way to print the content during debugging, I have developed a GDB extension to solve this problem. This article presents a GDB extension, which provides a remedy and makes the content displayable in the debugger.

For instance, when the GDB should print the content of the set, it looks as follows:
```
(gdb) print *node_state->unused_batch_states
$1 = {nwords = 1, words = 0x5588689773f0}
```

The output indicates that one `word` (consisting of 32 bits) is used to represent the stored values. Unfortunately, in the output, it can not be seen which values are stored exactly. 

## A GDB extension to show the content of the Bitmapset

The debugger GDB can be [extended](https://sourceware.org/gdb/onlinedocs/gdb/Python.html) using python scripts. The _Pretty Printing API_ can be used to develop [Pretty Printer](https://sourceware.org/gdb/onlinedocs/gdb/Pretty-Printing-API.html) to analyze data structures and to improve the output of the debugger when they are displayed.

The following python script shows such an extension. It registers a new set of pretty printers via the `RegexpCollectionPrettyPrinter` function. These printers are called when a `Bitmapset` or a `Relids` data type should be printed by GDB. It decodes the `words` of the Bitmapset into decimal values, adds these values to a list and converts this list into a string.

```python
from gdb.printing import PrettyPrinter, register_pretty_printer
import gdb

class BitmapsetPrettyPrinter(object):
    def __init__(self, val):
        self.val = val

    def to_string(self):
        values = []
        bits_per_word = 32

        if self.val is None or self.val.type is None:
           return "0x0"

        words = None

        try:
           words = self.val["nwords"]
        except Exception:
          return 'is not iterable'

        for word_no in range(words):
           word = self.val["words"][word_no]
           for bit in range(bits_per_word):
              if word & (1 << bit):
                  values.append(word_no * bits_per_word + bit)

        return f"PGBitmapset ({str(values)})"

    def display_hint(self):
        return 'PGBitmapset'

def build_pretty_printer():
    pp = gdb.printing.RegexpCollectionPrettyPrinter("PostgreSQLPrettyPrinter")
    pp.add_printer('Bitmapset', '^Bitmapset$', BitmapsetPrettyPrinter)
    pp.add_printer('Relids', '^Relids$', BitmapsetPrettyPrinter)
    return pp

register_pretty_printer(None, build_pretty_printer(), replace=True)
```

## Registering the Pretty Printer

This Python script can be stored in a new file and loaded via the `source` command into GDB. 

```
(gdb) source /home/jan/dev/postgresql_printer.py
```

After the file is loaded, the two pretty printers are registered. By using the command `info pretty-printer`, GDB shows which pretty printers are registered. After loading the two new prints, the output looks as follows:

```
(gdb) info pretty-printer
global pretty-printers:
  PostgreSQLPrettyPrinter
    Bitmapset
    Relids
  builtin
    mpx_bound128
[...]
```

When the content of the variable `unused_batch_states` is now printed in GDB, it looks as follows.

```
(gdb) print *node_state->unused_batch_states
$3 = PGBitmapset ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
```

The output now clearly shows which integer values are part of the bitmap set. This is similar to the output of the `bmsToString` function shown above. The main difference is that the GDB extension also works when coredump files are analyzed and PostgreSQL is not running.

The pretty printer has to be loaded via the `source` command every time GDB is restarted. This is cumbersome. To ease the work with this extension, the command can be added to the `~/.gdbinit` file. The commands of this file are automatically executed every time GDB is invoked.

```
cat ~/.gdbinit 
source /home/jan/dev/postgresql_printer.py
```