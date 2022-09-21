---
layout: post
title: >
    Evaluating the IO performance of AWS gp2 and gp3 EBS volumes
tags: [AWS, EBS, Benchmark]
author: jan
excerpt_separator: <!--more-->
---


sudo apt update
sudo apt install zlib1g-dev libjpeg-dev python3-pip fio

sudo fio --name EBS_GP2_VOLUME --filename=/dev/nvme1n1 --readonly --runtime=300 --time_based --rw=randread --direct=1  --output=filename  --output-format=csv