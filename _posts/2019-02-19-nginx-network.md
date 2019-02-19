---
layout: post
title:  "Nginx - 网络初始化"
date:   2019-02-19 10:20:10
categories: network
tags: Nginx 源码分析
---

* content
{:toc}

### 模块的初始化

Nginx在编译的时候会根据默认配置和我们指定的编译选项生成一个`ngx_modules.c`文件，这个文件包含了所有要编译进去的模块。
Nginx在启动时会调用`main`->`ngx_init_cycle`->`ngx_init_modules`函数来调用每个模块的`init_module`函数初始化所有模块，
`init_module`函数是用于模块级的初始化，实际上大多数模块都没有实现`init_module`函数：
```c
ngx_int_t
ngx_init_modules(ngx_cycle_t *cycle)
{
    ngx_uint_t  i;
    /* 遍历所有模块，调用每个模块的init_module函数完成初始化工作 */
    for (i = 0; cycle->modules[i]; i++) {
        if (cycle->modules[i]->init_module) {
            if (cycle->modules[i]->init_module(cycle) != NGX_OK) {
                return NGX_ERROR;
            }
        }
    }

    return NGX_OK;
}
```

上一篇文章中提到work进程最终会进入`ngx_worker_process_cycle`函数，在这个函数里面首先会调用`ngx_worker_process_init`函数完成模块的进程级初始化，然后进入死循环等待事件处理。
在`ngx_worker_process_init`函数中会循环调用所有模块的`init_process`函数进行模块的进程级初始化：
```c
for (i = 0; cycle->modules[i]; i++) {
        if (cycle->modules[i]->init_process) {
            if (cycle->modules[i]->init_process(cycle) == NGX_ERROR) {
                /* fatal */
                exit(2);
            }
        }
    }
```

### EVENT模块事件初始化

首先来看EVENT核心模块对网络事件的初始化，EVENT模块的初始化主要是在`init_process`函数中进行的，EVENT模块实现的`init_process`函数是`ngx_event_process_init`函数。
此函数的主要作用是初始化连接池，然后将监听套接字的事件处理函数挂载到事件循环中去，对于TCP来说当有请求到来时，调用`ngx_event_accept`函数来接收请求。
```c
        /* 设置监听套接字的事件处理函数为 ngx_event_accept */
        rev->handler = (c->type == SOCK_STREAM) ? ngx_event_accept
                                                : ngx_event_recvmsg;

#if (NGX_HAVE_REUSEPORT)

        if (ls[i].reuseport) {
            /* 将监听套接字挂载到事件循环中去 */
            if (ngx_add_event(rev, NGX_READ_EVENT, 0) == NGX_ERROR) {
                return NGX_ERROR;
            }

            continue;
        }

#endif
```


下面来看epoll的事件处理函数`ngx_epoll_process_events`，epoll_wait等待内核唤醒处理事件，如果有可读事件则调用rev->handler函数来处理，
如果有可写事件则调用wev->handler来处理:
```c
static ngx_int_t
ngx_epoll_process_events(ngx_cycle_t *cycle, ngx_msec_t timer, ngx_uint_t flags)
{
    ···
    /* 首先epoll_wait进入内核等待事件唤醒 */
    events = epoll_wait(ep, event_list, (int) nevents, timer);

    ···
    /* 开始循环处理事件 */
    for (i = 0; i < events; i++) {
        c = event_list[i].data.ptr;

        instance = (uintptr_t) c & 1;
        c = (ngx_connection_t *) ((uintptr_t) c & (uintptr_t) ~1);

        rev = c->read;
        ···

        /* 处理可读事件 */
        if ((revents & EPOLLIN) && rev->active) {

            rev->ready = 1;

            if (flags & NGX_POST_EVENTS) {
                queue = rev->accept ? &ngx_posted_accept_events
                                    : &ngx_posted_events;

                ngx_post_event(rev, queue);

            } else {
                /* 调用对应套接字的可读事件处理函数 */
                rev->handler(rev);
            }
        }

        wev = c->write;

        /* 处理可写事件 */
        if ((revents & EPOLLOUT) && wev->active) {

            if (c->fd == -1 || wev->instance != instance) {

                ngx_log_debug1(NGX_LOG_DEBUG_EVENT, cycle->log, 0,
                               "epoll: stale event %p", c);
                continue;
            }

            wev->ready = 1;

            if (flags & NGX_POST_EVENTS) {
                ngx_post_event(wev, &ngx_posted_events);

            } else {
                /* 调用对应套接字的可写事件处理函数 */
                wev->handler(wev);
            }
        }
    }

    return NGX_OK;
}
```

对于监听套接字来说，有可读时间就会进入`ngx_event_accept`函数来接收请求。`ngx_event_accept`函数首先调用`accept`函数接收TCP套接字请求，
对接收到的新套接字创建一个`ngx_connection_t`连接并初始化，然后调用注册进监听套接字`ngx_listening_t`结构体中的`handler`函数进行下一步处理。
对于HTTP请求来说这个`handler`函数由HTTP模块注册，下面会讲到。

### HTTP模块请求初始化

再来看HTTP核心模块对HTTP请求的初始化，
HTTP模块是在nginx启动阶段读取配置时调用HTTP模块的配置解析函数`ngx_http_block`进行初始化的，调用链如下：`main`->`ngx_init_cycle`->`ngx_conf_parse`->`ngx_conf_handler`，
在`ngx_conf_parse`函数中读取并解析配置，然后调用`ngx_conf_handler`函数来查找此配置是属于哪个模块的，找到后调用对应模块注册时各自实现的`set`函数来处理配置。   
对于HTTP模块来说它注册的`set`函数是`ngx_http_block`，所以当遇到`http`这个配置项时就会调用`ngx_http_block`来解析配置并初始化。
```c
static ngx_command_t  ngx_http_commands[] = {

    { ngx_string("http"),
      NGX_MAIN_CONF|NGX_CONF_BLOCK|NGX_CONF_NOARGS,
      ngx_http_block,
      0,
      0,
      NULL },

      ngx_null_command
};
```

`ngx_http_block`函数的作用主要是解析`http`块里面的配置项，然后注册HTTP请求的处理函数，注册调用链如下：`ngx_http_block`->`ngx_http_optimize_servers`->`ngx_http_init_listening`->`ngx_http_add_listening`
在`ngx_http_add_listening`函数中会新建一个`ngx_listening_t`结构体并初始化，其中的`handler`函数设置为`ngx_http_init_connection`。
所以上一节提到接收TCP请求之后调用`handler`函数，就会进入`ngx_http_init_connection`函数中去。

`ngx_http_init_connection`函数的作用主要是将新接收的套接字读事件处理函数设置为`ngx_http_wait_request_handler`，然后设置超时时间，最后将套接字加入到event事件循环中。
当发送HTTP请求时就会直接调用`ngx_http_wait_request_handler`函数来处理HTTP请求头。
```c
void
ngx_http_init_connection(ngx_connection_t *c)
{
    ···
    /* the default server configuration for the address:port */
    hc->conf_ctx = hc->addr_conf->default_server->ctx;

    ctx = ngx_palloc(c->pool, sizeof(ngx_http_log_ctx_t));
    if (ctx == NULL) {
        ngx_http_close_connection(c);
        return;
    }

    ctx->connection = c;
    ctx->request = NULL;
    ctx->current_request = NULL;

    c->log->connection = c->number;
    c->log->handler = ngx_http_log_error;
    c->log->data = ctx;
    c->log->action = "waiting for request";

    c->log_error = NGX_ERROR_INFO;

    rev = c->read;
    /* 设置读事件处理函数 */
    rev->handler = ngx_http_wait_request_handler;
    c->write->handler = ngx_http_empty_handler;

    if (hc->addr_conf->proxy_protocol) {
        hc->proxy_protocol = 1;
        c->log->action = "reading PROXY protocol";
    }

    if (rev->ready) {
        /* the deferred accept(), iocp */

        if (ngx_use_accept_mutex) {
            ngx_post_event(rev, &ngx_posted_events);
            return;
        }

        rev->handler(rev);
        return;
    }

    /* 设置超时时间 */
    ngx_add_timer(rev, c->listening->post_accept_timeout);
    ngx_reusable_connection(c, 1);

    /* 将套接字添加到event事件循环中 */
    if (ngx_handle_read_event(rev, 0) != NGX_OK) {
        ngx_http_close_connection(c);
        return;
    }
}
```

### 总结

至此Nginx的网络请求处理流程就基本梳理清楚了，接下来分析HTTP请求的具体处理过程。   
上面的分析使用的是epoll模型，并且开启了port_reuse选项。   
Nginx网络请求的处理流程大概是：   
1. Nginx的master进程根据work进程的数量N，创建N个监听套接字。
2. event事件模块将监听套接字加入到epoll事件中，并设置事件处理函数为`ngx_event_accept`函数。
3. 当有请求到来时，epoll事件处理函数直接调用`ngx_event_accept`函数来接收请求并调用HTTP模块注册的处理函数`ngx_http_init_connection`。
3. http模块将接收到的新套接字加入到epoll事件中，并设置事件处理函数为`ngx_http_wait_request_handler`函数。
4. 此时TCP连接建立完成，当发送HTTP请求时，epoll事件处理函数直接调用`ngx_http_wait_request_handler`函数来处理请求。

这里还有一个疑问，work进程是怎么进入epoll事件处理函数的？   
work进程在`ngx_worker_process_cycle`函数中无限循环调用`ngx_process_events_and_timers`函数，此函数会调用`ngx_process_events`函数，此函数就是epoll注册的事件处理函数`ngx_epoll_process_events`。


基于nginx-1.14.0源码分析

