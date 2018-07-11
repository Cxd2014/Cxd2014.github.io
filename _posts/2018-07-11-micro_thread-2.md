---
layout: post
title:  "微线程代码分析Part2"
date:   2018-07-11 10:20:10
categories: programming
tags: micro thread
---

* content
{:toc}

### 前言

上一篇文章讲解了微线程的基本原理，这篇文章将分析具体的代码逻辑，来观察微线程是怎样创建、切换的？
这里只分析主要逻辑，一些细枝末节的逻辑暂时不考虑。

### 微线程初始化

微线程初始化做了哪些事情：
* 初始化epoll接口
* 初始化线程池，默认开启了2000个微线程作为线程池存放在`_freelist`队列中，微线程初始化的主要工作是给每个微线程分配栈空间，保存微线程的上下文；
    ```c++
    /* 分配、初始化微线程的私有栈空间 */
    bool Thread::InitStack()
    {
        if (_stack) {
            return true;
        }
        /* _stack是每个微线程的私有数据结构，保存了微线程栈的基本信息和索引 */
        ///< 栈索引与栈内存分离, 防越界    
        _stack = (MtStack*)calloc(1, sizeof(MtStack));
        if (NULL == _stack)
        {
            MTLOG_ERROR("calloc stack failed, size %u", sizeof(MtStack));
            return false;
        }

        /* 给栈分配内存空间，微线程栈的大小固定为128K，分配的内存空间大小为128K + MEM_PAGE_SIZE(4K)*2
         * 多分配这两个MEM_PAGE_SIZE的空间放在栈头、栈尾，并设置为不可读写，用于防止栈内存越界，
         * 一旦程序读写这段内存空间，会被终止运行
         */
        int memsize = MEM_PAGE_SIZE*2 + _stack_size;
        memsize = (memsize + MEM_PAGE_SIZE - 1)/MEM_PAGE_SIZE*MEM_PAGE_SIZE;

        static int zero_fd = -1;
        int mmap_flags = MAP_PRIVATE | MAP_ANON;
        /* 为什么要使用 mmap 来分配微线程的栈空间？原因就是为了便于使用mprotect函数来设置保护区 */
        void* vaddr = mmap(NULL, memsize, PROT_READ | PROT_WRITE, mmap_flags, zero_fd, 0);
        if (vaddr == (void *)MAP_FAILED)
        {
            MTLOG_ERROR("mmap stack failed, size %d", memsize);
            free(_stack);
            _stack = NULL;
            return false;
        }
        _stack->_vaddr = (char*)vaddr;
        _stack->_vaddr_size = memsize;
        _stack->_stk_size = _stack_size;
        _stack->_stk_bottom = _stack->_vaddr + MEM_PAGE_SIZE;
        _stack->_stk_top = _stack->_stk_bottom + _stack->_stk_size;
        // valgrind support: register stack frame
        _stack->valgrind_id = VALGRIND_STACK_REGISTER(_stack->_stk_bottom, _stack->_stk_top);
    
        _stack->_esp = _stack->_stk_top - STACK_PAD_SIZE;
        
        /* 设置栈头、栈尾一个MEM_PAGE_SIZE的空间为不可读、不可写的保护区 */
        mprotect(_stack->_vaddr, MEM_PAGE_SIZE, PROT_NONE);
        mprotect(_stack->_stk_top, MEM_PAGE_SIZE, PROT_NONE);

        return true;
    }

     /* 保存微线程的上下文 */
    void Thread::InitContext()
    {
        /* save_context是用汇编写的函数，用于将相关寄存器的值保存到_jmpbuf中，并返回 0
         * _jmpbuf是glibc库中用于保存函数调用上下文定义的数组，setjmp/longjmp中会用到这个数组
         */
        if (save_context(_jmpbuf) != 0)
        {
            /* 当初始化好的微线程被调度执行时，会走到这里，下面会讲到 */
            ScheduleObj::Instance()->ScheduleStartRun(); // 直接调用 this->run?
        }
        
        /* 上下文保存完成之后，调用replace_esp函数将微线程私有栈的指针保存到_jmpbuf中
         * 当下次恢复微线程上下文运行时，所使用的栈空间就是微线程的私有栈空间
         */
        if (_stack != NULL)
        {
            replace_esp(_jmpbuf, _stack->_esp);
        }
    }

    /* 汇编函数 save_context */
    ##
    #  @brief save_context
    ##
        .text
        .align 4
        .globl save_context
        .type save_context, @function
    save_context:
        pop  %rsi			
        xorl %eax,%eax	    # 设置函数返回值为0
        movq %rbx,(%rdi)    # 下面的都是将各寄存器值保存到_jmpbuf中
        movq %rsp,8(%rdi)
        push %rsi	
        movq %rbp,16(%rdi)
        movq %r12,24(%rdi)
        movq %r13,32(%rdi)
        movq %r14,40(%rdi)
        movq %r15,48(%rdi)
        movq %rsi,56(%rdi)	
        ret

        .size save_context,.-save_context

    ```
* 初始化各种队列
* 创建_daemon线程，当没有可运行的微线程时，_daemon线程会被调度执行，他的主要作用是设置超时时间，调用`epoll_wait`函数阻塞整个进程监听所有套接字。
当有事件到来或者超时，将对应套接字的微线程从等待对列中移除，然后加入到可执行队列，然后调用`SwitchContext`函数执行队列中的微线程。
    ```c++
    void MtFrame::DaemonRun(void* args)
    {
        MtFrame* mtframe = MtFrame::Instance();
        MicroThread* daemon = mtframe->DaemonThread(); 

        while (true)
        {
            mtframe->EpollDispath();/* 进入epoll_wait函数 */        
            mtframe->SetLastClock(mtframe->GetSystemMS());
            mtframe->WakeupTimeout(); /* 检查是否有超时请求，如果有也将此微线程加入到可执行队列 */
            mtframe->CheckExpired();
            daemon->SwitchContext(); /* 切换上下文，调度微线程执行 */
        }
    }
    ```
* 创建_primo线程，_primo线程等于原生线程，他没有自己私有的栈空间，使用的是原生线程的栈，也就是将原生线程也作为一个微线程来统一调度

### 微线程的调度过程

微线程框架中有两种方式来执行任务：

1. 实例化一个任务，然后直接调用任务中的`Process()`函数来执行，这种任务的执行方式是串行的，当此任务执行完成之后，才能继续往下执行。
如果遇到网络IO操作被阻塞时，微线程框架会将当前操作的套接字句柄加入到监听队列，然后调度其他微线程执行，将此微线程加入到等待队列；

    ```c++
    /* 网络IO操作被阻塞时都会调用此函数来调度切换微线程 */
    bool MtFrame::EpollSchedule(EpObjList* fdlist, EpollerObj* fd, int timeout)
    {
        MicroThread* thread = GetActiveThread();
        if (NULL == thread)
        {
            MTLOG_ERROR("active thread null, epoll schedule failed");
            return false;
        }

        // 1. 整合该线程需要关心的epoll调度对象，将套接字加入到监听队列
        thread->ClearAllFd();
        if (fdlist) 
        {
            thread->AddFdList(fdlist);
        }
        if (fd) 
        {
            thread->AddFd(fd);
        }

        // 2. 设置epoll监听事件, 调整超时时间, 切换IO等待状态, 触发切换
        thread->SetWakeupTime(timeout + this->GetLastClock());
        if (!this->EpollAdd(thread->GetFdSet()))
        {
            MTLOG_ERROR("epoll add failed, errno: %d", errno);
            return false;
        }

        /* 将当前线程加入到等待队列，调用 SwitchContext 函数，进行微线程上下文的切换
         * 首先是调用上文中提到的汇编函数 save_context 来保存当前线程的上下文，
         * 然后调用 restore_context 汇编函数来恢复下一个要运行的微线程的上下文，
         * 恢复上下文的操作主要是将_jmpbuf数组中的内容恢复到对应的寄存器中
         */
        this->InsertIoWait(thread); 
        thread->SwitchContext();

        /* 当有事件发生或者超时，微线程再次被调度时从这里继续执行 */
        // 3. 调度OK, 判定超时, epoll ctrl 还原状态
        int rcvnum = 0;
        EpObjList& rcvfds = thread->GetFdSet();
        EpollerObj* fdata = NULL;
        TAILQ_FOREACH(fdata, &rcvfds, _entry)
        {
            if (fdata->GetRcvEvents() != 0)
            {
                rcvnum++;
            }        
        }
        this->EpollDel(rcvfds);     // 在一个函数中ADD, DEL 闭环控制

        if (rcvnum == 0)    // 超时处理, 返回错误
        {
            errno = ETIME;
            return false;
        }

        return true;   
    }
    ```

2. 创建一个任务队列，将所有实例化好的任务全部加入到任务队列中，然后调用`mt_exec_all_task`函数执行所有任务，任务队列中的任务是并行的执行的，
等待所有任务执行完成之后当前微线程再继续运行，任务队列中的任务是通过给每个任务创建一个子微线程，来达到并行执行的效果。

    ```c++
    int mt_exec_all_task(IMtTaskList& req_list)
    {
        MtFrame* mtframe    = MtFrame::Instance();
        MicroThread* thread = mtframe->GetActiveThread();
        IMtTask* task       = NULL;
        MicroThread* sub    = NULL;
        MicroThread* tmp    = NULL;
        int rc              = -1;

        MicroThread::SubThreadList list;
        TAILQ_INIT(&list);

        // 防止没有task，导致微线程一直被挂住
        if (0 == req_list.size())
        {
            MTLOG_DEBUG("no task for execult");
            return 0;
        }

        // 1. 创建线程对象
        /* 这里创建线程实际上是从线程池中获取一个线程实例，
         * 设置微线程的执行函数为mt_task_process，在此函数中调用各个任务中的Process()函数来执行
         */
        for (IMtTaskList::iterator it = req_list.begin(); it != req_list.end(); ++it)
        {
            task = *it;
            sub = MtFrame::CreateThread(mt_task_process, task, false);
            if (NULL == sub) 
            {
                MTLOG_ERROR("create sub thread failed");
                goto EXIT_LABEL;
            }
            
            sub->SetType(MicroThread::SUB_THREAD);
            TAILQ_INSERT_TAIL(&list, sub, _sub_entry);
        }

        // 2. 并发执行任务，将所有线程加入到可执行队列
        TAILQ_FOREACH_SAFE(sub, &list, _sub_entry, tmp)
        {
            TAILQ_REMOVE(&list, sub, _sub_entry);
            thread->AddSubThread(sub);
            mtframe->InsertRunable(sub);
        }

        // 3. 等待子线程执行结束
        /* 在此函数中保存当前线程上下文，
         * 然后将当前线程加入到_pend_list队列，
         * 在 ThreadSchdule 函数中，调度其他线程执行
         * 当前线程等待所有子线程执行完成之后，继续运行
         */
        thread->Wait();
        rc = 0;
        
    EXIT_LABEL:

        TAILQ_FOREACH_SAFE(sub, &list, _sub_entry, tmp)
        {
            TAILQ_REMOVE(&list, sub, _sub_entry);
            mtframe->FreeThread(sub);
        }

        return rc;

    }
    ```

考虑一个问题，上面提到线程池中的线程上下文是在`InitContext`函数中执行的，所以恢复一个线程运行时也会从`InitContext`函数中开始执行，
那这里就有一个问题，`InitContext`函数中是怎么调用到`mt_task_process`函数去执行具体的任务了？   
这里要重点关注恢复线程上下文的函数`RestoreContext`，
可以看到它调用汇编函数`restore_context`时传递了两个参数，第一个是_jmpbuf数组，这个没有什么疑问因为`restore_context`函数的主要作用就是将_jmpbuf数组中的内容恢复到对应寄存器中。那第二个参数`1`是干什么用的了？   
查看汇编函数`restore_context`可以看到，他直接将第二个参数设置为`restore_context`函数的返回值。    
在回过头去看`InitContext`函数，当恢复微线程上下文之后，从`save_context`函数之后继续执行，首先他会判断返回值，如果不等于0则调用`ScheduleStartRun`执行任务函数，
所以这里有两种情况，保存上下文的时候`save_context`返回0继续往下执行，恢复上下文的时候返回1，进入`if`语句内执行任务。

    ```c
    void Thread::RestoreContext()
    {
        restore_context(_jmpbuf, 1);    
    }

    void Thread::InitContext()
    {

        if (save_context(_jmpbuf) != 0)
        {
            /* 当初始化好的微线程被调度执行时，会走到这里 */
            ScheduleObj::Instance()->ScheduleStartRun(); // 直接调用 this->run?
        }
        
        if (_stack != NULL)
        {
            replace_esp(_jmpbuf, _stack->_esp);
        }
    }

    ##
    #  @brief restore_context
    ##
        .text
        .align 4
        .globl restore_context
        .type restore_context, @function
    restore_context:
        movl %esi,%eax			# 设置第二个参数1为返回值
        movq (%rdi),%rbx
        movq 8(%rdi),%rsp
        movq 16(%rdi),%rbp
        movq 24(%rdi),%r12
        movq 32(%rdi),%r13
        movq 40(%rdi),%r14
        movq 48(%rdi),%r15
        jmp *56(%rdi)

        .size restore_context,.-restore_context
    ```


