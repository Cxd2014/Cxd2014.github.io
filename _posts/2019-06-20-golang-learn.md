---
layout: post
title:  "golang学习笔记"
date:   2019-06-20 10:20:10
categories: programming
tags: golang go
---

* content
{:toc}

### defer语句

defer标记的函数调用会在return语句更新返回值变量后再执行，你可以在一个函数中执行多条defer语句，它们的执行顺序与声明顺序相反。
defer语句经常被用于处理成对的操作，如打开、关闭、连接、断开连接、加锁、释放锁。  
通过defer机制，不论函数逻辑多复杂，都能保证在任何执行路径下，资源被释放。释放资源的defer应该直接跟在请求资源的语句后。  

当panic异常发生时，程序会中断运行，并立即执行在该goroutine中被defer的函数。
在Go的panic机制中，延迟函数的调用在释放堆栈信息之前。  

### Channels

channel对应一个make创建的底层数据结构的引用。当我们复制一个channel或用于函数参数传递时，我们只是拷贝了一个channel引用，因此调用者和被调用者将引用同一个channel对象。  
Channel还支持close操作，用于关闭channel，随后对基于该channel的任何发送操作都将导致panic异常。对一个已经被close过的channel进行接收操作依然可以接受到之前已经成功发送的数据；如果channel中已经没有数据的话将产生一个零值的数据。  

一个基于无缓存Channels的发送操作将导致发送者goroutine阻塞，直到另一个goroutine在相同的Channels上执行接收操作，当发送的值通过Channels成功传输之后，两个goroutine可以继续执行后面的语句。反之，如果接收操作先发生，那么接收者goroutine也将阻塞，直到有另一个goroutine在相同的Channels上执行发送操作。基于无缓存Channels的发送和接收操作将导致两个goroutine做一次同步操作。因为这个原因，无缓存Channels有时候也被称为同步Channels。  

带缓存的Channel内部持有一个元素队列。队列的最大容量是在调用make函数创建channel时通过第二个参数指定的。
向缓存Channel的发送操作就是向内部缓存队列的尾部插入元素，接收操作则是从队列的头部删除元素。如果内部缓存队列是满的，那么发送操作将阻塞直到因另一个goroutine执行接收操作而释放了新的队列空间。相反，如果channel是空的，接收操作将阻塞直到有另一个goroutine执行发送操作而向队列插入元素。  

select会等待case中有能够执行的case时去执行。当条件满足时，select才会去通信并执行case之后的语句；这时候其它通信是不会执行的。一个没有任何case的select语句写作select{}，会永远地等待下去。  
如果多个case同时就绪时，select会随机地选择一个执行，这样来保证每一个channel都有平等的被select的机会。

### 包的导入

Go语言程序的初始化和执行总是从main.main函数开始的。但是如果main包导入了其它的包，则会按照顺序将它们包含进main包里。如果某个包被多次导入的话，在执行的时候只会导入一次。当一个包被导入时，如果它还导入了其它的包，则先将其它的包包含进来，然后创建和初始化这个包的常量和变量，再调用包里的init函数，如果一个包有多个init函数的话，调用顺序未定义，同一个文件内的多个init则是以出现的顺序依次调用（init不是普通函数，可以定义有多个，所以也不能被其它函数调用）。  
最后，当main包的所有包级常量、变量被创建和初始化完成，并且init函数被执行后，才会进入main.main函数，程序开始正常执行。  

要注意的是，在main.main函数执行之前所有代码都运行在同一个goroutine，也就是程序的主系统线程中。因此，如果某个init函数内部用go关键字启动了新的goroutine的话，新的goroutine只有在进入main.main函数之后才可能被执行到。  

### 接口

Go的接口类型是对其它类型行为的抽象和概括；因为接口类型不会和特定的实现细节绑定在一起，通过这种抽象的方式我们可以让对象更加灵活和更具有适应能力。  
很多面向对象的语言都有相似的接口概念，但Go语言中接口类型的独特之处在于它是满足隐式实现的鸭子类型。所谓鸭子类型说的是：只要走起路来像鸭子、叫起来也像鸭子，那么就可以把它当作鸭子。Go语言中的面向对象就是如此，如果一个对象只要看起来像是某种接口类型的实现，那么它就可以作为该接口类型使用。  
这种设计可以让你创建一个新的接口类型满足已经存在的具体类型却不用去破坏这些类型原有的定义；当我们使用的类型来自于不受我们控制的包时这种设计尤其灵活有用。Go语言的接口类型是延迟绑定，可以实现类似虚函数的多态功能。

Interface的实现：  
[深入理解 Go Interface](http://legendtkl.com/2017/06/12/understanding-golang-interface/)  
[interface](https://tiancaiamao.gitbooks.io/go-internals/content/zh/07.2.html)

### 参考

最近一直在看Go语言相关的书籍和博客，写一篇文章记录一下，另外看了慕课网的一个Go语言教程，跟着写了一个[外部排序程序](https://github.com/Cxd2014/ProgramTool/blob/master/go_sort.go)。主要用于学习Go语言的协程和channel。

[Go语言圣经](https://docs.hacknode.org/gopl-zh/index.html)  
[Go语言高级编程](https://chai2010.gitbooks.io/advanced-go-programming-book/content/)  
[Everything you need to know about Packages in Go](https://medium.com/rungo/everything-you-need-to-know-about-packages-in-go-b8bac62b74cc)
[Go Web 编程](https://github.com/astaxie/build-web-application-with-golang/tree/master/zh)  
[GO源码分析](http://legendtkl.com/categories/golang/)  
[深入解析Go](https://tiancaiamao.gitbooks.io/go-internals/content/zh/01.0.html)

