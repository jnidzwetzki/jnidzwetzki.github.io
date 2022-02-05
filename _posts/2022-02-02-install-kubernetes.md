---
layout: post
title: >
    Install Kubernetes using Ansible / Kubeadm
tags: [Howto, Kubernetes]
author: jan
excerpt_separator: <!--more-->
---

[Kubernetes](https://kubernetes.io/) is one of the most popular container orchestrators these days. In this post, it is shown how the software can be installed on bare-metal servers or virtual servers by using [kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/) and [Ansible](https://github.com/ansible/ansible).

<!--more-->

In this section, five virtual systems are installed using KVM. This is useful, for example, if the complete Kubernetes cluster is to be installed on a physical system for testing purposes. If you want to install Kubernetes on already installed systems (e.g., provided by a cloud infrastructure provider), you can skip this section. 

# Setup Virtual Servers by using KVM
In this tutorial, five nodes are used. One node is used as the control-panel node and four nodes are used as worker nodes. The control-panel node executes all needed services to run the Kubernetes cluster. The worker nodes are used to run the workload. The number o nodes can be changed to any number. However, at least two nodes are required (1x control-panel and 1x worker).

Before you begin with the installation of the systems, please setup appropriate DNS entries. In this example, the names `debian11-k8s-vm1.example.org` - `debian11-k8s-vm5.example.org` are used. 

The first step is to create the images for the virtual servers. This can be done by using the `virt-builder` command. The command also stores an SSH key for the later passwordless login. Debian 10 is used in this example, any other distribution which is [supported](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/) by kubeadm can be used. This tutorial is based on Debian 10. For other distributions, some adjustments may be required.


```shell
# Pepare the images
$ virt-builder debian-10 --cache /var/lib/libvirt/images/cache --size=20G --format qcow2 -o /var/lib/libvirt/images/debian11-k8s-vm1.qcow2 --hostname debian11-k8s-vm1 --network --timezone Europe/Berlin --firstboot-command "dpkg-reconfigure openssh-server" --edit '/etc/network/interfaces: s/ens2/enp1s0/' --ssh-inject root:file:/home/jan/.ssh/id_jan.pub --root-password password:sOFIJ8lx97CuecM
$ virt-builder debian-10 --cache /var/lib/libvirt/images/cache --size=20G --format qcow2 -o /var/lib/libvirt/images/debian11-k8s-vm2.qcow2 --hostname debian11-k8s-vm2 --network --timezone Europe/Berlin --firstboot-command "dpkg-reconfigure openssh-server" --edit '/etc/network/interfaces: s/ens2/enp1s0/' --ssh-inject root:file:/home/jan/.ssh/id_jan.pub --root-password password:sOFIJ8lx97CuecM
$ virt-builder debian-10 --cache /var/lib/libvirt/images/cache --size=20G --format qcow2 -o /var/lib/libvirt/images/debian11-k8s-vm3.qcow2 --hostname debian11-k8s-vm3 --network --timezone Europe/Berlin --firstboot-command "dpkg-reconfigure openssh-server" --edit '/etc/network/interfaces: s/ens2/enp1s0/' --ssh-inject root:file:/home/jan/.ssh/id_jan.pub --root-password password:sOFIJ8lx97CuecM
$ virt-builder debian-10 --cache /var/lib/libvirt/images/cache --size=20G --format qcow2 -o /var/lib/libvirt/images/debian11-k8s-vm4.qcow2 --hostname debian11-k8s-vm4 --network --timezone Europe/Berlin --firstboot-command "dpkg-reconfigure openssh-server" --edit '/etc/network/interfaces: s/ens2/enp1s0/' --ssh-inject root:file:/home/jan/.ssh/id_jan.pub --root-password password:sOFIJ8lx97CuecM
$ virt-builder debian-10 --cache /var/lib/libvirt/images/cache --size=20G --format qcow2 -o /var/lib/libvirt/images/debian11-k8s-vm5.qcow2 --hostname debian11-k8s-vm5 --network --timezone Europe/Berlin --firstboot-command "dpkg-reconfigure openssh-server" --edit '/etc/network/interfaces: s/ens2/enp1s0/' --ssh-inject root:file:/home/jan/.ssh/id_jan.pub --root-password password:sOFIJ8lx97CuecM
```

After the images for the systems are created, they can be imported into the KVM hypervisor. To import the images, details about the available resources and network configuration are specified. This might be adjusted to your local setting. After the import of one image is done, the server is automatically started.

```shell
# Setup virtual server
$ virt-install --import --name debian11-k8s-vm1 --ram 2500 --vcpu 2 --disk path=/var/lib/libvirt/images/debian11-k8s-vm1.qcow2,format=qcow2 --os-variant debian10 --network=bridge=br0,model=virtio,mac=52:54:00:31:C8:91 --noautoconsole --graphics vnc,listen=0.0.0.0,password=i9VXEOVtmBX7S
$ virt-install --import --name debian11-k8s-vm2 --ram 2500 --vcpu 2 --disk path=/var/lib/libvirt/images/debian11-k8s-vm2.qcow2,format=qcow2 --os-variant debian10 --network=bridge=br0,model=virtio,mac=52:54:00:31:C8:92 --noautoconsole --graphics vnc,listen=0.0.0.0,password=i9VXEOVtmBX7S
$ virt-install --import --name debian11-k8s-vm3 --ram 2500 --vcpu 2 --disk path=/var/lib/libvirt/images/debian11-k8s-vm3.qcow2,format=qcow2 --os-variant debian10 --network=bridge=br0,model=virtio,mac=52:54:00:31:C8:93 --noautoconsole --graphics vnc,listen=0.0.0.0,password=i9VXEOVtmBX7S
$ virt-install --import --name debian11-k8s-vm4 --ram 2500 --vcpu 2 --disk path=/var/lib/libvirt/images/debian11-k8s-vm4.qcow2,format=qcow2 --os-variant debian10 --network=bridge=br0,model=virtio,mac=52:54:00:31:C8:94 --noautoconsole --graphics vnc,listen=0.0.0.0,password=i9VXEOVtmBX7S
$ virt-install --import --name debian11-k8s-vm5 --ram 2500 --vcpu 2 --disk path=/var/lib/libvirt/images/debian11-k8s-vm5.qcow2,format=qcow2 --os-variant debian10 --network=bridge=br0,model=virtio,mac=52:54:00:31:C8:95 --noautoconsole --graphics vnc,listen=0.0.0.0,password=i9VXEOVtmBX7S
```

_Note:_ The parameter `--os-variant debian10` is correct for debian 11 images. The direct support for the OS variant debian-11 is missing at the [moment](https://groups.google.com/g/linux.debian.user/c/QTY-7VlXRFA).

# Setup Kubernetes
After the basic infrastructure is installed and the systems are running, they can be prepared for the installation of Kubernetes. Kubernetes supports different [container runtimes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/). In this tutorial, the `containerd` runtime is used. To prepare the systems (e.g., disable root logins with passwords, install tools like vim or the container runtime), `ansible` is used. I have created a playbook that can be used to perform all the needed tasks. The playbook can be downloaded by using the following commands:


## Run Ansible to Prepare the Server
```shell
$ apt update
$ apt install ansible git
$ ansible-galaxy collection install community.general
$ ansible-galaxy collection install ansible.posix
$ git clone https://github.com/jnidzwetzki/ansible-playbooks
$ cd ansible-playbooks
```

Before the playbook can be executed, the infrastructure has to be declared. This is done by adding the hostnames of the servers to the file `hosts` inside of the `[k8shosts]` section.

```shell
$ cat hosts

[k8shosts]
debian11-k8s-vm1
debian11-k8s-vm2
debian11-k8s-vm3
debian11-k8s-vm4
debian11-k8s-vm5
```

Now, the playbook can be executed. This is done by executing the following command. This may take a while. 

```shell
$ ansible-playbook playbooks/kubernetes-containerd.yml  -i hosts
```

## Prepare the Control-Plane Node
Now it is time to install the [control-plane node](https://kubernetes.io/docs/concepts/overview/components/). This is done by executing the `kubeadm init` command. The command performs a few preflight checks (e.g., testing that the distribution is supported by Kubernetes and that a container runtime is installed properly). After the command finishes, two important pieces of information are shown: (1) the commands that have to be executed to connect with the `kubectl` command to the control-plane, and (2) the command that is required to join the Kubernetes cluster as a worker node. 

```shell
$ kubeadm init
[...]
Your Kubernetes control-plane has initialized successfully!

To start using your cluster, you need to run the following as a regular user:

  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config
[...]
Then you can join any number of worker nodes by running the following on each as root:

kubeadm join 192.168.178.180:6443 --token 7k2z9o.atvgwvywu5pkd5w3 \
  --discovery-token-ca-cert-hash sha256:9f00a315991af8873e050862a8884d8300424e481721d96afe19cdf0d236270f 
```

The first batch of commands should be executed directly. Afterward, the `kubctl` command can be used.

```shell
$ mkdir -p $HOME/.kube
$ sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
$ sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

The command can be tested by retrieving a list of the running pods:

```shell
$ kubectl get nodes
```

Before the worker nodes are integrated into the cluster, a _pod network add-on_  have to be installed. Depending on the underlying infrastructure, [different add-ons](https://kubernetes.io/docs/concepts/cluster-administration/networking/#how-to-implement-the-kubernetes-networking-model) can be used. [Flannel](https://github.com/flannel-io/flannel#flannel) is a OSI layer 3 network fabric and one of the most commonly used add-on these days. Flannel can be installed by executing:

```shell
$ kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
```

## Let the Worker Nodes Join the Control-Plane Node
Now the control-panel node is ready and the worker nodes can join the cluster. This can be done by executing the `kubeadm join` command together with the paramter that are shown as the output of the `kubeadm init` command. The command has to be executed on all worker nodes of the cluster.

```shell
$ kubeadm join 192.168.178.180:6443 --token 7k2z9o.atvgwvywu5pkd5w3 \
  --discovery-token-ca-cert-hash sha256:9f00a315991af8873e050862a8884d8300424e481721d96afe19cdf0d236270f 
```

After all worker nodes have joined the cluster, the `kubectl get nodes` command can be used to get an overview of the cluster. 

```shell
$ kubectl get nodes

NAME               STATUS   ROLES                  AGE     VERSION
debian11-k8s-vm1   Ready    control-plane,master   6m54s   v1.23.3
debian11-k8s-vm2   Ready    <none>                 2m49s   v1.23.3
debian11-k8s-vm3   Ready    <none>                 2m32s   v1.23.3
debian11-k8s-vm4   Ready    <none>                 2m17s   v1.23.3
debian11-k8s-vm5   Ready    <none>                 2m5s    v1.23.3
```

As you can see, all nodes are available, and the cluster is ready to be used by your workloads.


_Update 05-02-2022_: The article was upgraded to Debian 11