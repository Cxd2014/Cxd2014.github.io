---
layout: post
title:  "无锁队列"
date:   2018-07-19 10:20:10
categories: programming
tags: cas lockfree queue
---

* content
{:toc}

### 前言

在分布式系统中经常会使用到共享内存，然后多个进程并行读写同一块共享内存，这样就会造成并发冲突的问题，
一般的常规做法是加锁，但是锁对性能的影响非常大，所以就搞出来了一个无锁队列。   

无锁队列的关键原理是CPU提供了一个指令`CAS`，这条指令是一个原子指令，执行过程中不允许被打断。   
它接受三个参数：需要修改值的地址、旧值、新值；`CAS`指令执行时先读取该地址的当前值，将当前值于旧值进行比较，
如果相等则说明此值没有被修改过将当前值更新为新值，操作成功；   
如果不相等则说明此值被其他进程修改过，直接返回失败，此时需要程序重新读取最新的值，再次调用`CAS`指令进行更新，重复此步骤直到成功为止，
或者设置一个重试次数，到了重试次数之后返回失败。   

无锁队列的典型应用场景是在分布式服务器集群中，需要监控每台机器的各种运行参数；比如机器处理了多少次请求、处理请求的成功、失败次数等信息；   
这种信息一般是通过属性上报来完成，但是也不能每来一次请求就直接发送数据包给属性服务器上报信息，这样效率太低，而且属性服务器也无法承受这种高并发量；
所以一般的做法是在每台业务机器上安装一个属性上报代理程序，代理程序开辟一块共享内存，所有业务进程通过API向这块共享内存中写数据，
代理程序每隔一分钟读取共享内存中的数据上报给属性服务器。因为一台业务机器上通常运行着几十甚至几百个业务进程，所以需要无锁队列来管理这块共享内存来防止并发冲突。

### 示例程序

下面的示例程序是向一块共享内存中递增一个整型数据：

```c
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <sys/ipc.h>
#include <sys/shm.h>
#include <string.h>

typedef unsigned long long uint64_t;
typedef unsigned int uint32_t;

#ifdef __GNUC__
    /* 这里使用的是GCC编译器对CAS指令封装之后的一个内建函数 */
    #define atomic_cas(p, old, new) __sync_bool_compare_and_swap (p, old, new)
    #define likely(x) __builtin_expect(!!(x), 1)
    #define unlikely(x) __builtin_expect(!!(x), 0)
#else
    #error "atomic operations are supported only by GCC"
#endif

#define SHM_KEY 123456

struct attr_node
{
    unsigned int id;
    unsigned int value;
};

void *shm_create(uint64_t shm_key, int ele_size, int ele_count)
{
    uint32_t size = ele_count*ele_count;

    /* 创建共享内存 */
    int shmid = shmget(shm_key, size, IPC_CREAT);
    if (shmid < 0) {
        perror("shmget error :");
        return NULL;
    }

    /* 映射地址 */
    void *addr = shmat(shmid, NULL, 0);
    if(addr == (void *)-1) {
        perror("shmat error :");
        
        /* 删除shmid */
        if (shmctl(shmid, IPC_RMID, NULL) == -1) {
            perror("shmctl IPC_RMID error :");
        }

        return NULL;
    }

    return addr;
}

int shm_write(void *shm_addr, int id, uint32_t value, uint32_t old_value)
{
    struct attr_node *node = (struct attr_node *)shm_addr + id;
   
    int success = atomic_cas(&(node->value), old_value, value);
    if (success) {
        return 0;
    } else {
        return -1;
    }       
    
}

int shm_read(void *shm_addr, void *buf, int id)
{

    void *start_addr = (struct attr_node *)shm_addr + id;
    memcpy(buf, start_addr, sizeof(struct attr_node));

    return 0;
}


int main(int argc, char *argv[])
{
    if (argc < 2){
        printf("usage: ./write id\n");
        return -1;
    }

    void *shm_addr = shm_create(SHM_KEY, sizeof(struct attr_node), 10);
    if (shm_addr == NULL) {
        printf("sq_create error\n");
        return -1;
    }

    struct attr_node *node = NULL;
    node = malloc(sizeof(struct attr_node));
    if (node == NULL){
        printf("malloc error\n");
        return -1;
    }

    int id = 0;
    if (strcmp(argv[1], "clear") == 0) {
        id = atoi(argv[2]);
        shm_read(shm_addr, node, id);
        shm_write(shm_addr, id, 0, node->value);
        
        shm_read(shm_addr, node, id);
        printf("id = %d\nnode->value = %u\n", id, node->value);
        return 0;
    } else {
        id = atoi(argv[1]);
    }
    
    uint32_t count = 0;
    uint32_t i = 0; 
    for (i = 0; i < 100000; i++)
    {
        /* 如果更新失败，重新读取最新的值再次重试，也可以限制一个重试次数 */
        for (;;) {
            shm_read(shm_addr, node, id);
            uint32_t old_value = node->value;
            ++node->value;
            int ret = shm_write(shm_addr, id, node->value, old_value);
            if (ret == 0)
                break;
            
            count++;
        }
    }
    
    printf("conflict count = %d\n", count);
    
    shm_read(shm_addr, node, id);
    printf("node->value = %u\n", node->value);

    return 0;
}
```

编写一个脚本开启四个进程同时运行：

```shell
#! /bin/bash

./write 0 &
./write 0 &
./write 0 &
./write 0 &

程序执行的结果，每次的输出都不一样，但是最终值都是400000：
conflict count = 27172
node->value = 160793
conflict count = 45600
node->value = 331296
conflict count = 49625
node->value = 387305
conflict count = 62732
node->value = 400000
```
