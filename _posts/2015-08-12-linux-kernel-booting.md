---
layout: post
title:  "Linux2.6.38内核启动分析"
date:   2015-08-12 20:40:10
categories: linux
tags: linux kernel 内核启动分析
---

* content
{:toc}


#### Linux 启动的第一阶段

* Uboot最后带着三个参数跳转到内核入口这三个参数分别是  
    1. r0 = 0,
    2. r1 = machine type number discovered in (3) above.
    3. r2 = physical address of tagged list in system RAM.

* Linux运行的第一个文件是arch/arm/boot/compressed/head.S
	1. 这个文件的主要作用是解压Linux内核  `bl	decompress_kernel`
	2. 将内核重定位并复制到内存实际运行地址处

* 内核解压后跳到文件 arch/arm/kernel/head.S 处运行
	1. 确定processor_type     `bl __lookup_processor_type`
	2. 确定machine_type     `bl __lookup_machine_type`
	3. 检查bootloader 传入的参数列表是否合法 `bl __vet_atags`
	4. 创建页表    `bl __create_page_tables`
	5. 清除I/D cache、TLB(页表缓冲)    `ARM(add pc, r10, #PROCINFO_INITFUNC)`
	6. 开启MMU     `b	__enable_mmu`
	7. 切换数据(Copy data segment if needed,clear BSS) `ldr r13, =__mmap_switched`
	8. 最终在`__mmap_switched`函数中跳转到C函数`start_kernel`  


#### Linux 启动的第二阶段

根据config的具体配置，有些函数为空
`start_kernel`函数在 init/main.c 文件


    asmlinkage void __init start_kernel(void) //start_kernel 函数定义
    {
        /*
        *   asmlinkage 
        *   宏的作用：1、让传送给函数的参数全部使用栈式传送，而不用寄存器传送；
        *            2、声明这个函数是给汇编代码调用的；(但是在ARM架构下(/include*linux/linkage.h)，这个宏没有定义，所以没用)
        *   __init
        *   宏的作用：1、告诉编译器将此代码放在制定代码段(.init.text)中 
        *   (/include/linux/init.h) #define __init      __section(.init.text)*__cold notrace
        */
        smp_setup_processor_id();
        //当CPU是多处理器时获取多处理器的ID，当CPU是单核是时此函数为空

        lockdep_init(); 
        //在ARM11中此函数为空，作用是初始化哈希表

        debug_objects_early_init(); 
        //在调试的时候用

        boot_init_stack_canary(); 
        //在ARM11中此函数为空，作用是保护堆栈

        cgroup_init_early(); 
        //控制组的早期初始化，控制组是什么？参考：/Documentation/cgroups/cgroups.txt

        local_irq_disable();
        //关闭系统总中断

        tick_init();
        //作用是初始化时钟事件管理器的回调函数

        boot_cpu_init();
        //激活当前CPU（在内核全局变量中将当前CPU的状态设为激活状态）

        page_address_init();
        //初始化高端内存

        printk(KERN_NOTICE "%s", linux_banner);
        //打印出Linux内核版本等信息

        setup_arch(&command_line);
        //CPU架构相关的初始化，处理uboot传递的tag参数和命令行参数，初始化内存页表

        mm_init_owner(&init_mm, &init_task);
        //内容涉及到内存管理子系统

        setup_command_line(command_line);
        //保存命令行参数

        setup_nr_cpu_ids();
        setup_per_cpu_areas();
        smp_prepare_boot_cpu(); /* arch-specific boot-cpu hooks */
        //这三个函数与多核处理器有关

        build_all_zonelists(NULL);
        //建立系统内存页区链表

        page_alloc_init();
        //当配置了 CONFIG_HOTPLUG_CPU (CPU热拔插)此函数才有用，
        //CPU热拔插 -- 我也是第一次听说，这种高级特性主要针对服务器的多CPU环境和虚拟机中
        //参考 /Documentation/cpu-hotplug.txt

        printk(KERN_NOTICE "Kernel command line: %s\n", boot_command_line);
        //打印command line参数

        parse_early_param();
        parse_args("Booting kernel", static_command_line, __start___param,
               __stop___param - __start___param,
               &unknown_bootoption);
        //解析命令行参数，具体过程不清楚

        pidhash_init();
        //初始化进程PID的哈希表，便于通过PID访问进程结构信息

        vfs_caches_init_early();
        //虚拟文件系统的缓存初始化，目录项缓存(Dentry cache) 节点缓存(Inode-cache)
        //主要是初始化几个哈希表

        sort_main_extable();
        //对内核内部的异常表进行排序

        trap_init();
        //对硬件中断向量进行初始化，在ARM系统里是空函数，没有任何的初始化

        mm_init();
        //设置内核内存分配器，对内存的使用情况进行标记，以及指定哪些内存可以被分配

        sched_init();
        //初始化任务调度器
        //在任何中断前初始化任务调度器
        //Set up the scheduler prior starting any interrupts

        preempt_disable();
        //关闭优先级调度，优先级高的任务可以抢占优先级低的任务

        if (!irqs_disabled()) {
            printk(KERN_WARNING "start_kernel(): bug: interrupts were "
                    "enabled *very* early, fixing it\n");
            local_irq_disable();
        }
        //判断中断是否关闭，若没有则内核会发出警告，并关闭中断

        idr_init_cache();
        //创建IDR机制的内存缓存对象，IDR机制是什么？ 请 google 一下

        perf_event_init();
        //CPU性能监视机制初始化 依赖于 CONFIG_PERF_EVENTS 这个宏，在ARM里面没有配置，所以次函数为空
        //此机制包括CPU同一时间执行指令数，cache miss数，分支预测失败次数等性能参数

        rcu_init();
        //RCU(Read-Copy Update)，顾名思义就是读-拷贝修改，它是基于其原理命名的。对于被RCU保护的共享数据结构，
        //读者不需要获得任何锁就可以访问它，但写者在访问它时首先拷贝一个副本，然后对副本进行修改，
        //最后使用一个回调（callback）机制在适当的时机把指向原来数据的指针重新指向新的被修改的数据。
        //这个时机就是所有引用该数据的CPU都退出对共享数据的操作。

        radix_tree_init();
        //内核radix树算法初始化 Linux基数树(radix tree)

        early_irq_init();
        //前期外部中断描述符初始化，主要初始化数据结构

        init_IRQ();
        //对应构架特定的中断初始化函数  machine_desc->init_irq();
        //也就是运行设备描述结构体中的init_irq函数，此函数一般在板级初始化文件（arch/*/mach-*/board-*.c）中定义

        prio_tree_init();
        //初始化内核基于radix数的优先级搜索树（PST），主要是对其结构体进行初始化。

        init_timers();
        //主要初始化引导CPU的时钟相关的数据结构，注册时钟的回调函数，
        //当时钟到达时可以回调时钟处理函数，最后初始化时钟软件中断处理。

        hrtimers_init();
        //初始化高精度的定时器，并设置回调函数

        softirq_init();
        //初始化软件中断，软件中断与硬件中断区别就是中断发生时，
        //软件中断是使用线程来监视中断信号，而硬件中断是使用CPU硬件来监视中断

        timekeeping_init();
        //函数是初始化系统时钟计时，并且初始化内核里与时钟计时相关的变量

        time_init();
        //构架相关的，旨在开启一个硬件定时器，开始产生系统时钟

        profile_init();
        //函数是分配内核性能统计保存的内存，以便统计的性能变量可以保存到这里
        //内核的性能调试工具

        if (!irqs_disabled())
            printk(KERN_CRIT "start_kernel(): bug: interrupts were "
                     "enabled early\n");
        //提示中断是否过早地打开

        early_boot_irqs_disabled = false;
        //设置启动早期IRQ使能标志，允许IRQ使能

        local_irq_enable();
        //开中断

        /* Interrupts are enabled now so all GFP allocations are safe. */
        gfp_allowed_mask = __GFP_BITS_MASK;
        //使能 GPF (get free page) 内存分配

        kmem_cache_init_late();
        //初始化 slab 内存分配器

        console_init();
        //控制台初始化,现在才可以输出内容到终端，在这之前的输出内容都是保存在缓冲区内的，

        if (panic_later)
            panic(panic_later, panic_param);
        //判断输入的参数是否出错，若出错就打印处错误

        lockdep_info();
        //打印锁的依赖信息，用调试锁，在ARM中此函数为空

        /*
         - Need to run this when irqs are enabled, because it wants
         - to self-test [hard/soft]-irqs on/off lock inversion bugs
         - too:
         */
        locking_selftest();
        //测试锁的 API 是否使用正常
        //依赖于 CONFIG_DEBUG_LOCKING_API_SELFTESTS 宏，在ARM中没有定义此宏
        
        #ifdef CONFIG_BLK_DEV_INITRD
        if (initrd_start && !initrd_below_start_ok &&
            page_to_pfn(virt_to_page((void *)initrd_start)) < min_low_pfn) {
            printk(KERN_CRIT "initrd overwritten (0x%08lx < 0x%08lx) - "
                "disabling it.\n",
                page_to_pfn(virt_to_page((void *)initrd_start)),
                min_low_pfn);
            initrd_start = 0;
        }
        #endif
        // CONFIG_BLK_DEV_INITRD 此宏是配置内核支持 RAM filesystem 和 RAM disk 
        // page_to_pfn() 将mem_map_t类型的页管理单元page,转换为它所管理的页对应的物理页帧号
        // pfn_to_page() 将物理页帧号转换为管理该页的mem_map_t类型指针page
        
        page_cgroup_init();
        //给 (cgroup) 控制组分配内存
        //依赖 CONFIG_CGROUP_MEM_RES_CTLR 和 CONFIG_SPARSEMEM 宏，在ARM中此函数为空

        enable_debug_pagealloc();
        //当分配内存的打印相关信息，调试的时候用

        kmemleak_init();
        //初始化内存泄漏控制器，将泄漏的内存集合重新配置为可用内存
        //依赖 CONFIG_DEBUG_KMEMLEAK 在ARM中次函数为空

        debug_objects_mem_init();
        //建立高速缓冲池跟踪内存操作
        //依赖 CONFIG_DEBUG_OBJECTS 宏，调试的时候使用，在ARM中此函数为空

        setup_per_cpu_pageset();
        //这个函数是创建每个CPU的高速缓存集合数组。因为每个CPU都不定时需要使用一些页面内存和释放页面内存，
        //为了提高效率，就预先创建一些内存页面作为每个CPU的页面集合。

        numa_policy_init();
        // numa 策略初始化 
        //NUMA，它是NonUniform Memory AccessAchitecture的缩写，主要用来提高多个CPU访问内存的速度。
        //因为多个CPU访问同一个节点的内存速度远远比访问多个节点的速度来得快
        //依赖 CONFIG_NUMA 宏，在ARM中此函数为空

        if (late_time_init)
            late_time_init();
        //时钟相关的后期初始化，没找到函数体，是一个函数指针，函数体应该在架构相关的代码里面

        sched_clock_init();
        //初始化调度时钟

        calibrate_delay();
        //校准时间延迟参数值
        //校准原理是计算出cpu在一秒钟内执行了多少次一个极短的循环，   
        //计算出来的值经过处理后得到BogoMIPS 值，   
        //Bogo是Bogus(伪)的意思，MIPS是millions of instructions per second
        //(百万条指令每秒)的缩写

        pidmap_init();
        //函数是进程位图初始化，一般情况下使用一页来表示所有进程占用情况
        
        anon_vma_init();
        //反向映射匿名虚拟内存域（ anonymous VMA）（没有映射文件的虚拟内存）初始化
        //提供反向查找内存的结构指针位置
        //是PFRA（页框回收算法）技术中的组成部分

        #ifdef CONFIG_X86
            if (efi_enabled)
                efi_enter_virtual_mode();
        #endif
        //x86 CPU专用的

        thread_info_cache_init();
        //线程信息缓存初始化，在ARM中此函数为空

        cred_init();
        //分配一块内存用于存放credentials(证书)(详见：Documentation/credentials.txt)

        fork_init(totalram_pages);
        //进程创建机制初始化，为内核"task_struct"分配空间
        //据当前物理内存计算出来可以创建进程（线程）的数量

        proc_caches_init();
        //给进程的各种资源管理结构分配了相应的对象缓存区

        buffer_init();
        //缓存系统初始化，创建缓存头空间
        //Limit the bh occupancy to 10% of ZONE_NORMAL
        //限制 buffer_head 占用 ZONE_NORMAL(896Mb) 的 10%
        //物理内存被划分为三个区来管理，它们是ZONE_DMA、ZONE_NORMAL 和ZONE_HIGHMEM

        key_init();
        //初始化密钥管理器
        //依赖 CONFIG_KEYS 宏

        security_init();
        //内核安全框架初始化
        //依赖 CONFIG_SECURITY_NETWORK 宏

        dbg_late_init();
        //内核调试系统初始化
        //依赖 CONFIG_KGDB 宏

        vfs_caches_init(totalram_pages);
        //虚拟文件系统进行缓存初始化，提高虚拟文件系统的访问速度

        signals_init();
        //初始化信号队列

        page_writeback_init();
        //页回写机制初始化
        //页回写机制 => 将页高速缓存中的变更数据刷新回磁盘的操作

    #ifdef CONFIG_PROC_FS
        proc_root_init();
    #endif
        //proc文件系统初始化 挂载在/proc 目录下
        //proc是一种伪文件系统（也即虚拟文件系统），存储的是当前内核运行状态的一系列特殊文件，
        //用户可以通过这些文件查看有关系统硬件及当前正在运行进程的信息，
        //甚至可以通过更改其中某些文件来改变内核的运行状态

        cgroup_init();
        //控制组初始化，前面有个 cgroup_init_early();
        //Register cgroup filesystem and /proc file, and initialize any subsystems

        cpuset_init();
        /*
          CPUSET功能
          在Linux中要控制每一個程序在那個核心執行，可以使用CPUSET的功能。
          CPUSET是Linux核心2.6版中的一個小模組，它可以讓使用者將多核心的系統切割成不同區域，
          每個區域包括了處理器和实际内存位置。使用者可以指定某個程式只能在特定的區域執行，
          而且該程式不能使用該區域之外的計算資源
        */
        //依赖 CONFIG_CPUSETS 宏

        taskstats_init_early();
        //初始化任务状态相关的缓存、队列和信号量。任务状态主要向用户提供任务的状态信息。
        //初始化读写互斥机制
        //依赖 CONFIG_TASKSTATS 宏

        delayacct_init();
        //初始化每个任务延时计数。当一个任务等CPU运行，或者等IO同步时，都需要计算等待时间
        //依赖 CONFIG_TASK_DELAY_ACCT 宏

        check_bugs();
        //检查CPU配置、FPU等是否非法使用不具备的功能
        //在ARM架构下check_writebuffer_bugs 测试写缓存一致性

        acpi_early_init(); /* before LAPIC and SMP init */
        //ACPI - Advanced Configuration and Power Interface高级配置及电源接口
        //电源管理方面的初始化
        //依赖 CONFIG_ACPI 宏

        sfi_init_late();
        //SFI - Simple Firmware Interface
        //一个轻量级的方法用于平台固件通过固定的内存页表传递信息给操作系统
        //依赖 CONFIG_SFI 宏

        ftrace_init();
        //初始化内核跟踪模块，ftrace的作用是帮助开发人员了解Linux 内核的运行时行为，
        //以便进行故障调试或性能分析

        /* Do the rest non-__init'ed, we're now alive */
        rest_init();
        //后继初始化，主要是创建内核线程init，并运行
    }


#### 参考博文
* [Linux--start_kernel()函数分析](http://www.cnblogs.com/cslunatic/archive/2013/05/11/3072811.html)
* [LINUX](http://www.formosaos.url.tw/linux/kinit.html)
* [Linux内核源码分析](http://blog.chinaunix.net/uid-28489159-id-3549999.html)
* [ARM Linux系统启动](http://www.linuxidc.com/Linux/2011-09/43680p2.htm)
* [Linux Kernel Driver DataBase](http://cateee.net/lkddb/)
