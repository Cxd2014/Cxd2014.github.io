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

* [NoSQL Databases: a Survey and Decision Guidance](https://medium.baqend.com/nosql-databases-a-survey-and-decision-guidance-ea7823a822d)   



