---

layout: post
title:  "移植Linux到一个新的处理器架构上 part 2"
date:   2015-11-17 21:40:10
categories: linux
excerpt: 移植Linux内核

---

* content
{:toc}


#### 前言

这篇文章是翻译这三篇文章的第二篇：   
[Porting Linux to a new processor architecture, part 1: The basics](https://lwn.net/Articles/654783/)   
[Porting Linux to a new processor architecture, part 2: The early code](https://lwn.net/Articles/656286/)   
[Porting Linux to a new processor architecture, part 3: To the finish line](https://lwn.net/Articles/657939/)

#### 正文

在`part 1`中我们通过说明（代码无关）的初步步骤为移植Linux到一个新的处理器架构建立了一个基础。这篇文章接着上一篇开始研究启动代码，他包括从汇编启动代码到创建第一个内核线程我们需要怎样写代码。

#### 头文件

就像上一篇文章提到的，`arch`目录下的头文件（我把它们放在`linux/arch/tsar/include/`）由Linux内核要求的架构特定和架构无关代码之间的接口组成。

第一部分头文件（子目录`asm/`）是内核接口的一部分它被Linux内核内部使用。第二部分(`uapi/asm/`)是用户接口的一部分，这意味着这些头文件会暴露在用户空间下，尽管各种C标准库试图重新实现这些头文件而不是包含这些头文件。这些接口不是完全封闭的，很多asm目录下的头文件可以被用户空间使用。

两个接口的头文件数量总共超过100个，也就是为什么头文件是移植Linux的最大任务之一。幸运的是近几年开发者注意到很多处理器架构可以相互分享相似的代码（因为他们经常表现相同的行为），所以这些代码被汇总到[通用头文件层](https://lwn.net/Articles/333569/)（`linux/include/asm-generic/`和`linux/include/uapi/asm-generic/`）

真正有益的是我们可以参考这些通用头文件，而不是通过写适当的Kbuild文件来提供制定版本。例如，`include/asm/Kbuild`典型的头几行代码像这样：
	
	generic-y += atomic.h
    generic-y += barrier.h
    generic-y += bitops.h
    ...

当移植Linux时我担心我只能通过列出所有可能的头文件然后一个一个的检查他们是否可以被通用版本使用还是需要自定义。这样的列表可以根据Linux早已提供的通用头文件创建以及那些自定义头文件可以参考其他架构。

基本上一个特定版本的开发必须要有所有关于这个架构细节的头文件，缓存cache(asm/cache.h)和TLB管理(asm/tlbflush.h),ELF格式(asm/elf.h),使能/失能中断(asm/irqflags.h),页表管理(asm/page.h, asm/pgalloc.h, asm/pgtable.h),上下文切换(asm/mmu_context.h, asm/ptrace.h),字节顺序(uapi/asm/byteorder.h),等等.

#### 启动顺序

正如`part 1`说明的，弄清楚启动顺序对于理解必须按顺序实现的最小架构特定函数集是非常有帮助的。

启动顺列的第一个函数必须亲自写出来通常用汇编代码（我写的函数名叫`kernel_entry()`放在`arch/tsar/kernel/head.S`文件中）。它被定义为当`bootloader`将内核映象加载到内存后跳转到内核映象的入口点。

下面列出了一系列在启动时需要被执行的函数（被标记的函数是架构特定的函数稍后会继续讨论）：

	kernel_entry*
    start_kernel
        setup_arch*
        trap_init*
        mm_init
            mem_init*
        init_IRQ*
        time_init*
        rest_init
            kernel_thread
            kernel_thread
            cpu_startup_entry

#### 早期汇编启动代码

汇编启动代码这个特殊的光环使我刚开始对它产生了恐惧（我确信很多其他的程序员也有是这样），因为它经常被认为是移植过程中最复杂的代码之一。虽然写汇编代码不是一件容易的事情但是早期启动代码不是魔术。它仅仅是执行第一个架构特定的C函数的跳板，因此只需要执行一个短的定义好的任务列表。

当早期启动代码开始执行时，它不知道之前发生了什么事：系统是重启还是刚刚开机？是哪个`bootloader`将内核加载到内存？等等，由于这个原因将处理器设置为已知的状态是安全的。重新设置一个或者几个系统寄存器就可以达到目的，确保处理器处于内核模式并且中断是关闭的。

相似的它也不知道内存的状态。尤其是没有保证放置内核bss段的内存处是否初始化为零，这就是为什么这个段必须清零.

通常Linux接受`bootloader`传递的参数（和程序启动时接受参数的方法是一样的）。例如，这可能是一个[flattened device tree](http://www.devicetree.org/)（FDT）的内存地址（`ARM`，`MicroBlaze`，`openRISC`等等）或者是一些其他的架构特定的结构体。通常这样的参数是通过寄存器传递然后保存到适当的内核变量中。

此时虚拟内存还没有被激活，有趣的是注意观察内核符号他们都被定义在内核虚拟地址空间中，必须通过一个特殊的宏来访问它：x86是`pa()`, OpenRISC是`tophys()`等等。这个宏将内核符号的虚拟地址翻译为对应的物理地址，它作为一个临时的基于软件的翻译机制。

为了使能虚拟内存，页表结构体必须从头开始设置。这个结构体通常作为一个静态变量存放在内核映象中，因为在这个阶段几乎不可能分配内存。相同的原因只有内核映象可以首先通过页表映射，尽可能使用大页内存。根据惯例这个初始页表结构体被`swapper_pg_dir`函数调用然后在整个系统运行过程中作为参考页表结构体。

在许多处理器架构中一个有趣的事情是内核实际上需要被映射两次。第一次映射就是`part 1`描述的直接映射策略（即 访问虚拟地址`0xC0000000`被重定向为物理地址`0x00000000`）。然而另一次映射是临时的当虚拟内存刚刚被使能时但是执行代码还没有跳转到虚拟内存处。第二次映射是一个简单的象征性映射（`identity mapping`）（即 访问虚拟地址`0x00000000`被重定向为物理地址`0x00000000`）

页表结构体已经初始化完成现在可以使能虚拟内存，这意味着内核现在全部运行在虚拟地址空间并且所有内核符号可以通过它的名字正常访问，不需要使用早先的宏翻译方法。

最后一步之一是设置栈寄存器的地址为初始内核栈这样就可以调用C函数了。在许多处理器架构中（SPARC, Alpha, OpenRISC, etc.），另一个寄存器专门用于保存当前线程信息的指针（`thread_info`结构体）。设置这个指针是可选的，因为它可以被当前内核栈指针推导出来（`thread_info`结构体通常放置在内核栈的底部），但是当这个架构允许它可以更加快速和方便的访问。

早期启动代码的最后一步是跳转到Linux提供的第一个架构无关的C函数`start_kernel()`处。

#### 创建内核第一个线程的过程

`start_kernel()`是很多子系统初始化的地方，各种虚拟文件系统缓存和时钟管理的安全框架，控制层等等。在这里我们主要看`start_kernel()`在最后调用`rest_init()`前调用架构特定的几个函数，`rest_init()`函数首先创建连个内核线程然后变为`idle`线程（空闲线程-当CPU空闲时运行此线程）。

__setup_arch()__

`setup_arch()`别看它的名字普通但是做了很多架构特定的事情。当你观察不同架构下的代码时你会发现他们通常做相同的事情，尽管使用不同的方法和顺序。当做一个简单的移植时可以参考`setup_arch()`这个简单的框架。

第一个步骤是知道系统内存的大小。一个基于设备树（`device-tree-based`）的系统可以快速浏览（使用`early_init_devtree()`）`bootloader`提供的`tag`参数列表（`flattened device tree`）来得到可用的物理内存块然后将他们注册到`memblock`层。接下来解析（使用`parse_early_param()`）`bootloader`提供或者是直接包含在设备树中的可以激活有用的特性例如`early_printk()`的启动参数。这里顺序是非常重要的因为设备树可能包含终端设备用于打印显示的物理地址，因此首先需要扫描一遍。

接下来`memblock`层在映射低端内存（`low memory`）区域前需要进一步配置，使内存可以被分配。首先，被内核映象和设备树占用的内存区域会被设置为保留区域以便于稍后被伙伴分配器（`buddy allocator`）从空闲内存池中移除。高端内存和低端内存的分界线（即 哪个物理内存区域是直接映射区）必须确定下来。最后页表结构体可以被清除（清除早期启动代码创建的`identity mapping`）然后映射低端内存区。

内存的最后一步初始化是配置内存区域。物理内存页和不同区域关联：`ZONE_DMA`兼容老的ISA 24-bit DMA地址限制，`ZONE_NORMAL`和`ZONE_HIGHMEM`分别对应低端和高端内存页，更多关于Linux内存分配的知识请看[Linux Device Drivers [PDF]](https://lwn.net/images/pdf/LDD3/ch08.pdf)。

最后内核内存段可以使用源码API和`flattened device tree`创建的结构体`device_node`进行注册。

如果使能了`early_printk()`，这个例子是展示终端在这个阶段的输出信息：

    Linux version 3.13.0-00201-g7b7e42b-dirty (joel@joel-zenbook) \
        (gcc version 4.8.3 (GCC) ) #329 SMP Thu Sep 25 14:17:56 CEST 2014
    Model: UPMC/LIP6/SoC - Tsar
    bootconsole [early_tty_cons0] enabled
    Built 1 zonelists in Zone order, mobility grouping on.  Total pages: 65024
    Kernel command line: console=tty0 console=ttyVTTY0 earlyprintk

__trap_init()__

`trap_init()`的作用是配置中断/异常相关的硬件和软件架构特定的部分。此时一个异常要么使系统立即崩溃或者被`bootloader`设置的处理函数捕获（最终还是导致系统崩溃但是可能提供更多的信息）。

Linux移植过程中在`trap_init()`后面隐藏了另一段更加复杂的代码：中断/异常管理器。它的一大部分必须使用汇编代码编写因为就像早起启动代码一样它处理的是目标架构处理器的特定部分。一个典型的处理器，当中断时会发生以下事情：

* 处理器自动切换到内核模式，禁止中断然后跳转到特定地址处加载中断处理程序。

* 主中断处理函数检查是哪个中断发生了然后跳转到相应的子处理函数。中断向量表经常用来关联特定的处理函数，所以在一些架构上没有主中断处理函数，实际中断事件和中断向量表之间是由硬件自动完成对应关系。

* 子中断处理函数保存当前上下文，处理器状态会被保存起来以便恢复中断。也可能使能中断（使Linux可重入）然后通常跳转到C函数中更好的处理异常。例如当用户程序访问非法内存时C函数可以使用`SIGBUS`信号终止用户程序。

一旦所有中断基础设施到位`trap_init()`初始化中断向量表然后通过一个系统寄存器配置处理器映射主中断处理程序的地址（或者直接是中断向量表的地址）。

__mem_init()__

`mem_init()`的作用是从`memblock`层释放空闲内存给`buddy`分配器（又名页分配器）。`slab`分配器（常用对象的缓存，通过`kmalloc()`访问）和`vmalloc`都是基于`buddy`分配器完成这个最后的任务开始运行的。


`mem_init()`通常打印内存系统的一些信息：

    Memory: 257916k/262144k available (1412k kernel code, \
        4228k reserved, 267k data, 84k bss, 169k init, 0k highmem)
    Virtual kernel memory layout:
        vmalloc : 0xd0800000 - 0xfffff000 ( 759 MB)
        lowmem  : 0xc0000000 - 0xd0000000 ( 256 MB)
          .init : 0xc01a5000 - 0xc01ba000 (  84 kB)
          .data : 0xc01621f8 - 0xc01a4fe0 ( 267 kB)
          .text : 0xc00010c0 - 0xc01621f8 (1412 kB)


__init_IRQ()__

中断网络可以是非常困难和复杂。在一个简单的系统中少量硬件设备的中断线直接连接到处理器的中断入口。在复杂的系统中大量硬件设备连接到众多可编程中断控制器(`PICs`)上，这些`PICs`经常相互级联，组成一个多层的中断网络。设备树（`device tree`）我们让可以简单的描述这个网络而不是在源码中直接指定他们。

`init_IRQ()`函数主要的任务是调用`irqchip_init()`函数来扫描设备树找到所有标明为中断控制器的节点(e.g `PICs`)。然后找到每个节点对应的驱动初始化它。除非目标系统使用早已被支持的中断控制器，通常意味着第一个设备驱动程序需要自己编写。

这样的驱动程序包含一些这样函数：一个初始化函数它将设备映射到内核地址空间也将控制器局部中断线映射到内核IRQ中断号空间（使用`irq_domain`映射库）；一个`mask/unmask`函数它可以配置控制器屏蔽或者不屏蔽指定Linux中断号；最后还有一个控制器指定中断处理函数它可以找到哪个输入时激活的然后调用这个输入注册的中断处理函数（例如，这就是连接到`PIC`上的块设备触发一个中断时相应的中断处理函数怎样被调用的）

__time_init()__

`time_init()`函数的作用是初始化`timekeeping`基础设施的架构特定部分。这个函数的最简版本是依靠设备树仅仅调用连个函数。

首先`of_clk_init()`函数会扫描设备树然后找到所有标明为时钟源的节点然后初始化这个时钟框架。一个非常简单的时钟源节点仅仅定义直接表明它性能的一个固定频率。

然后`clocksource_of_init()`会解析设备树的时钟源节点然后初始化他们相应的驱动。正如内核文档中描述的，linux实际上需要两种`timekeeping`抽象（他们通常由相同的设备提供）：一个时钟源设备提供`monotonically counting`（单调计数？）的基本时间表（例如它可以计算系统的周期），另一个时钟事件设备在时间表上的确定时刻触发一个中断，特别是通过编程设定的时间周期。通过时钟源可以允许精确计时。

时钟源设备的驱动程序可以非常简单，特别是对于一个内存映射的设备，[通用MMIO时钟源驱动程序](http://lxr.free-electrons.com/source/drivers/clocksource/mmio.c)只需要知道设备计数器的寄存器地址。对于时钟事件稍微有些复杂因为驱动程序需要定义怎样编写一个周期和怎样知道它已经结束，以及当定时器中断触发时提供一个中断处理函数。

#### 总结

`start_kernel()`函数的一个主要任务是校准一个`jiffy`的循环数，它是处理器执行内部延时一个`jiffy`的循环数--一个内部时钟周期通常在`1`到`10`个毫秒范围内。成功的实现了校准应该意味着不同的基础设备和驱动已经通过我们刚才提到的架构特定函数设置好了，因为校准需要用到他们。

在下一篇文章中我会展示移植的最后一部分：从创建第一个内核线程到执行`init`进程。

