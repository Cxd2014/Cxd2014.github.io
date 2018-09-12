---
layout: post
title:  "端口复用"
date:   2018-09-12 10:20:10
categories: network
tags: SO_REUSEPORT
---

* content
{:toc}

### `SO_REUSEPORT`套接字选项

从Linux 3.9内核版本之后Linux网络协议栈开始支持`SO_REUSEPORT`套接字选项，这个新的选项允许一个主机上的多个套接字绑定到同一个端口上，它的目的是提高运行在多核CPU上的多线程网络服务应用的处理性能。

他的使用也非常简单，如果多个进程或者线程都设置了下面这个选项，则他们可以同时绑定到同一个端口上：
```c
int sfd = socket(domain, socktype, 0);

int optval = 1;
setsockopt(sfd, SOL_SOCKET, SO_REUSEPORT, &optval, sizeof(optval));

bind(sfd, (struct sockaddr *) &addr, addrlen);
```
只要第一个进程在绑定端口时设置了这个选项，则其他进程也可以通过设置这个选项来绑定到同一个端口上。
要求第一个进程必须设置`SO_REUSEPORT`这个选项的原因是防止端口劫持--一些流氓进程通过绑定正在被使用的端口上，来获取其进程接收到的连接请求和数据。为了防止其他不必要的进程通过`SO_REUSEPORT`选项劫持端口，所有之后绑定这个端口的进程都需要设置和第一个进程相同的`user ID`。

TCP和UDP都可以使用`SO_REUSEPORT`选项。对于TCP它允许多个套接字监听同一个端口号，这样每个线程都可以调用`accept()`来处理连接，
避免了传统多线程服务中通常使用一个单一进程处理连接请求，而这个单一进程很可能会成为整个系统的瓶颈。
传统多线程服务中的另一种处理方法是多个线程或者进程对同一个套接字循环调用`accept()`函数处理连接请求，形式如下：
```c
while (1) {
    new_fd = accept(...);
    process_connection(new_fd);
}
```
这种处理方式也会有一个问题：多个线程之间不能均衡的处理请求，有些线程处理了大量请求，有些线程处理了少量请求，这种不均衡会降低多核CPU的利用率。
而`SO_REUSEPORT`会更加均衡的分发请求到不同线程或者进程上。

`SO_REUSEPORT`选项分发数据包的方法是计算对端IP、端口加上本地IP、端口这四个值的哈希值，通过这个哈希值将数据包分发到不同进程上。
这样就可以保证同一个连接的数据包都被分发到同一个进程中去处理。

### `SO_REUSEPORT`套接字选项在内核中的实现

这里只看UDP协议的实现，
当设置了`SO_REUSEPORT`套接字选项之后，绑定在同一个端口号的套接字在内核中会形成一个数组，保存在`sock_reuseport`结构体中，
在调用`bind()`函数时，会调用到`/net/core/sock_reuseport.c`文件中的`reuseport_add_sock`函数，此函数用来将当前套接字添加到数组中。
```c
/* /include/net/sock_reuseport.h */
struct sock_reuseport {
	struct rcu_head		rcu;

	u16			max_socks;	/* length of socks */
	u16			num_socks;	/* elements in socks */
	struct bpf_prog __rcu	*prog;		/* optional BPF sock selector */
	struct sock		*socks[0];	/* 绑定在同一个端口号的套接字指针数组 */
};
```

在这篇文章中[Linux协议栈--UDP协议的发送和接收](http://cxd2014.github.io/2016/08/13/network-udp/)我们说过当UDP数据到达IP层之后，会调用`__udp4_lib_rcv`函数将数据包存放到UDP的数据接收缓冲区中。在存放之前会调用`__udp4_lib_lookup_skb`函数找到这个数据包对应的`sock`。最终会调用`__udp4_lib_lookup`函数进行实际的查找工作：
```c
struct sock *__udp4_lib_lookup(struct net *net, __be32 saddr,
		__be16 sport, __be32 daddr, __be16 dport, int dif,
		int sdif, struct udp_table *udptable, struct sk_buff *skb)
{
    ...
begin:
	result = NULL;
	badness = 0;
    /* 遍历链表 */
	sk_for_each_rcu(sk, &hslot->head) {
        /* 根据五元组等信息来进行匹配 */
		score = compute_score(sk, net, saddr, sport,
				      daddr, hnum, dif, sdif, exact_dif);
		if (score > badness) {
            /* 匹配到之后，判断是否设置了 SO_REUSEPORT 选项 */
			if (sk->sk_reuseport) {
                /* 根据源端口、IP和接收端口、IP这四个值计算一个哈希值 */
				hash = udp_ehashfn(net, daddr, hnum,
						   saddr, sport);
                /* 根据这个哈希值，将数据包分发到对应的sock上 */
				result = reuseport_select_sock(sk, hash, skb,
							sizeof(struct udphdr));
				if (result)
					return result;
			}
			result = sk;
			badness = score;
		}
	}
	return result;
}
```
找到对应的`sock`之后，调用`udp_queue_rcv_skb`函数将数据包存放到此套接字的缓冲区中，之后调用`sk->sk_data_ready(sk)`函数指针，此函数指针在创建套接字的时候初始化为`sock_def_readable`函数。这个函数会将对应的进程唤醒，来接收数据包。
```c
static void sock_def_readable(struct sock *sk)
{
	struct socket_wq *wq;

	rcu_read_lock();
	wq = rcu_dereference(sk->sk_wq);
	if (skwq_has_sleeper(wq))
		wake_up_interruptible_sync_poll(&wq->wait, EPOLLIN | EPOLLPRI |
						EPOLLRDNORM | EPOLLRDBAND);
	sk_wake_async(sk, SOCK_WAKE_WAITD, POLL_IN);
	rcu_read_unlock();
}
```
