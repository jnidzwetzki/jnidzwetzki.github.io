---
layout: post
title: >
    Backup your Data encrypted to AWS S3 using Duplicity
tags: [Howto, Backup, Duplicity]
author: jan
excerpt_separator: <!--more-->
---

No one wants to create backups; everyone just wants to be able to restore data -- that's the old saying in IT. However, to be able to restore data, backups need to be created on a regular basis. To ensure that major disasters can be survived, the backups should be stored in a different location. In this article, the software [Duplicity](https://duplicity.gitlab.io/) is used to create automated backups and store them on an [AWS S3 bucket](https://aws.amazon.com/s3/) in the AWS cloud. These backups are encrypted using GPG.

<!--more-->

# Creation of an AWS S3 Bucket

The _Amazon Simple Storage Service_ (S3) is a service that is specialized in storing files in a scalable manner. The data can be stored in various storage classes. Currently (in 2022), storing a gigabyte costs approximately [2.3 cents (USD)](https://aws.amazon.com/s3/pricing/) per month. With a minimum storage period of 30 days (storage class _Standard-Infrequent Access_), the costs drop to 1.2 cents per month. In addition to the cost of storage, there is the cost of data transfer. Inbound traffic to AWS is free; outbound traffic is billed. Costs may also be incurred for operations (e.g., `PUT`, `DELETE`). More details can be found in the [AWS price calculator](https://calculator.aws/#/addService/S3).

When using the Amazon S3 Glacier Deep Archive storage classes, the costs drop even further. However, access to the data takes longer, and the data also has a higher minimum storage period (up to 180 days). AWS itself recommends using the "Standard Infrequent Access" storage class for backups. In [most storage classes](https://aws.amazon.com/s3/storage-classes/?nc1=h_ls), data is stored in at least three availability zones at the same time, which results in very high durability (99.9999999%). 

Even though the cost is made up of many individual components, storing the data remains inexpensive. According to the AWS pricing calculator, storing 25 GB of data and backing up 10 GB once a month costs 1.42 USD.

## Create a new Bucket
Open the [S3 configuration](https://s3.console.aws.amazon.com/s3/buckets) in the AWS console and click the _Create Bucket_ button. To create the bucket, a unique name (e.g., `my-backup-bucket`) has to be specified. In addition, the `Object Ownership` can be set to `ACLs disabled (recommended)`, and the public access can be set to `Block all public access`. Using this setting, accessing the bucket requires an IAM account. Also, the `Bucket Versioning` can be set to `Disabled`, and the `Server-side encryption` can also be disabled. By using Duplicity, the backup volumes will be already encrypted on the client side before they are transferred to the S3 bucket. 

## Bucket Access Management

To grant the Duplicity access to this bucket, a policy has to be created which allows the read and write access to this bucket. This policy can be attached to an IAM user group. Afterward, a new IAM user with an API key and API secret can be created, which is assigned to a user group. 

In the first step, the Identity and Access Management (IAM) [console](https://us-east-1.console.aws.amazon.com/iamv2/home#/home) has to be opened. Then a new policy can be created. During the policy creation, the permissions of the policy can be specified as JSON. For a policy that allows access to the bucket `my-backup-bucket`, the following code can be used. In your setup, `my-backup-bucket` has to be created by your actual bucket name.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ListObjectsInBucket",
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::my-backup-bucket"
            ]
        },
        {
            "Sid": "AllObjectActions",
            "Effect": "Allow",
            "Action": "s3:*Object",
            "Resource": [
                "arn:aws:s3:::my-backup-bucket/*"
            ]
        }
    ]
}
```

Before the policy can be stored, a name has to be chosen. In this example, I used `s3-backup-bucket-read-write`. 

Afterward, a new user group has to be created. This can also be done in the same IAM AWS console. The user group is named `s3-backup-group` in this example. In the field `Attach permissions policies`, the `s3-backup-bucket-read-write` policy has to be chosen and attached to this uer group. Afterward, the user group can be created. 

Finally, a new IAM user account can be created that allows access to the S3 bucket. In this example, the user is named `duplicity-backup-user`. During the creation, the setting `Select AWS credential type`, the value `Access key - Programmatic access` has to be activated to allow access via a key and a secret. The value `Password - AWS Management Console access` has to be disabled. On the permissions tab, the `s3-backup-group` user group can be attached to this user, and the user can be created. After clicking the `Create user` button, the API key and the API secret are shown. These values should now be noted since the API secret is only displayed once. The setup of the S3 bucket is now complete.

# Installation and Configuration of Duplicity

Duplicity can now be installed. On a Debian-based distribution, this can be done by executing the following commands:

```shell
apt install duplicity python3-boto gpg
```

## Setup Encryption
Even the access to the S3 bucket is protected, it is recommended to encrypt the backups. This can be done by a GPG key. In this case, the backups can only be restored when the private key (and the password for the key) is known. Therefore, the GPG key pair has to be also backed up (e.g., on a USB stick that is stored at another physical location). 

If a GPG key is already present, this key can be used. Otherwise, a new Key-Pair (a private key and a public key) has to be created. This can be done by executing `gpg --gen-key` and creating a key (2048 - 4096 bits with no expiration date). 

Afterward, `gpg --list-keys` can be called and the ID of the key (e.g., `45DBFFF2`) should be noted down. The ID is used later during the configuration of Duplicity.

## Perform Backups
To perform the actual backups, a shell script like the following one should be created and executed as a cron job on a regular basis. In the script the variables `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` have to be set to the API key and secret of the created IAM user. In addition, `my-backup-bucket` has to be set to the name of the actual S3 bucket. Also, the id of the used GPG key has to be adjusted (`GPG_KEY`). The options for the compression can be adjusted. By default, compression is already performed. The compression rate can be improved as shown in the script. However, the compression will then also take longer, which can lead to significantly longer times for creating the backup. Here, a good balance between storage costs and runtime should be considered.

By specifying `--include <DIR>`, the directories that should be backed up can be specified. The line `duplicity remove-older-than 2M` ensures that backups that are older than two months are deleted. The next invocation of `duplicity` performs the actual backup. The flag `--s3-use-ia` ensures that all created files are stored in the infrequent access storage class. In addition, the backups are encrypted by using a GPG key. Normally an incremental backup is performed. However, after one month, a full backup (`--full-if-older-than 1M`) is created. 

```shell
#!/bin/sh

export AWS_ACCESS_KEY_ID="[....]"
export AWS_SECRET_ACCESS_KEY="[....]"

DEST=boto3+s3://my-backup-bucket/
GPG_KEY="45DBFFF2"
VERBOSE=""
#VERBOSE="-v8"

# Compression
COMPRESSION=""
#COMPRESSION="--gpg-options='--compress-algo=bzip2 --bzip2-compress-level=9'"

INCLUDES="--include /home --include /root"

duplicity remove-older-than 2M ${DEST} --force
duplicity ${VERBOSE} ${COMPRESSION} --s3-use-ia --encrypt-key ${GPG_KEY} --full-if-older-than 1M ${INCLUDES} --exclude '**' / ${DEST}
```

## Restoring Data
After the backup is created, files can be restored. To restore files, the environment variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `DEST` (as in the script above) have to be set by calling `export ...`. Afterward, by calling `duplicity list-current-files`, the files in the most recent backup can be shown. By calling `duplicity list-current-files --time 2D`, the files from the backup run two days ago are shown. 

### Restore a Single File
By calling `duplicity restore --file-to-restore filename --time 2022-05-18 ${DEST} /tmp/restore/filename`, the file `filename` with the latest change on the `2022-05-18` is restored as `/tmp/restore/filename`. 

### Restore a Complete Backup
Also, a complete backup can be restored. For example, this can be done by calling  `duplicity restore -t 4D ${DEST} /restore`. This command restores the backup from four days ago `-t 4D` into the directory `/restore`.

