---
layout: post
title:  "微线程代码分析Part1"
date:   2018-07-02 10:20:10
categories: programming
tags: micro thread
---

* content
{:toc}

### 前言

以前对微线程、协程等概念非常模糊，不知道这些东西相对于线程来说有啥区别，微线程的作用是什么？   
来到腾讯之后接触到了一种全新的网络开发框架，他使用微线程实现了使用同步的开发模式，而性能却可以达到异步模式的水平（类似于Go语言的协程概念）。   
腾讯QQ后台的大多数模块都是基于此框架开发的，本人对这种网络编程模式非常感兴趣，计划写几篇文章好好分析研究一下他的源码。   

微线程的代码腾讯已经在Github上开源了，可以在这里下载：[微线程代码](https://github.com/Tencent/MSEC/tree/master/spp_rpc/src/sync_frame)

### 微线程简介

首先介绍一下微线程的概念，以及它和传统线程之间的区别：   
* 微线程是一种用户态`线程`，也就是说微线程的运行、调度、切换都是在用户空间由用户自己写的代码完成的，而传统线程的调度切换是在内核空间由操作系统完成的。   
* 站在操作系统的角度来看微线程都是在单线程中运行的，所以无法利用CPU的多核资源，而传统线程是可以在多核上运行的，解决这个问题的办法一般是开多个进程同时运行。

在用户空间完成微线程调度有什么好处了？
* 第一微线程调度的时候不需要陷入内核；
* 第二微线程切换的开销相对于传统线程来说非常小，基本等于一次函数调用的开销；
* 第三微线程的调度时机是用户自己决定的，而传统线程的调度时机完全由内核决定；

总的来说就是微线程的切换开销非常小，这样就可以做到大量微线程并发执行。而传统线程一旦并发量太大时，线程之间的切换是一个非常大的开销，导致整体运行效率非常低。

### 基于微线程的网络开发框架

传统网络开发框架有两种模式：
1. 多线程同步模式，每来一个请求开一个线程来处理，这样进程的创建和销毁是一个非常大的开销，所以又演变为使用线程池来避免线程的频繁创建、销毁，
但是当请求并发量太大时线程的调度切换就成了瓶颈，并且操作系统对线程的最大数量有限制，所以这种模式不适合高并发场景。
2. 基于`select/epoll`网络多路复用的异步模式，这种异步模式可以满足高并发需求，但是由于他是异步的，所以需要保存每次网络请求的上下文维护网络状态，基于状态调度完成请求。
这种模式的缺点是代码逻辑不清晰，难以阅读，状态之间相互依赖，代码的开发维护难度大（`nginx`就是使用的这种模式）。

基于微线程的网络开发框架就是为了解决上述缺点的，对于高并发这个问题微线程使用`epoll`多路复用来满足需求，对于异步的状态调度问题使用微线程调度来解决：当网络请求进入阻塞时保存当前微线程的上下文，并恢复下一个就绪微线程的上下文，完成微线程的调度切换，当没有就绪微线程的时候，则进入`epoll_wait`阻塞整个进程。这样就实现了同步的编码逻辑、异步的执行效果。

#### 微线程调度机制

![schedule]({{"/css/pics/schedule.jpg"}})   
线程调度时机：
1. 用户调用`mt_exec_all_task`创建微线程，并将新建的微线程加入到`_runlist`队列，然后调度微线程；
2. 微线程中调用`mt_udpsendrcv`发送、接收数据包，调用`send`发送数据包，如果发送缓冲区已满，还有数据待发送时将调度微线程；
3. 微线程调用`recvfrom`接收数据报时，直接调度微线程；
4. `epoll`接收到数据包之后，获取此数据包的微线程实例，将此微线程移除`_waitlist`队列，加入到`_runlist`队列中，然后调度微线程执行，从当时被调度的地方继续执行；
5. 当`_runlist`队列中没有可运行的微线程时，整个进程阻塞在`epoll_wait`系统调用上；

注：调度微线程的意思是将当前线程保存上下文加入`_waitlist`队列，然后从`_runlist`队列中获取下一个运行的微线程恢复上下文。

### 微线程测试Demo

```c++
/**
 * @file mt_alone.cpp
 * @info 微线程单独使用事例
 */

#include <stdio.h>
#include <string.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include "mt_incl.h"

#define  REMOTE_IP      "127.0.0.1"
#define  REMOTE_PORT    5574
#define  SEND_PKG    "hello world"
#define  SEND_PKG_LEN   (sizeof(SEND_PKG) - 1)

// Task事例类:使用UDP单发单收接口
class UdpSndRcvTask
    : public IMtTask
{
public:
    virtual int Process() {
        // 获取目的地址信息, 简单示例
        static struct sockaddr_in server_addr;
        static int initflg = 0;

        if (!initflg) {
            memset(&server_addr, 0, sizeof(server_addr));
            server_addr.sin_family = AF_INET;
            server_addr.sin_addr.s_addr = inet_addr(REMOTE_IP);
            server_addr.sin_port = htons(REMOTE_PORT);
            initflg = 1;
        }

        char buff[1024] = SEND_PKG;
        int  max_len = sizeof(buff);
        
        int ret = mt_udpsendrcv(&server_addr, (void*)buff, SEND_PKG_LEN, buff, max_len, 100);
        if (ret < 0)
        {
            printf("mt_udpsendrcv failed, ret %d\n", ret);
            return -1;
        }
        else
        {
            printf("UdpSndRcvTask recvd: %s\n", buff);
            return 0;
        }
    };
};


// 检查报文是否接受完成
int CheckPkgLen(void *buf, int len) {
    if (len < (int)SEND_PKG_LEN)
    {
        return 0;
    }

    return SEND_PKG_LEN;
}

// Task事例类，使用TCP连接池单发单收接口
class TcpSndRcvTask
    : public IMtTask
{
public:
    virtual int Process() {
        // 获取目的地址信息, 简单示例
        static struct sockaddr_in server_addr;
        static int initflg = 0;

        if (!initflg) {
            memset(&server_addr, 0, sizeof(server_addr));
            server_addr.sin_family = AF_INET;
            server_addr.sin_addr.s_addr = inet_addr(REMOTE_IP);
            server_addr.sin_port = htons(REMOTE_PORT);
            initflg = 1;
        }

        char buff[1024] = SEND_PKG;
        int  max_len = sizeof(buff);
        
        int ret = mt_tcpsendrcv(&server_addr, (void*)buff, SEND_PKG_LEN, buff, max_len, 100, CheckPkgLen);
        if (ret < 0)
        {
            printf("mt_tcpsendrcv failed, ret %d\n", ret);
            return -1;
        }
        else
        {
            printf("TcpSndRcvTask recvd: %s\n", buff);
            return 0;
        }
    };
};

// Task事例类: 业务可以用来验证微线程API可用性
class ApiVerifyTask
    : public IMtTask
{
public:
    virtual int Process() {
        // 调用业务使用微线程API
        printf("This is the api verify task!!!\n");

        return 0;
    };
};

int main(void)
{
    // 初始化微线程框架
    bool init_ok = mt_init_frame();
    if (!init_ok)
    {
        fprintf(stderr, "init micro thread frame failed.\n");
        return -1;
    }

    // 触发微线程切换
    mt_sleep(0);

    UdpSndRcvTask task1;
    TcpSndRcvTask task2;
    ApiVerifyTask task3;

    task1.Process();
    mt_sleep(5000);

    // 现在原生线程已经在demon的调度中了
    while (true)
    { 
        // 这里示例一个并发操作
        IMtTaskList task_list;
        task_list.push_back(&task1);
        task_list.push_back(&task2);
        task_list.push_back(&task3);

        int ret = mt_exec_all_task(task_list);
        if (ret < 0)
        {
            fprintf(stderr, "execult tasks failed, ret:%d", ret);
            return -2;
        }

        // 循环检查每一个task是否执行成功，即Process的返回值
        for (unsigned int i = 0; i < task_list.size(); i++)
        {
            IMtTask *task = task_list[i];
            int result = task->GetResult();

            if (result < 0)
            {
                fprintf(stderr, "task(%u) failed, result:%d", i, result);
            }
        }
        printf("\n");
        // 睡眠2000ms
        mt_sleep(2000);
    }

    return 0;
}
```
#### 代码编译

1. 下载[微线程代码](https://github.com/Tencent/MSEC/tree/master/spp_rpc/src/sync_frame)
2. 进入`micro_thread`目录执行make
3. 将Demo例程放在`sync_frame`目录下，执行下面的编译命令：   
    g++ mt_alone.cpp ./micro_thread/libmt.so -ldl -I./micro_thread -o mt_alone

