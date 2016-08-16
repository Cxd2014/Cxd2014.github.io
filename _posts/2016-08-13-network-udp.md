---

layout: post
title:  "Linux协议栈--UDP协议数据的发送和接受"
date:   2016-08-13 10:20:10
categories: network
tags: TCP/IP udp network

---

* content
{:toc}

### UDP协议简介

UDP（用户数据包协议）是一个简单的面向数据包的运输层协议：进程的每个输出操作都正好产生一个UDP数据报，并组装成一份待发送的IP数据报。
UDP不提供可靠性：它把应用程序传给IP层的数据发送出去，但是并不保证他们能到达目的地，他没有检查数据是否能够到达网络另一端的机制。

### UDP与套接字层、IP层的接口 

* UDP与套接字之间的接口由`struct proto`数据结构描述，该数据结构在`net/ipv4/udp.c`文件中初始化：

```c
struct proto udp_prot = {
	.name		   = "UDP",
	.owner		   = THIS_MODULE,
	.close		   = udp_lib_close,
	.connect	   = ip4_datagram_connect,
	.disconnect	   = udp_disconnect,
	.ioctl		   = udp_ioctl,
	.destroy	   = udp_destroy_sock,
	.setsockopt	   = udp_setsockopt,
	.getsockopt	   = udp_getsockopt,
	.sendmsg	   = udp_sendmsg,
	.recvmsg	   = udp_recvmsg,
	.sendpage	   = udp_sendpage,
	.backlog_rcv	   = __udp_queue_rcv_skb,
	.hash		   = udp_lib_hash,
	.unhash		   = udp_lib_unhash,
	.rehash		   = udp_v4_rehash,
	.get_port	   = udp_v4_get_port,
	.memory_allocated  = &udp_memory_allocated,
	.sysctl_mem	   = sysctl_udp_mem,
	.sysctl_wmem	   = &sysctl_udp_wmem_min,
	.sysctl_rmem	   = &sysctl_udp_rmem_min,
	.obj_size	   = sizeof(struct udp_sock),
	.slab_flags	   = SLAB_DESTROY_BY_RCU,
	.h.udp_table	   = &udp_table,
#ifdef CONFIG_COMPAT
	.compat_setsockopt = compat_udp_setsockopt,
	.compat_getsockopt = compat_udp_getsockopt,
#endif
}

```

* UDP协议与IP层之间的接口由`struct net_protocol`数据结构描述，该数据结构在`net/ipv4/af_inet.c`文件中初始化：

```c
static const struct net_protocol udp_protocol = {
	.handler =	udp_rcv,
	.err_handler =	udp_err,
	.gso_send_check = udp4_ufo_send_check,
	.gso_segment = udp4_ufo_fragment,
	.no_policy =	1,
	.netns_ok =	1,
};
```

`udp_rcv`函数是UDP协议接收输入数据包的处理函数，`udp_err`函数处理ICMP错误信息，
UDP协议与IP层之间没有定义发送接口，而是在`udp_sendmsg`函数中调用IP层发送数据包的回调函数`ip_append_data`，
或在`udp_sendpage`函数中调用IP层的回调函数`ip_append_page`，将UDP数据报放入IP层。

### UDP数据报的发送过程

在上一篇文章中提到应用层调用`send`函数时最终会调用到`inet_sendmsg`函数，这个函数会调用协议特定的发送函数，
在UDP协议中就是上面在`struct proto`数据结构中初始化的`udp_sendmsg`函数（定义在`net/ipv4/udp.c`文件中）。

```c
int udp_sendmsg(struct kiocb *iocb, struct sock *sk, struct msghdr *msg,
		size_t len)
{
    ···
    
	/* 检查数据报的长度 */
	if (len > 0xFFFF)
		return -EMSGSIZE;

	/*
	 * 查看当前套接字中是否有挂起的数据帧等待发送,如果有则处理函数需要持有该套接字，
	 * 获取套接字的锁，并阻塞该套接字以便处理悬挂的数据包，
	 * 然后跳转到将数据包传给IP层的标签处：do_append_data
	 */
	if (up->pending) {
		lock_sock(sk);
		if (likely(up->pending)) {
			if (unlikely(up->pending != AF_INET)) {
				release_sock(sk);
				return -EINVAL;
			}
			goto do_append_data;
		}
		release_sock(sk);
	}

	ulen += sizeof(struct udphdr);

	/*
	 * 对目标IP地址的正确性进行检查，包括检查地址长度、地址所属的协议族
	 * 如果通过检查则使用目标IP地址初始化存放数据包目标IP地址的局部变量 daddr 和端口号 dport
	 */
	if (msg->msg_name) {
		struct sockaddr_in * usin = (struct sockaddr_in *)msg->msg_name;
		if (msg->msg_namelen < sizeof(*usin))
			return -EINVAL;
		if (usin->sin_family != AF_INET) {
			if (usin->sin_family != AF_UNSPEC)
				return -EAFNOSUPPORT;
		}

		daddr = usin->sin_addr.s_addr;
		dport = usin->sin_port;
		if (dport == 0)
			return -EINVAL;
	} else {

		/*
		 * 如果套接字名 msg_name 为空，套接字也没有建立连接，则数据包传送的目标IP地址无效
		 * 如果套接字已连接，则用连接信息初始化目标IP地址和端口号
		 */
		if (sk->sk_state != TCP_ESTABLISHED)
			return -EDESTADDRREQ;
		daddr = inet->inet_daddr;
		dport = inet->inet_dport;
		/* Open fast path for connected socket.
		   Route will not be used, if at least one option is set.
		 */
		connected = 1;
	}
	ipc.addr = inet->inet_saddr;

	ipc.oif = sk->sk_bound_dev_if;
	err = sock_tx_timestamp(msg, sk, &ipc.shtx);
	if (err)
		return err;

	/*
	 * 处理用户空间对该套接字配置的控制信息，如：IP选项和输出网络接口索引号。
	 */	
	if (msg->msg_controllen) {
		/* 如果设置了套接字控制信息，则由函数 ip_cmsg_send 来处理  */
		err = ip_cmsg_send(sock_net(sk), msg, &ipc);
		if (err)
			return err;
		if (ipc.opt)
			free = 1;
		connected = 0;
	}

	/* 如果没有设置控制信息，则从 inet 的选项数据域中提取来设置控制信息 */
	if (!ipc.opt)
		ipc.opt = inet->opt;

	saddr = ipc.addr;
	ipc.addr = faddr = daddr;

	/* 如果IP选项设置了源路由，则下一站点的目标地址从源路由的IP地址列表中获取 */
	if (ipc.opt && ipc.opt->srr) {
		if (!daddr)
			return -EINVAL;
		faddr = ipc.opt->faddr;
		connected = 0;
	}

	/* 
	 * 如果数据包在本地局域网中传送：SOCK_LOCALROUTE、
	 * msg_flags标志为不需要路由、IP选项设置了严格源路由
	 * 则设置ToS为 RTO_ONLINK 不需要寻址数据包路由
	 */
	tos = RT_TOS(inet->tos);
	if (sock_flag(sk, SOCK_LOCALROUTE) ||
	    (msg->msg_flags & MSG_DONTROUTE) ||
	    (ipc.opt && ipc.opt->is_strictroute)) {
		tos |= RTO_ONLINK;
		connected = 0;
	}

	/* 如果目标IP地址是组传送地址，则不需要寻址数据包路由 */
	if (ipv4_is_multicast(daddr)) {
		if (!ipc.oif)
			ipc.oif = inet->mc_index;
		if (!saddr)
			saddr = inet->mc_addr;
		connected = 0;
	}

	/* 
	 * 如果前面的条件全部不通过，则说明套接字已连接，路由已知，
	 * 将路由高速缓冲区入口设置给局部变量 rt 
	 */
	if (connected)
		rt = (struct rtable *)sk_dst_check(sk, 0);

	/*
	 * 如果目前无有效路由，则要在路由表中搜索目标路由。首先创建流信息结构 struct flowi 数据结构变量，
	 * 初始化 struct flowi 的数据域，为搜索路由做准备。然后调用 ip_route_output_flow 函数搜索路由表
	 * 建立目标路由。
	 */
	if (rt == NULL) {
		struct flowi fl = { .oif = ipc.oif,
				    .mark = sk->sk_mark,
				    .nl_u = { .ip4_u =
					      { .daddr = faddr,
						.saddr = saddr,
						.tos = tos } },
				    .proto = sk->sk_protocol,
				    .flags = inet_sk_flowi_flags(sk),
				    .uli_u = { .ports =
					       { .sport = inet->inet_sport,
						 .dport = dport } } };
		struct net *net = sock_net(sk);

		security_sk_classify_flow(sk, &fl);
		err = ip_route_output_flow(net, &rt, &fl, sk, 1);
		if (err) {
			if (err == -ENETUNREACH)
				IP_INC_STATS_BH(net, IPSTATS_MIB_OUTNOROUTES);
			goto out;
		}

		err = -EACCES;
		if ((rt->rt_flags & RTCF_BROADCAST) &&
		    !sock_flag(sk, SOCK_BROADCAST))
			goto out;
		if (connected)
			sk_dst_set(sk, dst_clone(&rt->dst));
	}

	if (msg->msg_flags&MSG_CONFIRM)
		goto do_confirm;
back_from_confirm:

	saddr = rt->rt_src;
	if (!ipc.addr)
		daddr = ipc.addr = rt->rt_dst;

	/*
	 * 到此处需要预处理的信息已完成，UDP协议开始向Ip层发送数据，
	 * 在发送数据前先锁定套接字，以便追加额外的数据
	 */
	lock_sock(sk);
	if (unlikely(up->pending)) {
		/* The socket is already corked while preparing it. */
		/* ... which is an evident application bug. --ANK */
		release_sock(sk);

		LIMIT_NETDEBUG(KERN_DEBUG "udp cork app bug 2\n");
		err = -EINVAL;
		goto out;
	}
	/*
	 *	Now cork the socket to pend data.
	 */
	inet->cork.fl.fl4_dst = daddr;
	inet->cork.fl.fl_ip_dport = dport;
	inet->cork.fl.fl4_src = saddr;
	inet->cork.fl.fl_ip_sport = inet->inet_sport;
	up->pending = AF_INET;

	/* 调用 ip_append_data 函数发送数据包到IP层*/
do_append_data:
	up->len += ulen;
	getfrag  =  is_udplite ?  udplite_getfrag : ip_generic_getfrag;
	err = ip_append_data(sk, getfrag, msg->msg_iov, ulen,
			sizeof(struct udphdr), &ipc, &rt,
			corkreq ? msg->msg_flags|MSG_MORE : msg->msg_flags);
	if (err)
		udp_flush_pending_frames(sk);
	else if (!corkreq)
		err = udp_push_pending_frames(sk);
	else if (unlikely(skb_queue_empty(&sk->sk_write_queue)))
		up->pending = 0;
	/* 释放套接字锁 */
	release_sock(sk);

out:
	ip_rt_put(rt);
	if (free)
		kfree(ipc.opt);
	if (!err)
		return len;
	/*
	 * ENOBUFS = no kernel mem, SOCK_NOSPACE = no sndbuf space.  Reporting
	 * ENOBUFS might not be good (it's not tunable per se), but otherwise
	 * we don't have a good statistic (IpOutDiscards but it can be too many
	 * things).  We could add another new stat but at least for now that
	 * seems like overkill.
	 */
	if (err == -ENOBUFS || test_bit(SOCK_NOSPACE, &sk->sk_socket->flags)) {
		UDP_INC_STATS_USER(sock_net(sk),
				UDP_MIB_SNDBUFERRORS, is_udplite);
	}
	return err;

do_confirm:
	dst_confirm(&rt->dst);
	if (!(msg->msg_flags&MSG_PROBE) || len)
		goto back_from_confirm;
	err = 0;
	goto out;
}

```

### UDP数据报的接收过程

当用户调用`recvmsg`函数时，最终会调用到协议特定的接收函数，UDP协议的接收函数是`udp_recvmsg`;
（定义在`net/ipv4/udp.c`文件中）

```c

int udp_recvmsg(struct kiocb *iocb, struct sock *sk, struct msghdr *msg,
		size_t len, int noblock, int flags, int *addr_len)
{
	struct inet_sock *inet = inet_sk(sk);
	struct sockaddr_in *sin = (struct sockaddr_in *)msg->msg_name;
	struct sk_buff *skb;
	unsigned int ulen;
	int peeked;
	int err;
	int is_udplite = IS_UDPLITE(sk);
	bool slow;

	/*
	 * 检查数据包发送端源地址长度
	 */
	if (addr_len)
		*addr_len = sizeof(*sin);

	/* 如果套接字的错误消息队列有信息需要处理则调用 ip_recv_error 函数处理 */
	if (flags & MSG_ERRQUEUE)
		return ip_recv_error(sk, msg, len);

try_again:
	/*
	 * 调用 __skb_recv_datagram 函数从套接字的接收缓冲区队列中读取下一个数据包 
	 * 如果队列中没有等待读入的数据包则根据用户设置的条件阻塞以等待数据、直接返回或者等待一定时间在返回
	 */
	skb = __skb_recv_datagram(sk, flags | (noblock ? MSG_DONTWAIT : 0),
				  &peeked, &err);
	if (!skb)
		goto out;

	ulen = skb->len - sizeof(struct udphdr);
	if (len > ulen)
		len = ulen;
	else if (len < ulen)
		msg->msg_flags |= MSG_TRUNC;

	/* 对数据包做校验和检验 */
	if (len < ulen || UDP_SKB_CB(skb)->partial_cov) {
		/* 如果只做部分校验和，先完成检验和处理在复制数据到用户空间 */
		if (udp_lib_checksum_complete(skb))
			goto csum_copy_err;
	}

	/* 如果不做校验和，则直接复制数据到用户空间 */
	if (skb_csum_unnecessary(skb))
		err = skb_copy_datagram_iovec(skb, sizeof(struct udphdr),
					      msg->msg_iov, len);
	else {
		/* 如果对数据包进行全校验和检验，则在复制数据的同时完成校验和计算 */
		err = skb_copy_and_csum_datagram_iovec(skb,
						       sizeof(struct udphdr),
						       msg->msg_iov);

		if (err == -EINVAL)
			goto csum_copy_err;
	}

	if (err)
		goto out_free;

	if (!peeked)
		UDP_INC_STATS_USER(sock_net(sk),
				UDP_MIB_INDATAGRAMS, is_udplite);

	sock_recv_ts_and_drops(msg, sk, skb);

	/* 如果用户提供了缓冲区 sin 来存放数据发送端的源IP地址和端口号，则将这些信息复制到 sin 中 */
	if (sin) {
		sin->sin_family = AF_INET;
		sin->sin_port = udp_hdr(skb)->source;
		sin->sin_addr.s_addr = ip_hdr(skb)->saddr;
		memset(sin->sin_zero, 0, sizeof(sin->sin_zero));
	}
	if (inet->cmsg_flags)
		ip_cmsg_recv(msg, skb);

	err = len;
	if (flags & MSG_TRUNC)
		err = ulen;

out_free:
	skb_free_datagram_locked(sk, skb);
out:
	return err;

csum_copy_err:
	slow = lock_sock_fast(sk);
	if (!skb_kill_datagram(sk, skb, flags))
		UDP_INC_STATS_USER(sock_net(sk), UDP_MIB_INERRORS, is_udplite);
	unlock_sock_fast(sk, slow);

	if (noblock)
		return -EAGAIN;
	goto try_again;
}

```


### 参考

《嵌入式Linux网络体系结构设计与TCP/IP协议栈》