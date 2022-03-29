# The Browser Network Switchboard

This is the switchboard required to facilitate initial connections in a
[Browser Network](https://github.com/browser-network/network).

## What is this?

When you first open a web page using a distributed browser network, the app
needs some way to find the network before it can join it. This is the service
provided to do that. The Switching Service can facilitate a connection between
any two nodes within a distributed browser network that are not already
connected. So if you're a node who isn't yet connected to the network, you'll
ping this switching service to find and connect to another node that's already
in the network. Then immediately you'll start receiving connection information
from other nodes in the network and you'll rapidly further connect to the
network without the continued help of this switching service.

The switching service has negligable processing and memory footprints. It
operates only in memory, it doesn't need a database or write to disk in any
way. The switching service will be exchanging small JSON data with various
nodes in the network so it will use some small bandwidth. But it's important to
note that this is not anything like a cryptocurrency miner, the resource usage
of the switching service is meant to be as small as possible.

The switching service is also designed to be able to be started and stopped at
will without harming the network. The network is robust and self healing and
can survive indefinitely without the switching service running, even in
unstable WebRTC network conditions (sometimes the connections are unstable).
However without at least one switching service running at any time, new nodes
will not be able to join the network. So a constantly evolving network, as the
network is intended to be, requires at least one switching service running at
any point in time.

## Features

* **No websockets** -- This switching scheme works by regular HTTP request only.
  That means no extra libraries and trivial switchboard implementations. It
  also means the network doesn't depend on the switchboard to stay alive. Once
  the network is up and running, it stays healthy without the help of a
  switchboard. The switchboard is just a gatekeeper to let new nodes find the
  network. Picture it like an old man who can't lift that much but can open the
  gate :)

## Running

You can skip installation entirely and just run this with:

```sh
PORT=5678 npx @browser-network/switchboard
```
