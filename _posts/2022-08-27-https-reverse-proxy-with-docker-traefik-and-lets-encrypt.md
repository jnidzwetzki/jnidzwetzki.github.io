---
layout: post
title: >
    A HTTPs reverse proxy for Docker with Traefik and Let's encrypt
tags: [Howto, Docker, Traefik]
author: jan
excerpt_separator: <!--more-->
---

Docker is one of the most popular runtimes for Containers these days. Often the services in the containers offer a web interface. To ensure that this service can be accessed securely (via HTTPs) on the standard port 443/tcp, reverse proxies are commonly used. The reverse proxy receives the incoming requests on port 443, provides the appropriate TLS certificate and distributes the traffic depending on the URL to the respective containers. For a long time, Nginx was the quasi-standard for this. However, [Traefik](https://traefik.io/traefik/) has also been used for some time. This reverse proxy is presented in this article.

<!--more-->

[Nginx](https://nginx.org/) is a stable and widely used webserver, which can also be used as a reverse proxy. However, the drawback of using Nginx as a reverse proxy is, that an additional configuration file has to be maintained and additional tools for obtaining SSL-Certificates from Let's encrypt have to be configured. Complex Docker deployments can be deployed using [Docker Compose](https://docs.docker.com/compose/). By using Traefik, the complete reverse proxy can be configured using tags and deployed by including an additional Docker image.

# Docker and Reverse Proxies

The first question is, what is a reverse proxy and why is it needed?

A reverse proxy terminates the incoming HTTP(s) connections from the Internet and forwards these connections to internal systems. Often, these systems are not directly reachable from the Internet. The connection forwarding is performed based on the provided URL. In addition, the reverse proxy terminates the HTTPs connection (otherwise, the proxy could not determine the URL from the encrypted connection). The data of the connection could be forwarded as encrypted (HTTPs) or unencrypted (HTTP) connections from the proxy to the actual system.

When using multiple Container images, the reverse proxy also performs a further task. If several containers provide a webinterface, only one container can use the port 80/tcp or 443/tcp and receive the incoming HTTP and HTTPs connections. Another container must use non-default ports, which might be inconvenient for users (e.g., https://example.com:100000). Using the reverse proxy, the proxy could listen on the default ports and forward the connections based on the URLs to the actual container ports. This is illustrated in the following image:

<div class="mermaid">
flowchart LR
    A["HTTPs-Request\n(<i>443/tcp</i>)"] --> C{Traefik}
    subgraph Docker Host
    C -->|domain1.example.com| D["Container A\n(<i>10000/tcp</i>)"]
    C -->|domain2.example.com/path1| E["Container B\n(<i>10001/tcp</i>)"]
    C -->|domain3.example.com/path/2/| F["Container C\n(<i>10002/tcp</i>)"]
    end
</div>

Because most Container Images do not support HTTPs connections out-of-the-box, the incoming HTTP traffic is forwarded unencrypted as regular HTTPs requests to the container. However, the traffic is only forwarded on the local system via the loopback interface and can not be intercepted by an attacker.

## Starting Traefik

To use Traefik, the offered Container Image has to be downloaded and started. This can be done by using the following lines in a Docker compose file. It also applies a basic configuration to Traefik. The software listens to all requests on ports 80/tcp and 443/tcp. In addition, these ports of the Docker Hosts are forwarded to this container.

```yaml
traefik:
    image: "traefik:v2.2"
    container_name: "traefik"
    restart: unless-stopped
    command:
        - "--api.insecure=false"
        - "--api.dashboard=true"
        - "--providers.docker=true"
        - "--providers.docker.exposedbydefault=false"
        - "--entrypoints.web.address=:80"
        - "--entrypoints.websecure.address=:443"
    labels:
        - "traefik.enable=true"
    ports:
    - "80:80"
    - "443:443"
    volumes:
    - "/var/run/docker.sock:/var/run/docker.sock:ro"
```

In addition, the [Docker Socket](https://docs.docker.com/engine/security/protect-access/) (the file `/var/run/docker.sock`) is exposed to the Traefik container via a volume mount. This is needed to notify Traefik automatically on configuration changes (e.g., a new container is started) and to let Traefik determine the labels that are applied to the containers to build the needed configuration at runtime.

### Let's Encrypt Certificates

[Let's Encrypt](https://letsencrypt.org/) is a certificate authority that provides free certificates. Traefik can automatically request and use these certificates. To use this feature, the label `traefik.http.routers.<container name>.tls.certresolver=myresolver` has to be applied to the container (see the complete configuration example below).

Before the `myresolver` certresolver can be used, it has to be defined and configured. This can be done by adding the following options to the start of the Traefik binary.

```yaml
# Use a TLS challenge to request new certificates
- "--certificatesresolvers.myresolver.acme.tlschallenge=true"

# Use the E-Mail email@example.com to request the certificates
- "--certificatesresolvers.myresolver.acme.email=email@example.com"

# Store the certificates in the following file
- "--certificatesresolvers.myresolver.acme.storage=/letsencrypt/acme.json"
```

To store the requested certifcates permanent and let the certifcate survive conatiner restarts, the directory `/letsencrypt` of the Traefik container should be mapped as a volume to the host system. This can be done by the directive `volume: /root/traefik/letsencrypt:/letsencrypt` in the Docker compose file.

__Notice:__ Some [rate limits](https://letsencrypt.org/docs/rate-limits/) apply, when certificates are requested from Let's encrypt. When these rate limits are reached, no new certificates are provided for a few days. During the setup of a system, it can be useful to use the sandbox CA of let's encrypt. This CA does not generate valid certificates, but the local settings can be checked. 
To test the configuration using the Let's encrypt sandbox CA, the following setting can be used:

```yaml
 - "--certificatesresolvers.myresolver.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory"
```

When everything works as expected, the setting can be removed and the directory `/root/traefik/letsencrypt` can be deleted. When Traefik is restarted, the certificates are requested from the official Let's encrypt CA.

## Tuning HTTPs Options

To improve the strength of the HTTPs connections and get a good rating in tests (like the [SSL server test of SSL labs](https://www.ssllabs.com/ssltest/)), the encryption settings have to be adjusted. For example, the provided ciphers have to be restricted and the TLS protocol versions have to be limited. 

This configuration can be done by a separate configuration file, which can be mounted as a volume into the Traefik container. So, the following file can be stored as `/root/traefik/dynamic.yml` on the Docker system and mounted into the Traefik container in the Docker compose file via `volume: /root/traefik/dynamic.yml:/dynamic.yml:ro` and loaded by passing the `--providers.file.filename=/dynamic.yml` to the Traefik binary.

```yaml
tls:
 options:
   default:
     minVersion: VersionTLS12

     cipherSuites:
       - TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
       - TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
       - TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305
       - TLS_AES_128_GCM_SHA256
       - TLS_AES_256_GCM_SHA384
       - TLS_CHACHA20_POLY1305_SHA256
       
     curvePreferences:
       - CurveP521
       - CurveP384

     sniStrict: true
```

### Admin Dashboard

Traefik ships with a [dashboard](https://doc.traefik.io/traefik/operations/dashboard/) that allows exploring the active configuration. To enable the dashboard, a hostname has to be chosen and the following labels have to be applied to the Traefik container. The hostname `console.example.com` is used in this example and has to be replaced by the real hostname and the password for the user also has to be set.

```yaml
# Process HTTPs traffic for the dashboard
- "traefik.http.routers.dashboard.entrypoints=websecure"

# Use the myresolver certificate resolver to request TLS certificates
- "traefik.http.routers.dashboard.tls.certresolver=myresolver"

# Listen to the Hostname "console.example.com"
- "traefik.http.routers.dashboard.rule=Host(`console.example.com`)"

# Forward all traffic to the dashboard service
- "traefik.http.routers.dashboard.service=api@internal"

# Protect the access by a username and a password
- "traefik.http.routers.dashboard.middlewares=auth"

# Set the password for the user "myuser"
- "traefik.http.middlewares.auth.basicauth.users=myuser:[...]/"
```

_Note:_ The encrypted version of the password for the user has to be included in the configuration file. The password can be generated by using the following command:

```shell
echo $(htpasswd -nb myuser mysecret) | sed -e s/\\$/\\$\\$/g
```

The `htpasswd` is included in the `apache2-utils` package on Debian-based distributions like Ubuntu.

## Settings Labels for a Container
Like in [Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/), the configuration for the Containers is done based on labels. These labels are parsed by Traefik and the needed configuration is created at runtime. To let Traefik handle the HTTP and HTTPs-connections for one container, the following labels have to be applied to the container:

```yaml
# Enable Traefik for this container
- "traefik.enable=true"

# Handle also the incoming HTTPs traffic for the host and use a certifcate that is requested via the "myresolver" certresolver
- "traefik.http.routers.develop-platform.rule=Host(`myservice.example.com`)"
- "traefik.http.routers.develop-platform.entrypoints=websecure"
- "traefik.http.routers.develop-platform.tls.certresolver=myresolver"
```

The labels above ensure that the traffic to the HTTPs port is handled properly. Unencrypted HTTP traffic for the domain is not handled so far. Therefore, an error message is shown in the browser if a user opens the domain via a regular HTTP connection. So, it might be useful to redirect all HTTP requests automatically to HTTPs. This can be done by using the following labels.

```yaml
# Handle the incoming HTTP traffic for the host "myservice.example.com" and perform an automatic redirect to HTTPs
- "traefik.http.routers.develop-platform-plain.entrypoints=web"
- "traefik.http.routers.develop-platform-plain.rule=Host(`myservice.example.com`)"
- "traefik.http.routers.develop-platform-plain.middlewares=redirect-https"
```

## The Complete Configuration

In this subsection, the complete configuration is shown. It starts one container with a web interface (called `develop-platform` in this example) and it starts the Traefik proxy that terminates the HTTP and HTTPs connections on the Docker host. The complete stack can be deployed by invoking `docker-compose up -d'. 

```yaml
version: "3.4"

services:

   develop-platform:
      image: nginxdemos/hello
      restart: unless-stopped
      labels:
         - "traefik.enable=true"
         - "traefik.http.routers.develop-platform.rule=Host(`myservice.example.com`)"
         - "traefik.http.routers.develop-platform.entrypoints=websecure"
         - "traefik.http.routers.develop-platform.tls.certresolver=myresolver"
         - "traefik.http.routers.develop-platform-plain.entrypoints=web"
         - "traefik.http.routers.develop-platform-plain.rule=Host(`myservice.example.com`)"
         - "traefik.http.routers.develop-platform-plain.middlewares=redirect-https"

    traefik:
        image: "traefik:v2.2"
        container_name: "traefik"
        restart: unless-stopped
        command:
            - "--api.insecure=false"
            - "--api.dashboard=true"
            - "--providers.file.filename=/dynamic.yml"
            - "--providers.docker=true"
            - "--providers.docker.exposedbydefault=false"
            - "--entrypoints.web.address=:80"
            - "--entrypoints.websecure.address=:443"
            - "--certificatesresolvers.myresolver.acme.tlschallenge=true"
            - "--certificatesresolvers.myresolver.acme.email=email@example.com"
            - "--certificatesresolvers.myresolver.acme.storage=/letsencrypt/acme.json"
        labels:
            - "traefik.enable=true"

            - "traefik.http.middlewares.redirect-https.redirectScheme.scheme=https"
            - "traefik.http.middlewares.redirect-https.redirectScheme.permanent=true"

            - "traefik.http.routers.dashboard-plain.entrypoints=web"
            - "traefik.http.routers.dashboard-plain.rule=Host(`console.example.com`)"
            - "traefik.http.routers.dashboard-plain.middlewares=redirect-https"

            - "traefik.http.routers.dashboard.entrypoints=websecure"
            - "traefik.http.routers.dashboard.tls.certresolver=myresolver"
            - "traefik.http.routers.dashboard.rule=Host(`console.example.com`)"
            - "traefik.http.routers.dashboard.service=api@internal"
            - "traefik.http.routers.dashboard.middlewares=auth"
            - "traefik.http.middlewares.auth.basicauth.users=myuser:[...]/"
        ports:
            - "80:80"
            - "443:443"
        volumes:
            - "./traefik/letsencrypt:/letsencrypt"
            - "./traefik/dynamic.yml:/dynamic.yml:ro"
            - "/var/run/docker.sock:/var/run/docker.sock:ro"
```
