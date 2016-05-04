---
layout: post
title:  "Linux2.6.38内核启动分析之二"
date:   2015-08-12 21:40:10
categories: linux
tags: linux kernel 内核启动分析
---

* content
{:toc}


### start_kernel 调用的最后一个函数rest_init

	static noinline void __init_refok rest_init(void)
	{
		/*
		- noinline 宏的作用
		- 告诉编译器不要将此编译为内联函数
		- __init_refok 宏的作用
		- 使被标记的代码或者数据可以引用 init 段中的的数据或代码而不发出警告
		*/

		int pid;
		rcu_scheduler_starting();
		//RCU锁机制调度启用

		/*
	 	- We need to spawn init first so that it obtains pid 1, however
	 	- the init task will end up wanting to create kthreads, which, if
	 	- we schedule it before we create kthreadd, will OOPS.
		 */
		kernel_thread(kernel_init, NULL, CLONE_FS | CLONE_SIGHAND);
		//创建 init 进程(调用 do_fork 函数)

		numa_default_policy();
		//重置当前进程的默认内存策略为 numa 
		//依赖 CONFIG_NUMA 在ARM中为空函数

		pid = kernel_thread(kthreadd, NULL, CLONE_FS | CLONE_FILES);
		//创建内核线程 kthreadd 该函数的作用是运行kthread_create_list全局链表中维护的kthread。
		//可以调用kthread_create创建一个kthread，它会被加入到kthread_create_list链表中，
		//同时kthread_create会weak up kthreadd_task。
		//kthreadd在执行kthread会调用kernel_thread运行
		//一个名叫“kthread”的内核线程去运行创建的kthread，被执行过的kthread会
		//从kthread_create_list链表中删除，并且kthreadd会不断调用scheduler 让出CPU。

		rcu_read_lock();
		kthreadd_task = find_task_by_pid_ns(pid, &init_pid_ns);
		rcu_read_unlock();
		//通过 PID 得到 kthreadd 的 task_struct 结构体

		complete(&kthreadd_done);
		//通知 init 进程 kthreadd 线程创建完成

		/*
	 	- The boot idle thread must execute schedule()
	 	- at least once to get things moving:
		 */
		init_idle_bootup_task(current);
		//设置当前进程为idle（闲置）进程类

		preempt_enable_no_resched(); //使能抢占
		schedule(); //执行调度程序，切换进程
		preempt_disable(); //禁止抢占

		/* Call into cpu_idle with preempt disabled */
		cpu_idle();
		//此时内核本体进入了idle状态，用循环消耗空闲的CPU时间片，该函数从不返回。
		//在有其他进程需要工作的时候，该函数就会被抢占！这个函数因构架不同而异。
	}


### init进程

	static int __init kernel_init(void * unused)
	{
		/*
	 	- Wait until kthreadd is all set-up.
	 	- 等待直到 kthreadd 全部设置好
		 */
		wait_for_completion(&kthreadd_done);

		/*
	 	- init can allocate pages on any node
	 	- init 可以在任何节点上分配内存页
		 */
		set_mems_allowed(node_states[N_HIGH_MEMORY]);

		/*
	 	- init can run on any cpu.
	 	- init 可以在任何CPU上运行
		 */
		set_cpus_allowed_ptr(current, cpu_all_mask);

		/*
	 	- Tell the world that we're going to be the grim
	 	- reaper of innocent orphaned children.
	 	-  告诉世人我们将成为冷酷的孤儿进程收割者
	 	- We don't want people to have to make incorrect
	 	- assumptions about where in the task array this
	 	- can be found.
	 	- 我们不希望人们做出在任务组里面可以找到孤儿进程这种错误的假设
		 */
		init_pid_ns.child_reaper = current;
		//将当前进程设为收留其他孤儿进程的进程

		cad_pid = task_pid(current);
		//获得当前进程的PID

		smp_prepare_cpus(setup_max_cpus);
		do_pre_smp_initcalls();
		lockup_detector_init();
		smp_init();
		sched_init_smp();
		//多CPU相关的初始化

		do_basic_setup();
		//此时与体系结构相关的部分已经初始化完成，
		//外设及其驱动程序（直接编译进内核的模块）的加载和初始化

		/* Open the /dev/console on the rootfs, this should never fail */
		//打开 /dev/console 设备文件
		if (sys_open((const char __user *) "/dev/console", O_RDWR, 0) < 0)
			printk(KERN_WARNING "Warning: unable to open an initial console.\n");

		(void) sys_dup(0);
		(void) sys_dup(0);
		//sys_dup()的主要工作就是用来“复制”一个打开的文件号，并使两个文件号都指向同一个文件
		//输入/输出重定向为 console 文件

		/*
	 	- check if there is an early userspace init.  If yes, let it do all
	 	- the work
	 	- 检查用户空间是否有 init 程序，如果有让他做所有的工作
		 */

		if (!ramdisk_execute_command)
			ramdisk_execute_command = "/init";

		if (sys_access((const char __user *) ramdisk_execute_command, 0) != 0) {
			ramdisk_execute_command = NULL;
			prepare_namespace();
		}

		/*
	 	- Ok, we have completed the initial bootup, and
	 	- we're essentially up and running. Get rid of the
	 	- initmem segments and start the user-mode stuff..
		 */
		 //OK，我们已经完成了启动初始化，且我们本质上已经在运行。释放初始化用的内存（initmem）段
		 //并开始用户空间的程序

		init_post();
		//此函数在下面分析
		return 0;
	}

### 最后的初始化调用用户空间的 init程序

	static noinline int init_post(void)
	{
		/* need to finish all async __init code before freeing the memory */
		//在释放内存前，必须完成所有的异步 __init 代码
		async_synchronize_full();

		free_initmem();
		//释放 init段的代码

		mark_rodata_ro();
		//依赖 CONFIG_DEBUG_RODATA 宏，在ARM中为空函数

		system_state = SYSTEM_RUNNING;
		//设置系统状态为运行状态

		numa_default_policy();
		//设置 numa 内存访问策略为默认

		current->signal->flags |= SIGNAL_UNKILLABLE;
		//设置当前进程（init）为不可以杀进程

		if (ramdisk_execute_command) {
			run_init_process(ramdisk_execute_command);
			printk(KERN_WARNING "Failed to execute %s\n",
					ramdisk_execute_command);
		}
		//果ramdisk_execute_command有指定的init程序，就执行它

		/*
	 	- We try each of these until one succeeds.
	 	- 我们尝试以下的每个函数，直到有一个成功运行
	 	- The Bourne shell can be used instead of init if we are
	 	- trying to recover a really broken machine.
	 	- shell程序可以代替 init 程序如果我们试图恢复一个垃圾的机器
		 */

		if (execute_command) {
			run_init_process(execute_command);
			printk(KERN_WARNING "Failed to execute %s.  Attempting "
						"defaults...\n", execute_command);
		}
		//如果在启动Linux是传递了如 init=/linuxrc 这种命令时执行 linuxrc 程序

		run_init_process("/sbin/init");
		run_init_process("/etc/init");
		run_init_process("/bin/init");
		run_init_process("/bin/sh");
		//依次尝试执行上面四个目录里面的 init 程序，至此内核完全启动成功，剩余的由
		//用户空间的初始化程序做最后的初始化，如出现登陆界面，启动默认开机启动进程等。

		panic("No init found.  Try passing init= option to kernel. "
		      "See Linux Documentation/init.txt for guidance.");
	}

### 参考博文

* [Linux内核源码分析](http://blog.chinaunix.net/uid-20543672-id-3172321.html)

