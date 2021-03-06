---
layout: post
title:  "基于Lua和C实现的HTTP服务器"
date:   2017-12-20 10:10:10
categories: network
tags: Lua epoll http server
---

* content
{:toc}

### 前言

首先需要说明的是做这个小项目纯粹出于学习目的，目前还没有多大的实用价值。只是觉得使用Lua和C结合来实现一个HTTP服务器的这种架构非常简洁和易用，值得专门造一个轮子来深入了解和学习这种用法，顺便也实际动手体验一下实现一个HTTP服务器的感觉，当然里面还有很多不完整或者说没有考虑周全的地方：比如接收HTTP请求的时候默认了HTTP请求头的所有数据都在一个数据包中一次性读取完成，这在生产环境中肯定不行（这个问题留着以后解决吧）。   

首先介绍一下这个HTTP服务器实现的功能：

1. 可以在Lua脚本中注册URL，浏览器访问这个URL时可以调用执行Lua中注册的钩子函数，实现HTTP服务器的业务逻辑使用Lua脚本语言来处理。
2. 使用epoll系统调用，实现数据的接收和发送都是单进程异步的方式。
3. Log日志系统，提供一个分级的日志接口，实现将所有日志都存储在一个日志文件中。

实现这么一个HTTP服务器可以学习到的东西：

1. Lua和C两种语言之间的交互过程，以及如何使用C来编写Lua的函数库。
2. epoll系统调用实现数据的异步接收和发送
3. Log日志的集中处理
4. 一个HTTP服务器的完整处理流程：接受到请求、解析请求、请求处理、构造请求回复头、发送请求文件给浏览器。


### Lua注册钩子函数的实现

在`lua/task_test.lua`文件中给出了Lua中注册钩子函数的示例程序，首先要加载`libtask`这个库，然后调用`task.regExecutor("HTTPGET:/lua_hello.html", 0, callback)`来注册钩子函数，他的意思是假如你使用GET请求访问这个链接`http://server_ip/lua_hello.html`时会调用到Lua中的`callback`函数。其中第二个参数`0`表示这个钩子函数的优先级，也就是说同一个URI可以注册多个钩子函数来处理，然后服务器会按照这个优先级来依次调用注册的钩子函数。   

注册钩子函数的功能是在`libtask.c`这个文件中实现的，它的实质就是以URI为哈希的Key，一个任务的结构体指针为Value存储在哈希表中（一个任务结构体就是一个钩子函数执行时所需要的所有元素的集合）。因为需要支持一个URI可以注册多个钩子函数所以每个哈希槽中存储的是一个链表头，然后这个链表上按照优先级顺序挂着这个URI注册的所有任务。当HTTP请求到来时，以URI来查询哈希表找到对应的链表，然后遍历执行链表上的所有任务。如图：   
![hash]({{"/css/pics/hash.jpg"}})    
图1. 原谅我的画图水平

其中HTTP请求时的所有参数也全部解析为键值对，存放在一个哈希表中，Lua中通过`local param = task:getParam()`接口可以获取到参数的引用，然后调用`param:get("User-Agent")`获取到对于的值，其中`lua/param_test.lua`文件中给出了使用示例。

Lua钩子函数处理请求之后的返回数据通过调用`task:replay(replay)`其中`replay`参数组织为一个table表，传递到C中然后合并为一个返回请求，其中`lua/return_test.lua`文件中给出了使用示例。

### epoll

网上关于epoll、select分析的文章到处都是，在这里就只记录一些比较重要的地方：   
关于select调用的几个缺点：   
1. select监听的句柄有最大数量的限制，在Linux上的限制是1024。除非修改代码重新编译内核不然不能改变这个限制。
2. 每次调用select时都要将监听的所有句柄全部下发到内核，select返回时也是将所有句柄全部上传给用户空间，这种来回复制非常消耗性能。
3. 每次调用select时，在内核中都需要遍历所有句柄，将它们挨个放到等待队列中。

而epoll克服了上述所有缺陷，他没有最大数量的限制，它是通过一个专门的函数接口来增加或者删除你需要监听的句柄，所以不必每次都全部下发一边，并且它接收到事件返回的时候也只是将当前就绪的句柄返回给用户空间而不是所有句柄。其中epoll中需要关注的一点是它的两种模式：LT模式与ET模式，它们之间的区别是：

* LT模式，水平触发，只要条件保持就会触发。
* ET模式，边沿触发，只有新事件到来才会触发。

例如，一个`pipe`在`epoll`上注册接收数据事件，当有数据到来时`epoll_wait`返回，此时当我们从缓冲区只读取一部分数据时，如果是`水平触发`模式，下次调用`epoll_wait`时会立即返回，直到所有数据都被读取完。如果是`边沿触发`模式，`epoll_wait`只会在有新数据再次到来时才会返回。翻译：[wiki epoll](https://en.wikipedia.org/wiki/Epoll)

这两种区别在内核中的实现参考这篇文章：[Linux内核epoll ET/LT辨析](http://www.pandademo.com/2016/11/the-discrimination-of-linux-kernel-epoll-et-and-lt/)    
`select`在内核中的实现参考这篇文章：[Linux内核select源码剖析](http://www.pandademo.com/2016/11/linux-kernel-select-source-dissect/)   
epoll、select之间的区别参考这篇文章：[select、poll、epoll之间的区别总结[整理]](http://www.cnblogs.com/Anker/p/3265058.html)

### HTTP的处理

其中HTTP头的解析是自己写的一个非常简陋的解析器，其中将URL中携带的参数和请求头中的所有参数解析成key-value的形式，全部放在了一个哈希表中传递到Lua中，在Lua中可以通过key来获取参数值。Lua回调函数处理完成后的返回数据是通过一个table表传递到C语言中，然后通过这个表构造HTTP的返回头部，返回给浏览器。当然这个HTTP服务器也可以返回文件给浏览器，返回文件全部在C中做的，通过Linux的一个`sendfile`系统调用实现异步发送数据到客户端。

### 编译

首先需要下载Lua5.2.4的源码编译安装，另外我将Lua编译为一个动态库放在了源码目录，程序执行时加载动态库和其他Lua库一样。我已经将所需的库文件放在了源码目录，下载后直接make就行。

[源码](https://github.com/Cxd2014/lua_epoll_server)
