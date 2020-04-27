---
layout: post
title:  "经典文章汇集"
date:   2018-12-19 10:20:10
categories: others
tags: awesome article
---

* content
{:toc}

### 说明

想用一篇博文来记录我仔细阅读过的自认为非常好的文章，并且为每篇文章写一个简短的介绍，供日后回顾查看。
这篇博文会一直不间断更新。

### 数据库

* [Some study on database storage internals](https://medium.com/@kousiknath/data-structures-database-storage-internals-1f5ed3619d43)   
这篇文章讲解了数据库中为了提高读写性能做了哪些优化，并且说明了这些优化是为了解决哪些问题：   
    1. 使用B+Tree作为索引，主要目的是为了减少查询数据时读取磁盘的次数。
    2. 数据库中的索引并不是越多越好，太多在数据插入，更新，删除时需要修改大量索引结构降低性能。
    3. BTree索引结构的写比读更麻烦，因为你需要先从磁盘中读取数据，修改之后再写入磁盘，这叫做写放大，所以某些数据库会使用缓存来缓解这个问题。
    4. `LSM Tree`就是Cassandra数据库中应用的数据存储方式，他主要是利用了磁盘顺序写的性能要远大于随机写这一特性。


### 消息对列

* [Thorough Introduction to Apache Kafka](https://hackernoon.com/thorough-introduction-to-apache-kafka-6fbf2989bbc1)   
这篇文章从整体架构上介绍了Kafka，Kafka是一个分布式，可扩展，高可用的消息队列。   
    1. Kafka会将数据落地存储，数据存储类似于`commit log`的方式不断追加写，每份数据都会分配一个ID，并根据ID建立一个索引文件，保证读写数据的复杂度都为O(1)。
    2. 数据被分为Topic，每个Topic又可以分为多个partition（便于分布部署），每个partition都有冗余备份。


### Docker

* [Docker — 从入门到实践](https://legacy.gitbook.com/book/yeasy/docker_practice/details)   
花了一天时间把这本书大概看了一遍，并安装docker环境实验了一把。大概知道docker是个什么东西。他比虚拟机性能更高，因为它不需要虚拟整个操作系统，所以节省了操作系统本身的开销。它只是给进程提供一个独立的运行时环境，是一个非常轻量级的虚拟化方案。它提供一个通用标准的平台来管理整个分布式系统中的部署、环境一致性、扩展和运维等问题。

### Golang

* [Scheduling In Go : Part I - OS Scheduler](https://www.ardanlabs.com/blog/2018/08/scheduling-in-go-part1.html)
* [Scheduling In Go : Part II - Go Scheduler](https://www.ardanlabs.com/blog/2018/08/scheduling-in-go-part2.html)
* [Scheduling In Go : Part III - Concurrency](https://www.ardanlabs.com/blog/2018/12/scheduling-in-go-part3.html)  
这三篇文章介绍了go调度器的机制和原理，非常通俗易懂，仔细阅读一遍基本可以了解go调度器的基本架构。
    1. 第一篇文章介绍了操作系统调度器的基本知识，多线程并发执行如果他们之间需要共享处理一份数据，会导致严重的cache一致性问题，当其中一个线程更改了数据其他线程都需要重新从内存中加载数据到cpu的缓存中，在多核处理器上这是非常耗性能的。
    2. 第二篇文章介绍了go调度器的实现架构。每个cpu核心被抽象为一个M，每个操作系统线程被抽象为一个P，每个go协程被抽象为一个G。多个G绑定在一个P上由go调度器调度执行，每个P绑定到一个M上完成实际的指令执行。当某个G调用了一个同步的系统调用，这会导致被绑定的P被操作系统调度出去，从而导致这个P上的所有G都得不到执行，此时go调度器会重新创建一个线程或者在线程池中拿一个线程，将其他的G都转移到新的P上，从而避免所有G都不能执行。
    3. 第三篇文章主要介绍了CPU密集型和IO密集型应用对并发的要求不同，CPU密集型更适合多个G在多个M上并发执行，这样可以减少由于调度引起的开销，而IO密集型应用更适合多个G在同一个M上并发执行，因为IO操作本身就会阻塞等待，在同一个M上执行可以提高M的利用率。

* [Garbage Collection In Go : Part I - Semantics](https://www.ardanlabs.com/blog/2018/12/garbage-collection-in-go-part1-semantics.html)
* [Garbage Collection In Go : Part II - GC Traces](https://www.ardanlabs.com/blog/2019/05/garbage-collection-in-go-part2-gctraces.html)
* [Garbage Collection In Go : Part III - GC Pacing](https://www.ardanlabs.com/blog/2019/07/garbage-collection-in-go-part3-gcpacing.html)  

