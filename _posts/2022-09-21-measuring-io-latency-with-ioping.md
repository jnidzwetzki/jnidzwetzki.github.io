---
layout: post
title: >
    Measuring and visualizing I/O latency with ioping and gnuplot
tags: [Benchmark]
author: jan
categories: Development
excerpt_separator: <!--more-->
---

Reading and writing data from mass storage (volumes) is a quite common pattern in software. However, some time elapses between starting the I/O request (i.e., reading or writing data) and the completion of the request. The elapsed time to complete the request is called _I/O latency_. Older magnetic hard disks need some time to position the head on the right track of the magnetic disk. Also, newer flash-based disks like SSDs need some time to read the data. In addition, at common cloud providers, different types of block volumes are available that provide a different I/O latency. With the software _ioping_, this latency can be measured.

<!--more-->

Having a good understanding of the I/O latency of the used mass storage device is crucial for implementing fast / low latency software systems. For example, in a database management system, multiple I/O requests are usually needed to execute a query. Monitoring the I/O latency can also be useful to detect a defect on a storage device (e.g., bad sectors on a hard disk) that lead to higher processing times of an executed software system.

The [ioping](https://github.com/koct9i/ioping) software can determine the I/O latency of a device. Like with the regular `ping` command, the delay of requests is measured.

The `ioping` package is included in most modern distributions. On Debian-based distributions, the software can be installed as follows:

## Installing and Executing ioping
```shell
$ sudo apt install ioping
```

The software provides a wide range of options. Required is only the destination folder in which the I/O requests are performed. In addition, the parameter `-c` allows specifying how many requests should be performed. 

In the following example, 10 I/O requests are executed in the directory `/tmp`. Per default, an I/O request of 4 kilobytes is executed, other sizes can be specified by using the `-s` parameter. With the parameter `-i` the delay between two requests can be specified. Per default, a delay of one second is used.

```
$ ioping -c 10 /tmp
4 KiB <<< /tmp (ext4 /dev/vda1 39.3 GiB): request=1 time=423.2 us (warmup)
4 KiB <<< /tmp (ext4 /dev/vda1 39.3 GiB): request=2 time=636.9 us
4 KiB <<< /tmp (ext4 /dev/vda1 39.3 GiB): request=3 time=629.6 us
4 KiB <<< /tmp (ext4 /dev/vda1 39.3 GiB): request=4 time=612.6 us
4 KiB <<< /tmp (ext4 /dev/vda1 39.3 GiB): request=5 time=599.9 us
4 KiB <<< /tmp (ext4 /dev/vda1 39.3 GiB): request=6 time=590.8 us
4 KiB <<< /tmp (ext4 /dev/vda1 39.3 GiB): request=7 time=612.9 us
4 KiB <<< /tmp (ext4 /dev/vda1 39.3 GiB): request=8 time=638.5 us (slow)
4 KiB <<< /tmp (ext4 /dev/vda1 39.3 GiB): request=9 time=608.0 us
4 KiB <<< /tmp (ext4 /dev/vda1 39.3 GiB): request=10 time=685.0 us (slow)

--- /tmp (ext4 /dev/vda1 39.3 GiB) ioping statistics ---
9 requests completed in 5.61 ms, 36 KiB read, 1.60 k iops, 6.26 MiB/s
generated 10 requests in 9.00 s, 40 KiB, 1 iops, 4.44 KiB/s
min/avg/max/mdev = 590.8 us / 623.8 us / 685.0 us / 26.5 us
```

In the summary of the executed command about can be seen that the used system has an average I/O latency of `623.8 us`. 

To get an output that is more suitable for post-processing, the option `-print-count <n>` can be used. After `n` requests, raw statistics are printed. With the option `-quiet`, the normal output can be suppressed. So, to get a good output that can be used for further processing, the options `-print-count 1 -quiet` can be used. For example:

```
$ ioping -print-count 1 -c 10  -quiet /tmp
1 580777 1722 7052621 580777 580777 580777 0 2 1000832419
1 633389 1579 6466800 633389 633389 633389 0 1 1000147838
1 591484 1691 6924955 591484 591484 591484 0 1 999936195
1 638930 1565 6410718 638930 638930 638930 0 1 1000043713
1 617406 1620 6634208 617406 617406 617406 0 1 999983362
1 598996 1669 6838109 598996 598996 598996 0 1 999990179
1 564540 1771 7255465 564540 564540 564540 0 1 999962737
1 602750 1659 6795521 602750 602750 602750 0 1 1000025151
1 643763 1553 6362590 643763 643763 643763 0 1 1000046368
```

The format of the raw statistics is as follows:

| Column | Meaning                         | Remarks          |
|--------|---------------------------------|------------------|
|   1    | count of requests in statistics |                  |
|   2    | running time                    |  ns              |
|   3    | requests per second             |  iops            |
|   4    | transfer speed                  |  bytes / seconds |
|   5    | minimal request time            |  ns              |
|   6    | average request time            |  ns              |
|   7    | maximum request time            |  ns              |
|   8    | request time standard           |  ns              |
|   9    | total requests                  | including warmup, too slow or too fast |
|   10   | total running time              | nanoseconds      |

## Comparing Volumes

To generate graphs of two different mass-storage devices, `ioping` is executed in the following example in the AWS cloud. A `t3a.small` instance is executed and a 100 GB `gp2` and a 100 GB `gp3` EBS volume are attached to the EC2 instance. According to some posts (see [this](https://www.percona.com/blog/performance-of-various-ebs-storage-types-in-aws/) and [this](https://stackoverflow.com/questions/65605025/new-aws-ec2-ebs-gp3-volumes-are-slow)) the newer `gp3` EBS volume type might have a higher I/O latency than the older `gp2` volume type. Let's see if this can be confirmed by `ioping` and a plot of the individual execution times.

To execute the following commands, both volumes are formatted with an EXT4 files system using the default parameters of `mkfs.ext4`. The `gp2` volume is mounted to the mount point `/mnt/gp2` and the gp3 volume is mounted to the mount point `/dev/gp3`. To compare the latency, for each of the mount points, `ioping` is executed. 

### GP2 volume
```
sudo ioping -c 100 -i 100ms /mnt/gp2
[...]
--- /mnt/gp2 (ext4 /dev/nvme1n1 97.9 GiB) ioping statistics ---
99 requests completed in 36.8 ms, 396 KiB read, 2.69 k iops, 10.5 MiB/s
generated 100 requests in 9.90 s, 400 KiB, 10 iops, 40.4 KiB/s
min/avg/max/mdev = 240.7 us / 371.9 us / 1.44 ms / 174.4 us
```

### GP3 volume
```
sudo ioping -c 100 -i 100ms /mnt/gp3
[...]
--- /mnt/gp3 (ext4 /dev/nvme2n1 97.9 GiB) ioping statistics ---
99 requests completed in 52.2 ms, 396 KiB read, 1.90 k iops, 7.41 MiB/s
generated 100 requests in 9.90 s, 400 KiB, 10 iops, 40.4 KiB/s
min/avg/max/mdev = 246.9 us / 527.5 us / 1.20 ms / 207.2 us
```

It can be seen in the output of the commands that the `gp2` volumes have an average latency of 371.9 us; the `gp3` volume has an average latency of `527.5 us`.

# Generate Graphs

[Gnuplot](http://www.gnuplot.info/) is a tool that can be used to plot and visualize data. To generate the raw data for the visualization, the following commands can be executed.

```
sudo ioping -c 1000 -i 100ms -print-count 1 -quiet /mnt/gp2 > gp2.out
sudo ioping -c 1000 -i 100ms -print-count 1 -quiet /mnt/gp3 > gp3.out
```

After these commands are executed, the files `gp2.out` and `gp3.out` with the ioping statistics are created. These files can be processed directly by gnuplot using the following template:

```
set autoscale
set grid x y

set ylabel "I/O latency (us)"
set xlabel "I/O request number"
set term svg

set output "/dev/null"
set title "EBS GP2 volume attachted to a t3a.small EC2 instance" 
plot 'gp2.out' using (column(0)):($6/1000)
min_y = GPVAL_DATA_Y_MIN
max_y = GPVAL_DATA_Y_MAX
f(x) = mean_y
fit f(x) 'gp2.out' using (column(0)):($6/1000) via mean_y

stddev_y = sqrt(FIT_WSSR / (FIT_NDF + 1 ))

set label 1 gprintf("Minimum = %g", min_y) at 20, 100
set label 2 gprintf("Average = %g", mean_y) at 20, 1650
set label 3 gprintf("Maximum = %g", max_y) at 20, 1720
set label 4 gprintf("Standard deviation = %g", stddev_y) at 20, 1790

set yrange [0:max_y+300]
set output "gp2.svg"
plot min_y with filledcurves y1=mean_y lt 1 lc rgb "#bbbbdd" title "< Average", \
     max_y with filledcurves y1=mean_y lt 1 lc rgb "#bbddbb" title "> Average", \
     'gp2.out' using (column(0)):($6/1000) pt 2 title "", \
     mean_y lt 1 title "Average"

reset

set autoscale
set grid x y

set ylabel "I/O latency (us)"
set xlabel "I/O request number"
set term svg

set output "/dev/null"
set title "EBS GP3 volume attachted to a t3a.small EC2 instance" 
plot 'gp3.out' using (column(0)):($6/1000)
min_y = GPVAL_DATA_Y_MIN
max_y = GPVAL_DATA_Y_MAX
f(x) = mean_y
fit f(x) 'gp3.out' using (column(0)):($6/1000) via mean_y

stddev_y = sqrt(FIT_WSSR / (FIT_NDF + 1 ))

set label 1 gprintf("Minimum = %g", min_y) at 20, 100
set label 2 gprintf("Average = %g", mean_y) at 20, 2700
set label 3 gprintf("Maximum = %g", max_y) at 20, 2800
set label 4 gprintf("Standard deviation = %g", stddev_y) at 20, 2900

set yrange [0:max_y+500]
set output "gp3.svg"
plot min_y with filledcurves y1=mean_y lt 1 lc rgb "#bbbbdd" title "< Average", \
     max_y with filledcurves y1=mean_y lt 1 lc rgb "#bbddbb" title "> Average", \
     'gp3.out' using (column(0)):($6/1000) pt 2 title "", \
     mean_y lt 1 title "Average"
```

When this template is stored in the same directory as the statistics files with the name `ioplot.plot` and the command `gnuplot ioplot.plot` is executed, two SVG images are generated. These images contain a plot of the I/O latency along with the minimum, the average, and the maximum I/O latency.

![GP2 EBS volume](/assets/misc/ioping/gp2.svg "EBS GP2 volume attachted to a t3a.small EC2 instance")

![GP3 EBS volume](/assets/misc/ioping/gp3.svg "EBS GP3 volume attachted to a t3a.small EC2 instance")

The average execution I/O latency is roughly the same as shown in the initial commands (an average latency of 377 us for the `gp2` volume type and 527 us for the `gp3` volume type). The suspicion that the `gp3` volumes have a higher latency could be proven by this execution. In addition, the standard deviation of the requests is higher (140 for the `gp2` volume type and 229 for the `gp3` volume type)

## Summary
`ioping` is a tool to measure the I/O latency of a volume. `gnuplot` is a tool that can be used to plot and visualize data. It can be used to plot the raw statistics of `iopoing`.