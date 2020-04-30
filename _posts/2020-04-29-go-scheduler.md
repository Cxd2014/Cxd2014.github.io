---
layout: post
title:  "GO调度器"
date:   2020-04-29 10:20:10
categories: programming
tags: go 调度器
---

* content
{:toc}

### GO调度器模型

GO的调度器可以充分利用多核心CPU，任何时候都有M个go协程在N个系统线程上进行调度，
这些线程在最多`GOMAXPROCS`个CPU核心上运行，这种调度模型称之为GMP模型：

* G : 协程(goroutine)
* M : 系统线程(machine)
* P : 处理器(processor)

如下图，每个P都有一个本地队列存放待运行的G，另外有一个全局队列，每个M需要依附在P上运行，一个P可以对应多个M，
但是同一时间一个P上只会有一个正在运行的M。

![scheduler-concepts]({{"/css/pics/go_scheduler/scheduler-concepts.png"}})  

每轮调度只需要找一个可运行的G执行它就行，这个查找过程如下：

```go
runtime.schedule() {
    // 1/61 的概率去全局队列找一个G来运行
    // 如果没有找到，到本地队列中找
    // 如果没有找到，
    //     尝试从其他的P中偷取G来运行
    //     如果没有，检查全局队列
    //     如果没有，检查 Net Poller
}
```

### GO协程的状态

GO协程和线程一样有三种状态，一个协程可以处于下面三种状态中的一种：`Waiting`，` Runnable` 和 `Executing`。

* Waiting : 这种状态意味着协程被暂停运行需要等待某些事情完成才能继续运行。
比如等待一个系统调用的返回或者一个同步调用（原子或者锁操作）。这种类型的延时是性能低下的主要原因。

* Runnable : 这种状态说明协程正在等待被运行。如果有很多协程都在等待运行，那么协程需要等待一段更长的时间，
而且每个协程被分配的运行时间也会减少。这种调度延时也是一种性能低下的原因。

* Executing : 这种状态说明此协程被放在了M中正在执行它的指令。

### 调度时机

GO程序中的下列4类事件可以触发调度器执行调度任务。并不是说这些事件发生时调度器一定会执行调度，只是说此时调度器有机会执行调度：

* 使用`go`关键字的地方，`go`关键字用于创建协程。在一个新的协程被创建的时候，就会给调度器一个机会执行调度任务。
* 垃圾回收，GC是在自己的一套协程中运行，所以在GC过程中需要被调度执行，在GC过程中调度器会优先调度需要接触堆内存的协程
* 系统调用，在系统调用时会导致协程阻塞这个M，调度器会将此协程调度出去或者使用一个新的M来执行队列中的其他协程。
* 同步和编排， atomic，mutex和channel操作都可能会阻塞这个协程，此时调度器可以调度一个新的协程来运行。

### 异步调用

大多数操作系统都支持网络轮询，例如MacOS的kqueue，Linux的epoll接口。Go会利用网络轮询接口来异步处理网络请求，
当G调用网络系统调用时调度器会将此G调度出去以避免M被阻塞，然后调度队列中的其他G继续执行，因此不需要创建一个新的M，减少调度开销。

在图1中，Goroutine-1正在M上运行，此时本地队列中有3个G在等待运行，网络轮询器上是空的。  
![94_figure3]({{"/css/pics/go_scheduler/94_figure3.png"}})    
图2中，Goroutine-1希望进行网络系统调用，此时将Goroutine-1移至网络轮询器上处理异步网络系统调用然后将Goroutine-2调度到M上继续运行。  
![94_figure4]({{"/css/pics/go_scheduler/94_figure4.png"}})    
图3中，网络调用完成，此时Goroutine-1被放回本地队列中，当调度到Goroutine-1时，它可以继续执行接下来的指令，这里最大的好处是执行网络系统调用不需要额外的M，
网络轮询器实际是一个系统线程专门用于处理异步网络请求。  
![94_figure5]({{"/css/pics/go_scheduler/94_figure5.png"}})  

### 同步调用

当G调用同步系统调用时会怎样？例如文件相关的系统调用以及使用CGO时调用C函数也是同步调用，此时M会被此G阻塞。

图4中，Goroutine-1正在M1上运行，他要执行同步系统调用，此时会阻塞M1。  
![94_figure6]({{"/css/pics/go_scheduler/94_figure6.png"}})  
图5中，调度器可以探测出M1被Goroutine-1阻塞了，此时调度器会将M1和P分开，但是Goroutine-1还是在M1上。
然后搞一个M2继续在P上运行，此时可以调度Goroutine-2继续执行。GO会维护一个线程池只有线程池中没有M才会创建新的M，所以这种M切换是非常快的。  
![94_figure7]({{"/css/pics/go_scheduler/94_figure7.png"}})  
图6中，Goroutine-1的同步阻塞调用完成，此时Goroutine-1会被转移到P的本地队列中待被调度执行，此时M1会被放在线程池待下次使用。  
![94_figure8]({{"/css/pics/go_scheduler/94_figure8.png"}})  

### 任务窃取

任务窃取作用是平衡P之间的负载，如果某个P上的G都执行完了，此时会检查其他P上有没有可执行的G，如果有则会窃取其他P上的G来执行。

图7中，有两个P，每个P上有4个G，全局队列中也有一个G。
![94_figure9]({{"/css/pics/go_scheduler/94_figure9.png"}})  
图8中，P1上的G全部执行完了，但是P2和全局队列上还有G待执行。此时P1需要窃取其他G来执行，窃取规则和调度规则是一样的参考上面的`runtime.schedule`。
![94_figure10]({{"/css/pics/go_scheduler/94_figure10.png"}})  
图9中，根据窃取规则，P1会将P2上一半的G窃取过来执行。  
![94_figure11]({{"/css/pics/go_scheduler/94_figure11.png"}})  
图10中，如果此时P2上的G都执行完了，并且P1的本地队列中也没有G了会怎么办？  
![94_figure12]({{"/css/pics/go_scheduler/94_figure12.png"}})  
图11中，P2上的G都执行完，它要开始窃取任务，但是P1上也没有G了，根据窃取规则他会把全局队列上的G拿过来执行。  
![94_figure13]({{"/css/pics/go_scheduler/94_figure13.png"}})  

### 参考

这篇文章基本上是翻译下面的文章，然后加了一些自己的理解。

[Scheduling In Go : Part II - Go Scheduler](https://www.ardanlabs.com/blog/2018/08/scheduling-in-go-part2.html)  
[Go 语言设计与实现](https://draveness.me/golang/docs/part3-runtime/ch06-concurrency/golang-goroutine/)  
[Go's work-stealing scheduler](https://rakyll.org/scheduler/)  
