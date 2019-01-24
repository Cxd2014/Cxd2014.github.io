---
layout: post
title:  "Nginx - 启动流程"
date:   2019-01-24 10:20:10
categories: network
tags: Nginx 源码分析
---

* content
{:toc}

断断续续看Nginx的源码差不多有一年多的时间了，一直准备写几篇文章来深入了解一下，一直没有下定决心来写，就从这篇文章开始吧。本文主要从整体上了解一下Nginx的架构，以及Nginx的启动流程。

### nginx架构

nginx的目标是提供一个高性能，高并发，可扩展的web服务器，所以nginx的代码架构实现为模块化、事件驱动、异步、非阻塞、单线程的。
nginx大量使用多路复用和事件通知机制，连接请求会被分发到不同的worker进程中去处理，每个worker进程每秒可以并发处理数千个请求连接。   
nginx的架构如下图，一个Master进程管理多个Worker进程，Worker进程通过`kqueue`、`epoll`等事件通知机制循环处理连接请求，具体的请求处理逻辑是通过注册到进程中的各个模块来处理的。  
![architecture]({{"/css/pics/nginx/architecture.png"}})    

### 请求分发

因为Nginx会同时启动多个worker进程，80端口是各worker进程所共享的，多进程同时listen 80端口就会产生竞争，当一个请求到来时内核会唤醒所有worker进程，谁能抢到连接谁就去处理，而其他进程则继续进入休眠状态，这就是所谓的`惊群效应`。当然Nginx也实现了一种锁机制，当进程被唤醒时会先去获得锁，谁获得锁之后再去调用`accept`，这样就避免了多进程同时调用`accept`（需要配置才会开启accept锁机制）。   
![distribution]({{"/css/pics/nginx/distribution.png"}})    
[accept锁](http://tengine.taobao.org/book/chapter_06.html#accept-40)

自Nginx 1.9.1之后开始支持socket的portreuse新特性，此时当请求到来时内核不会唤醒所有监听的进程，而是仅唤醒其中一个进程来处理请求，其他进程没有任何影响继续休眠。也就是说之前请求的分发靠进程自己去抢，而现在是靠内核来主动分配   
![distribution2]({{"/css/pics/nginx/distribution2.png"}})    

### nginx启动流程

nginx的启动是从`/src/core/nginx.c`文件中的main函数开始执行的，代码的开始当然是读取配置以及各种初始化，这里只关心网络的初始化以及master进程和worker进程的启动。master进程会完成所有的初始化工作，然后调用`fork()`函数来启动worker进程，这样所有的初始化工作就相当于直接继承给了worker进程，网络初始化也是如此。网络的初始化主要是在`ngx_open_listening_sockets`函数中进行的：
```c
ngx_int_t
ngx_open_listening_sockets(ngx_cycle_t *cycle)
{
    /* 代码有删减，这里只看重要的部分 */
    log = cycle->log;

    /* 如果初始化失败，进行多次尝试 */
    for (tries = 5; tries; tries--) {
        failed = 0;

        /* for each listening socket */

        ls = cycle->listening.elts;
        for (i = 0; i < cycle->listening.nelts; i++) {

            if (ls[i].ignore) {
                continue;
            }
            /* 创建socket */
            s = ngx_socket(ls[i].sockaddr->sa_family, ls[i].type, 0);

            if (s == (ngx_socket_t) -1) {
                ngx_log_error(NGX_LOG_EMERG, log, ngx_socket_errno,
                              ngx_socket_n " %V failed", &ls[i].addr_text);
                return NGX_ERROR;
            }

            if (setsockopt(s, SOL_SOCKET, SO_REUSEADDR,
                           (const void *) &reuseaddr, sizeof(int))
                == -1)
            {
                ngx_log_error(NGX_LOG_EMERG, log, ngx_socket_errno,
                              "setsockopt(SO_REUSEADDR) %V failed",
                              &ls[i].addr_text);

                if (ngx_close_socket(s) == -1) {
                    ngx_log_error(NGX_LOG_EMERG, log, ngx_socket_errno,
                                  ngx_close_socket_n " %V failed",
                                  &ls[i].addr_text);
                }

                return NGX_ERROR;
            }

#if (NGX_HAVE_REUSEPORT)
            /* 如果系统支持端口复用，并且配置了端口复用，则设置SO_REUSEPORT */
            if (ls[i].reuseport && !ngx_test_config) {
                int  reuseport;

                reuseport = 1;

                if (setsockopt(s, SOL_SOCKET, SO_REUSEPORT,
                               (const void *) &reuseport, sizeof(int))
                    == -1)
                {
                    ngx_log_error(NGX_LOG_EMERG, log, ngx_socket_errno,
                                  "setsockopt(SO_REUSEPORT) %V failed",
                                  &ls[i].addr_text);

                    if (ngx_close_socket(s) == -1) {
                        ngx_log_error(NGX_LOG_EMERG, log, ngx_socket_errno,
                                      ngx_close_socket_n " %V failed",
                                      &ls[i].addr_text);
                    }

                    return NGX_ERROR;
                }
            }
#endif
            /* 设置为非阻塞 */
            if (!(ngx_event_flags & NGX_USE_IOCP_EVENT)) {
                if (ngx_nonblocking(s) == -1) {
                    ngx_log_error(NGX_LOG_EMERG, log, ngx_socket_errno,
                                  ngx_nonblocking_n " %V failed",
                                  &ls[i].addr_text);

                    if (ngx_close_socket(s) == -1) {
                        ngx_log_error(NGX_LOG_EMERG, log, ngx_socket_errno,
                                      ngx_close_socket_n " %V failed",
                                      &ls[i].addr_text);
                    }

                    return NGX_ERROR;
                }
            }

            ngx_log_debug2(NGX_LOG_DEBUG_CORE, log, 0,
                           "bind() %V #%d ", &ls[i].addr_text, s);
            /* 绑定 */
            if (bind(s, ls[i].sockaddr, ls[i].socklen) == -1) {
                err = ngx_socket_errno;

                if (err != NGX_EADDRINUSE || !ngx_test_config) {
                    ngx_log_error(NGX_LOG_EMERG, log, err,
                                  "bind() to %V failed", &ls[i].addr_text);
                }

                if (ngx_close_socket(s) == -1) {
                    ngx_log_error(NGX_LOG_EMERG, log, ngx_socket_errno,
                                  ngx_close_socket_n " %V failed",
                                  &ls[i].addr_text);
                }

                if (err != NGX_EADDRINUSE) {
                    return NGX_ERROR;
                }

                if (!ngx_test_config) {
                    failed = 1;
                }

                continue;
            }

            if (ls[i].type != SOCK_STREAM) {
                ls[i].fd = s;
                continue;
            }
            /* 监听 */
            if (listen(s, ls[i].backlog) == -1) {
                err = ngx_socket_errno;

                /*
                 * on OpenVZ after suspend/resume EADDRINUSE
                 * may be returned by listen() instead of bind(), see
                 * https://bugzilla.openvz.org/show_bug.cgi?id=2470
                 */

                if (err != NGX_EADDRINUSE || !ngx_test_config) {
                    ngx_log_error(NGX_LOG_EMERG, log, err,
                                  "listen() to %V, backlog %d failed",
                                  &ls[i].addr_text, ls[i].backlog);
                }

                if (ngx_close_socket(s) == -1) {
                    ngx_log_error(NGX_LOG_EMERG, log, ngx_socket_errno,
                                  ngx_close_socket_n " %V failed",
                                  &ls[i].addr_text);
                }

                if (err != NGX_EADDRINUSE) {
                    return NGX_ERROR;
                }

                if (!ngx_test_config) {
                    failed = 1;
                }

                continue;
            }

            ls[i].listen = 1;

            ls[i].fd = s;
        }

        if (!failed) {
            break;
        }

        /* TODO: delay configurable */

        ngx_log_error(NGX_LOG_NOTICE, log, 0,
                      "try again to bind() after 500ms");

        ngx_msleep(500);
    }

    if (failed) {
        ngx_log_error(NGX_LOG_EMERG, log, 0, "still could not bind()");
        return NGX_ERROR;
    }

    return NGX_OK;
}
```

初始化完成之后，如果需要起多个worker进程则Master进程会进入`ngx_master_process_cycle`函数中调用`ngx_start_worker_processes`函数来启动worker进程，之后Master进程会在`ngx_master_process_cycle`函数中进入无限循环成为常驻进程，等待外部命令信号的唤醒，然后执行相应命令。worker进程启动之后会进入`ngx_worker_process_cycle`函数中进行worker进程的初始化，然后进入无限循环处理请求。此时nginx全部启动完成，可以处理请求了。


当我们要重启nginx的work进程时，我们会执行`./nginx -s reload`命令，那么这种命令是怎么传递到Master进程然后执行的了？执行命令后nginx还是从main函数开始执行，在`ngx_get_options`函数中解析传递的参数时会设置相应标记，例如如果有`-s`选项时，`ngx_signal`这个指针会指向`reload`这个命令，然后main函数会调用`ngx_signal_process`函数给Master进程发送信号，Master进程收到信号后会被系统唤醒，然后在`ngx_signal_handler`函数中解析信号，回到`ngx_master_process_cycle`函数中的无限循环处理相应命令：
```c
ngx_int_t
ngx_signal_process(ngx_cycle_t *cycle, char *sig)
{
    ssize_t           n;
    ngx_pid_t         pid;
    ngx_file_t        file;
    ngx_core_conf_t  *ccf;
    u_char            buf[NGX_INT64_LEN + 2];

    ngx_log_error(NGX_LOG_NOTICE, cycle->log, 0, "signal process started");

    ccf = (ngx_core_conf_t *) ngx_get_conf(cycle->conf_ctx, ngx_core_module);

    ngx_memzero(&file, sizeof(ngx_file_t));

    file.name = ccf->pid;
    file.log = cycle->log;

    /* master进程的pid会放在nginx.pid文件中，这里的逻辑主要是打开文件，读取pid */
    file.fd = ngx_open_file(file.name.data, NGX_FILE_RDONLY,
                            NGX_FILE_OPEN, NGX_FILE_DEFAULT_ACCESS);

    if (file.fd == NGX_INVALID_FILE) {
        ngx_log_error(NGX_LOG_ERR, cycle->log, ngx_errno,
                      ngx_open_file_n " \"%s\" failed", file.name.data);
        return 1;
    }

    n = ngx_read_file(&file, buf, NGX_INT64_LEN + 2, 0);

    if (ngx_close_file(file.fd) == NGX_FILE_ERROR) {
        ngx_log_error(NGX_LOG_ALERT, cycle->log, ngx_errno,
                      ngx_close_file_n " \"%s\" failed", file.name.data);
    }

    if (n == NGX_ERROR) {
        return 1;
    }

    while (n-- && (buf[n] == CR || buf[n] == LF)) { /* void */ }

    pid = ngx_atoi(buf, ++n);

    if (pid == (ngx_pid_t) NGX_ERROR) {
        ngx_log_error(NGX_LOG_ERR, cycle->log, 0,
                      "invalid PID number \"%*s\" in \"%s\"",
                      n, buf, file.name.data);
        return 1;
    }

    /* 通过 kill 系统函数向Master进程发送相应的信号  */
    return ngx_os_signal_process(cycle, sig, pid);

}
```

### 参考

[Socket Sharding in NGINX Release 1.9.1](https://www.nginx.com/blog/socket-sharding-nginx-release-1-9-1/)   
[nginx](https://www.aosabook.org/en/nginx.html)   
[Nginx开发从入门到精通](http://tengine.taobao.org/book/index.html)   
基于nginx-1.14.0源码分析
