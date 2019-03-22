---
layout: post
title:  "Nginx - HTTP请求处理"
date:   2019-03-22 10:20:10
categories: network
tags: Nginx 源码分析
---

* content
{:toc}


### 解析HTTP请求头

上一篇文章中说到接收到HTTP请求之后会直接调用`ngx_http_wait_request_handler`函数来处理，此函数的作用是首先分配一块内存缓冲区来存放请求头，
然后调用`c->recv`函数来接收数据，接着为这个请求创建一个`ngx_http_request_t`结构体，然后设置`rev->handler`指针为`ngx_http_process_request_line`函数，
将读事件处理函数设置为此函数，当本次没有接受完全部请求数据时下次数据到来时直接调用`ngx_http_process_request_line`函数，
最后直接调用`ngx_http_process_request_line`函数来处理请求行。

`ngx_http_process_request_line`函数首先判断是不是超时事件，如果是则直接关闭这个请求，然后返回。如果不是则循环解析请求行，
循环中首先会调用`ngx_http_read_request_header`函数，它首先检查缓冲区中是否有新增的数据，如果有则直接返回，如果没有则调用`c->recv`函数来接收数据并返回。
然后调用`ngx_http_parse_request_line`函数来解析请求行，如果解析成功则接下来解析请求头。如果返回`NGX_AGAIN`则说明请求行数据还没有接收完整，
接下来先判断分配的缓冲区是否已满，如果满了则分配一个更大的缓冲区，然后进行下一轮循环，调用`ngx_http_read_request_header`函数接收数据，继续解析请求行。
```c
static void
ngx_http_process_request_line(ngx_event_t *rev)
{
    ssize_t              n;
    ngx_int_t            rc, rv;
    ngx_str_t            host;
    ngx_connection_t    *c;
    ngx_http_request_t  *r;

    c = rev->data;
    r = c->data;

    /* 如果是超时事件则关闭请求，直接返回 */
    if (rev->timedout) {
        ngx_log_error(NGX_LOG_INFO, c->log, NGX_ETIMEDOUT, "client timed out");
        c->timedout = 1;
        ngx_http_close_request(r, NGX_HTTP_REQUEST_TIME_OUT);
        return;
    }

    /* 设置为 NGX_AGAIN */
    rc = NGX_AGAIN;

    /* 循环处理请求行 */
    for ( ;; ) {

        if (rc == NGX_AGAIN) {
            /* 接受数据 */
            n = ngx_http_read_request_header(r);

            if (n == NGX_AGAIN || n == NGX_ERROR) {
                return;
            }
        }
        /* 解析请求行 */
        rc = ngx_http_parse_request_line(r, r->header_in);

        if (rc == NGX_OK) {

            /* 请求行解析成功，检查参数是否正确，进一步解析uri */
            if (ngx_http_process_request_uri(r) != NGX_OK) {
                return;
            }

            if (r->host_start && r->host_end) {

                host.len = r->host_end - r->host_start;
                host.data = r->host_start;

                rc = ngx_http_validate_host(&host, r->pool, 0);

                if (rc == NGX_DECLINED) {
                    ngx_log_error(NGX_LOG_INFO, c->log, 0,
                                  "client sent invalid host in request line");
                    ngx_http_finalize_request(r, NGX_HTTP_BAD_REQUEST);
                    return;
                }

                if (rc == NGX_ERROR) {
                    ngx_http_close_request(r, NGX_HTTP_INTERNAL_SERVER_ERROR);
                    return;
                }

                if (ngx_http_set_virtual_server(r, &host) == NGX_ERROR) {
                    return;
                }

                r->headers_in.server = host;
            }

            if (r->http_version < NGX_HTTP_VERSION_10) {

                if (r->headers_in.server.len == 0
                    && ngx_http_set_virtual_server(r, &r->headers_in.server)
                       == NGX_ERROR)
                {
                    return;
                }

                ngx_http_process_request(r);
                return;
            }


            if (ngx_list_init(&r->headers_in.headers, r->pool, 20,
                              sizeof(ngx_table_elt_t))
                != NGX_OK)
            {
                ngx_http_close_request(r, NGX_HTTP_INTERNAL_SERVER_ERROR);
                return;
            }

            c->log->action = "reading client request headers";
            
            /* 设置读数据处理函数，并进入请求头处理阶段 */
            rev->handler = ngx_http_process_request_headers;
            ngx_http_process_request_headers(rev);

            return;
        }

        /* 返回错误，说明数据有误，直接返回 */
        if (rc != NGX_AGAIN) {

            /* there was error while a request line parsing */

            ngx_log_error(NGX_LOG_INFO, c->log, 0,
                          ngx_http_client_errors[rc - NGX_HTTP_CLIENT_ERROR]);

            if (rc == NGX_HTTP_PARSE_INVALID_VERSION) {
                ngx_http_finalize_request(r, NGX_HTTP_VERSION_NOT_SUPPORTED);

            } else {
                ngx_http_finalize_request(r, NGX_HTTP_BAD_REQUEST);
            }

            return;
        }

        /* 返回的是 NGX_AGAIN 说明请求行数据还没有完全收到，判断缓冲区是否用完，如果用完了，
           则分配一块更大的内存，然后进行下一轮接收数据并处理 */
        if (r->header_in->pos == r->header_in->end) {
            
            rv = ngx_http_alloc_large_header_buffer(r, 1);

            if (rv == NGX_ERROR) {
                ngx_http_close_request(r, NGX_HTTP_INTERNAL_SERVER_ERROR);
                return;
            }

            if (rv == NGX_DECLINED) {
                r->request_line.len = r->header_in->end - r->request_start;
                r->request_line.data = r->request_start;

                ngx_log_error(NGX_LOG_INFO, c->log, 0,
                              "client sent too long URI");
                ngx_http_finalize_request(r, NGX_HTTP_REQUEST_URI_TOO_LARGE);
                return;
            }
        }
    }
}
```


如果请求行解析成功`ngx_http_parse_request_line`函数则会返回`NGX_OK`，接下来判断请求行是否合法，如果一切正常则设置`rev->handler`指针为`ngx_http_process_request_headers`函数，
将读事件处理函数设置为此函数，如果还有数据没有接受完，则会直接调用`ngx_http_process_request_headers`函数来处理请求头，因为请求行已经处理完毕。
请求头的处理和请求行的处理类似，也是循环解析请求头，如果数据没有接受完则还是调用`ngx_http_read_request_header`函数接收数据，
不同的是每解析到一个请求头都会调用注册到HTTP模块的对应的请求头处理函数，来处理。请求头处理函数在`ngx_http_headers_in[]`数组中注册，并存放到`headers_in_hash`哈希表中。
请求头全部解析完成之后，则会调用`ngx_http_process_request`函数，来处理HTTP请求。

```c
static void
ngx_http_process_request_headers(ngx_event_t *rev)
{
    u_char                     *p;
    size_t                      len;
    ssize_t                     n;
    ngx_int_t                   rc, rv;
    ngx_table_elt_t            *h;
    ngx_connection_t           *c;
    ngx_http_header_t          *hh;
    ngx_http_request_t         *r;
    ngx_http_core_srv_conf_t   *cscf;
    ngx_http_core_main_conf_t  *cmcf;

    c = rev->data;
    r = c->data;

    /* 如果是超时事件则关闭请求，直接返回 */
    if (rev->timedout) {
        ngx_log_error(NGX_LOG_INFO, c->log, NGX_ETIMEDOUT, "client timed out");
        c->timedout = 1;
        ngx_http_close_request(r, NGX_HTTP_REQUEST_TIME_OUT);
        return;
    }

    cmcf = ngx_http_get_module_main_conf(r, ngx_http_core_module);
    /* 设置为 NGX_AGAIN */
    rc = NGX_AGAIN;

    /* 循环处理请求头 */
    for ( ;; ) {

        if (rc == NGX_AGAIN) {

            /* 判断是否需要分配更大的缓冲区 */
            if (r->header_in->pos == r->header_in->end) {

                rv = ngx_http_alloc_large_header_buffer(r, 0);

                if (rv == NGX_ERROR) {
                    ngx_http_close_request(r, NGX_HTTP_INTERNAL_SERVER_ERROR);
                    return;
                }

                if (rv == NGX_DECLINED) {
                    p = r->header_name_start;

                    r->lingering_close = 1;

                    if (p == NULL) {
                        ngx_log_error(NGX_LOG_INFO, c->log, 0,
                                      "client sent too large request");
                        ngx_http_finalize_request(r,
                                            NGX_HTTP_REQUEST_HEADER_TOO_LARGE);
                        return;
                    }

                    len = r->header_in->end - p;

                    if (len > NGX_MAX_ERROR_STR - 300) {
                        len = NGX_MAX_ERROR_STR - 300;
                    }

                    ngx_log_error(NGX_LOG_INFO, c->log, 0,
                                "client sent too long header line: \"%*s...\"",
                                len, r->header_name_start);

                    ngx_http_finalize_request(r,
                                            NGX_HTTP_REQUEST_HEADER_TOO_LARGE);
                    return;
                }
            }

            /* 然后调用 ngx_http_read_request_header 来接收数据 */
            ngx_log_debug0(NGX_LOG_DEBUG_HTTP, rev->log, 0,
                   "*** http process request header line NGX_AGAIN");
            n = ngx_http_read_request_header(r);

            if (n == NGX_AGAIN || n == NGX_ERROR) {
                return;
            }
        }

        /* the host header could change the server configuration context */
        cscf = ngx_http_get_module_srv_conf(r, ngx_http_core_module);
        /* 解析请求头 */
        rc = ngx_http_parse_header_line(r, r->header_in,
                                        cscf->underscores_in_headers);
        /* 如果请求头解析成功，则调用对应的请求头处理函数，并continue继续下一个解析 */
        if (rc == NGX_OK) {

            r->request_length += r->header_in->pos - r->header_name_start;

            if (r->invalid_header && cscf->ignore_invalid_headers) {

                /* there was error while a header line parsing */

                ngx_log_error(NGX_LOG_INFO, c->log, 0,
                              "client sent invalid header line: \"%*s\"",
                              r->header_end - r->header_name_start,
                              r->header_name_start);
                continue;
            }

            /* a header line has been parsed successfully */

            h = ngx_list_push(&r->headers_in.headers);
            if (h == NULL) {
                ngx_http_close_request(r, NGX_HTTP_INTERNAL_SERVER_ERROR);
                return;
            }

            h->hash = r->header_hash;

            h->key.len = r->header_name_end - r->header_name_start;
            h->key.data = r->header_name_start;
            h->key.data[h->key.len] = '\0';

            h->value.len = r->header_end - r->header_start;
            h->value.data = r->header_start;
            h->value.data[h->value.len] = '\0';

            h->lowcase_key = ngx_pnalloc(r->pool, h->key.len);
            if (h->lowcase_key == NULL) {
                ngx_http_close_request(r, NGX_HTTP_INTERNAL_SERVER_ERROR);
                return;
            }

            if (h->key.len == r->lowcase_index) {
                ngx_memcpy(h->lowcase_key, r->lowcase_header, h->key.len);

            } else {
                ngx_strlow(h->lowcase_key, h->key.data, h->key.len);
            }
            /* 在 headers_in_hash 哈希表中查找对应的请求头处理函数 */
            hh = ngx_hash_find(&cmcf->headers_in_hash, h->hash,
                               h->lowcase_key, h->key.len);
            /* 执行处理函数 */
            if (hh && hh->handler(r, h, hh->offset) != NGX_OK) {
                return;
            }

            ngx_log_debug2(NGX_LOG_DEBUG_HTTP, r->connection->log, 0,
                           "http header: \"%V: %V\"",
                           &h->key, &h->value);

            continue;
        }
        
        /* 请求头全部解析完成，则调用 ngx_http_process_request 处理HTTP请求 */
        if (rc == NGX_HTTP_PARSE_HEADER_DONE) {

            /* a whole header has been parsed successfully */

            ngx_log_debug0(NGX_LOG_DEBUG_HTTP, r->connection->log, 0,
                           "http header done");

            r->request_length += r->header_in->pos - r->header_name_start;

            r->http_state = NGX_HTTP_PROCESS_REQUEST_STATE;

            rc = ngx_http_process_request_header(r);

            if (rc != NGX_OK) {
                return;
            }

            ngx_http_process_request(r);

            return;
        }

        /* 如果返回NGX_AGAIN，说明还有数据没有接受完，继续下一轮接收数据并处理 */
        if (rc == NGX_AGAIN) {

            /* a header line parsing is still not complete */

            continue;
        }
        /* 请求头解析出错 */
        /* rc == NGX_HTTP_PARSE_INVALID_HEADER */

        ngx_log_error(NGX_LOG_INFO, c->log, 0,
                      "client sent invalid header line");

        ngx_http_finalize_request(r, NGX_HTTP_BAD_REQUEST);
        return;
    }
}
```

### 处理HTTP请求

nginx将HTTP的请求处理分为多个阶段，目前分了11个阶段，分别如下。我们可以在每个阶段中注册自己的模块，当执行到此阶段时就会调用到我们注册的模块处理函数。
整个执行过程会将所有阶段的处理函数，以及我们自己注册的函数组织为一个链表，处理请求时遍历一次这个链表就完成了所有阶段的处理。
```c
typedef enum {
    NGX_HTTP_POST_READ_PHASE = 0,

    NGX_HTTP_SERVER_REWRITE_PHASE,

    NGX_HTTP_FIND_CONFIG_PHASE,
    NGX_HTTP_REWRITE_PHASE,
    NGX_HTTP_POST_REWRITE_PHASE,

    NGX_HTTP_PREACCESS_PHASE,

    NGX_HTTP_ACCESS_PHASE,
    NGX_HTTP_POST_ACCESS_PHASE,

    NGX_HTTP_PRECONTENT_PHASE,

    NGX_HTTP_CONTENT_PHASE,

    NGX_HTTP_LOG_PHASE
} ngx_http_phases;
```
首先来看一下整个执行链的初始化过程，首先计算注册的处理函数的数量，然后为每个处理函数分配一个`ngx_http_phase_handler_t`结构体大小的内存，
最后按照上面11个阶段的顺序，将所有处理函数的指针存放到分配的内存中，组成一个执行链。初始化函数是`ngx_http_init_phase_handlers`。
```c
static ngx_int_t
ngx_http_init_phase_handlers(ngx_conf_t *cf, ngx_http_core_main_conf_t *cmcf)
{
    ngx_int_t                   j;
    ngx_uint_t                  i, n;
    ngx_uint_t                  find_config_index, use_rewrite, use_access;
    ngx_http_handler_pt        *h;
    ngx_http_phase_handler_t   *ph;
    ngx_http_phase_handler_pt   checker;

    cmcf->phase_engine.server_rewrite_index = (ngx_uint_t) -1;
    cmcf->phase_engine.location_rewrite_index = (ngx_uint_t) -1;
    find_config_index = 0;
    use_rewrite = cmcf->phases[NGX_HTTP_REWRITE_PHASE].handlers.nelts ? 1 : 0;
    use_access = cmcf->phases[NGX_HTTP_ACCESS_PHASE].handlers.nelts ? 1 : 0;

    n = 1                  /* find config phase */
        + use_rewrite      /* post rewrite phase */
        + use_access;      /* post access phase */

    /* 计算注册处理函数的数量 */
    for (i = 0; i < NGX_HTTP_LOG_PHASE; i++) {
        n += cmcf->phases[i].handlers.nelts;
    }

    /* 分配内存 */
    ph = ngx_pcalloc(cf->pool,
                     n * sizeof(ngx_http_phase_handler_t) + sizeof(void *));
    if (ph == NULL) {
        return NGX_ERROR;
    }

    cmcf->phase_engine.handlers = ph;
    n = 0;

    /* 为每个处理阶段指定处理函数，我们自己注册的函数会在指定阶段的处理函数中调用执行 */
    for (i = 0; i < NGX_HTTP_LOG_PHASE; i++) {
        h = cmcf->phases[i].handlers.elts;

        switch (i) {

        case NGX_HTTP_SERVER_REWRITE_PHASE:
            if (cmcf->phase_engine.server_rewrite_index == (ngx_uint_t) -1) {
                cmcf->phase_engine.server_rewrite_index = n;
            }
            checker = ngx_http_core_rewrite_phase;

            break;

        case NGX_HTTP_FIND_CONFIG_PHASE:
            find_config_index = n;

            ph->checker = ngx_http_core_find_config_phase;
            n++;
            ph++;

            /* 直接 continue 的表示这个阶段下不允许注册外部处理函数 */
            continue;

        case NGX_HTTP_REWRITE_PHASE:
            if (cmcf->phase_engine.location_rewrite_index == (ngx_uint_t) -1) {
                cmcf->phase_engine.location_rewrite_index = n;
            }
            checker = ngx_http_core_rewrite_phase;

            break;

        case NGX_HTTP_POST_REWRITE_PHASE:
            if (use_rewrite) {
                ph->checker = ngx_http_core_post_rewrite_phase;
                ph->next = find_config_index;
                n++;
                ph++;
            }

            continue;

        case NGX_HTTP_ACCESS_PHASE:
            checker = ngx_http_core_access_phase;
            n++;
            break;

        case NGX_HTTP_POST_ACCESS_PHASE:
            if (use_access) {
                ph->checker = ngx_http_core_post_access_phase;
                ph->next = n;
                ph++;
            }

            continue;

        case NGX_HTTP_CONTENT_PHASE:
            checker = ngx_http_core_content_phase;
            break;

        /* 默认其他阶段的处理函数都设置为这个 */
        default:
            checker = ngx_http_core_generic_phase;
        }

        n += cmcf->phases[i].handlers.nelts;

        /* 初始化外部注册的函数，设置执行链上的处理函数为对应阶段的处理函数，然后在阶段处理函数中调用外部注册的处理函数 */
        for (j = cmcf->phases[i].handlers.nelts - 1; j >= 0; j--) {
            ph->checker = checker;
            ph->handler = h[j];
            ph->next = n;
            ph++;
        }
    }

    return NGX_OK;
}
```

HTTP的处理过程就非常简单了，直接遍历一次执行链就完成了。
```c
void
ngx_http_core_run_phases(ngx_http_request_t *r)
{
    ngx_int_t                   rc;
    ngx_http_phase_handler_t   *ph;
    ngx_http_core_main_conf_t  *cmcf;

    cmcf = ngx_http_get_module_main_conf(r, ngx_http_core_module);

    ph = cmcf->phase_engine.handlers;
    /* 遍历执行链 */
    while (ph[r->phase_handler].checker) {

        rc = ph[r->phase_handler].checker(r, &ph[r->phase_handler]);

        if (rc == NGX_OK) {
            return;
        }
    }
}
```

### 参考

[nginx的请求处理阶段](http://tengine.taobao.org/book/chapter_12.html)

基于nginx-1.14.0源码分析

我分析源码时不喜欢去找所有结构体字段的含义，这样感觉非常枯燥，而且也很难记住所有字段的含义。   
一般是通过调试日志和看代码来梳理程序的整个执行流程。在分析程序执行流程中来理解结构体中重要字段的含义，其他的细枝末节就直接忽略掉了。
