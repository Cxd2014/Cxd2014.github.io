---
layout: post
title:  "Linux协议栈--IPv4协议的注册"
date:   2017-09-02 10:10:10
categories: network
tags: Linux kernel network
---

* content
{:toc}

### 前言

众所周知Linux内核支持很多类型的网络协议，这些协议是怎么注册进内核的？如果要增加一个新的协议该怎么操作？这些问题在去年分析Linux协议栈的时候就一直困扰着我，但是网上这方面的资料非常少，当时的水平有限直接看内核源码也毫无头绪，无奈一直留着这个疑问没有解决。最近几天闲来无事又抱着Linux源码啃起来了，突然发现我已经能够看懂它了。哈哈！！

### socket套接字的创建

我们在编写网络程序的时候第一步是调用`socket`函数创建一个套接字。他会传递三个参数给内核：参数`family`指定使用哪种协议族，例如ipv4或者ipv6；`type`指定协议族中的具体协议，例如TCP或者UDP；`protocol`一般为0：
```c
SYSCALL_DEFINE3(socket, int, family, int, type, int, protocol)
```
在[Linux协议栈--套接字的实现](http://cxd2014.github.io/2016/07/30/socket-implement/)中我们提到，`socket`系统调用最终会调用到内核的`__sock_create`函数，此函数首先根据`family`这个参数在`net_families[family]`数组中查找对应的协议族，然后调用对应协议族的`pf->create`函数来创建一个新的套接字，所以我们可以知道不同的协议族都存放在`net_families`这个全局数组中。
```c
int __sock_create(struct net *net, int family, int type, int protocol,
			 struct socket **res, int kern)
{
	···
	rcu_read_lock();
    /* 根据 family 这个参数在 net_families 数组中查找对应的协议族 */
	pf = rcu_dereference(net_families[family]);
	err = -EAFNOSUPPORT;
	if (!pf)
		goto out_release;

	/*
	 * We will call the ->create function, that possibly is in a loadable
	 * module, so we have to bump that loadable module refcnt first.
	 */
	if (!try_module_get(pf->owner))
		goto out_release;

	/* Now protected by module ref count */
	rcu_read_unlock();
    
    /* 调用对应协议族的`create`函数来创建一个新的套接字 */
	err = pf->create(net, sock, protocol, kern);
	if (err < 0)
		goto out_module_put;
    ···
}
```
对于ipv4协议族来说，他的协议初始化任务都在`net\ipv4\af_inet.c`文件中的`inet_init`函数中实现。在这个函数中可以看到它会调用`sock_register`函数来注册`struct net_proto_family inet_family_ops`结构体，这个结构体的初始化如下：   
![inet_family_ops]({{"/css/pics/inet_register/inet_family_ops.jpg"}})    
然后进入`sock_register`函数中可以看到此函数正好是将`struct net_proto_family inet_family_ops`结构体加入到`net_families`这个全局数组中去，所以很明显ipv4协议族套接字的创建最终是在`inet_create`函数中完成的。
```c
int sock_register(const struct net_proto_family *ops)
{
	int err;

	if (ops->family >= NPROTO) {
		pr_crit("protocol %d >= NPROTO(%d)\n", ops->family, NPROTO);
		return -ENOBUFS;
	}

	spin_lock(&net_family_lock);
	if (rcu_dereference_protected(net_families[ops->family],
				      lockdep_is_held(&net_family_lock)))
		err = -EEXIST;
	else {
        /* 将 net_proto_family 结构体加入到 net_families 全局数组中 */
		rcu_assign_pointer(net_families[ops->family], ops);
		err = 0;
	}
	spin_unlock(&net_family_lock);

	pr_info("NET: Registered protocol family %d\n", ops->family);
	return err;
}
```

### 应用层套接字接口注册

应用层套接字接口包括用户可以调用的所有网络接口，例如sendto、recvform等等，这里以`sendto`发送数据包为例。数据包的发送最终都会调用到`net/socket.c`文件中的`sock_sendmsg_nosec`函数，它直接调用了对应协议族中的`sock->ops->sendmsg`函数，如下图所示：   
![sendmsg]({{"/css/pics/inet_register/sendmsg.jpg"}})    
这个`sock->ops->sendmsg`是怎么关联到具体的协议族了？我们还是要回到上面的`inet_create`函数中去，前面提到ipv4协议族的socket创建最终在`inet_create`函数中实现，此函数的主要作用就是初始化`struct socket *sock`这个结构体。首先根据`sock->type`在`inetsw[sock->type]`数组中查找对应的协议，例如TCP、UDP协议等，然后将对应协议的操作函数赋值给`struct socket *sock`这个结构体。所以我们可以知道IPv4协议族下的不同协议都存放在`inetsw`这个数组中。
```c
static int inet_create(struct net *net, struct socket *sock, int protocol,
		       int kern)
{
	···
	/* Look for the requested type/protocol pair. */
lookup_protocol:
	err = -ESOCKTNOSUPPORT;
	rcu_read_lock();
	/* 根据 sock->type 在 inetsw 全局数组中查找对应的协议，例如TCP、UDP协议等 */
	list_for_each_entry_rcu(answer, &inetsw[sock->type], list) {

		err = 0;
		/* Check the non-wild match. */
		if (protocol == answer->protocol) {
			if (protocol != IPPROTO_IP)
				break;
		} else {
			/* Check for the two wild cases. */
			if (IPPROTO_IP == protocol) {
				protocol = answer->protocol;
				break;
			}
			if (IPPROTO_IP == answer->protocol)
				break;
		}
		err = -EPROTONOSUPPORT;
	}

	err = -EPERM;
	if (sock->type == SOCK_RAW && !kern &&
	    !ns_capable(net->user_ns, CAP_NET_RAW))
		goto out_rcu_unlock;

	/* 找到具体的协议后将对应协议的操作函数赋值给 struct socket *sock 这个结构体 */
	sock->ops = answer->ops;
	answer_prot = answer->prot;
	answer_flags = answer->flags;
	rcu_read_unlock();

	WARN_ON(!answer_prot->slab);

	err = -ENOBUFS;
	/* 调用 sk_alloc 函数分配 struct sock *sk 结构体并将 answer_prot 赋值给 sk->sk_prot */
	sk = sk_alloc(net, PF_INET, GFP_KERNEL, answer_prot, kern);
	if (!sk)
		goto out;
	
	···
}
```
这个`inetsw`数组又是在哪里初始化的了？我们又要回到`inet_init`函数中，在`inet_init`函数中可以看到下图这段代码，首先初始化`inetsw`数组，然后调用`inet_register_protosw`函数将`inetsw_array`这个数组中的值都赋值到`inetsw`数组中去：   
![inetsw]({{"/css/pics/inet_register/inetsw.jpg"}})    
`inetsw_array`数组中的内容如下，到这里我们可以看到上面提到的`sock->ops->sendmsg`，如果是TCP协议的话则会最终调用`inet_stream_ops`函数操作集中的`inet_sendmsg`函数（实际上这几种协议的发送函数都是指向`inet_sendmsg`函数）。
```c
static struct inet_protosw inetsw_array[] =
{
	{
		.type =       SOCK_STREAM,
		.protocol =   IPPROTO_TCP,
		.prot =       &tcp_prot,
		.ops =        &inet_stream_ops,
		.flags =      INET_PROTOSW_PERMANENT |
			      INET_PROTOSW_ICSK,
	},
	{
		.type =       SOCK_DGRAM,
		.protocol =   IPPROTO_UDP,
		.prot =       &udp_prot,
		.ops =        &inet_dgram_ops,
		.flags =      INET_PROTOSW_PERMANENT,
    },
    {
		.type =       SOCK_DGRAM,
		.protocol =   IPPROTO_ICMP,
		.prot =       &ping_prot,
		.ops =        &inet_sockraw_ops,
		.flags =      INET_PROTOSW_REUSE,
    },
    {
		.type =       SOCK_RAW,
		.protocol =   IPPROTO_IP,	/* wild card */
		.prot =       &raw_prot,
		.ops =        &inet_sockraw_ops,
		.flags =      INET_PROTOSW_REUSE,
    }
}
```
`inet_sendmsg`函数又干了哪些事了？这个函数也非常简单它又通过`sk->sk_prot->sendmsg(sk, msg, size)`调用了对应协议的实际发送函数：   
![inet_sendmsg]({{"/css/pics/inet_register/inet_sendmsg.jpg"}})    
这个`sk->sk_prot->sendmsg(sk, msg, size)`又是怎样关联到具体协议的发送函数了？再次回到`inet_create`函数中（看上面的`inet_create`函数代码），它会调用`sk_alloc`函数分配一个`struct sock *sk`结构体然后在`sk_alloc`函数内部将`answer_prot`赋值给`sk->sk_prot`。这个`answer_prot`就是`inetsw_array`数组中的`.prot = &tcp_prot`这种具体协议的函数操作集。对于TCP协议来说实际的数据包发送函数就是`tcp_port`结构体中的`tcp_sendmsg`函数。

总结一下：整体的注册流程是先将不同协议族注册到`net_families`这个全局数组中，在创建socket时进入根据协议族类型找到具体协议族的socket创建函数，在创建函数中根据协议族下具体的协议类型将此协议的函数操作集赋值给`socket`这个结构体，然后数据包的发送和接收就可以通过函数指针直接调用到不同协议的实际数据包发送和接收函数。


### 运输层向网络层注册接口

这个`运输层向网络层注册接口`的意思是TCP、UDP等协议向IP网络层注册自己的接口，当IP层收到数据后就会根据不同的协议调用对应的接口函数向上层传输数据。这个注册过程也是在`inet_init`函数中实现，如下图所示：   
![inet_add_protocol]({{"/css/pics/inet_register/inet_add_protocol.jpg"}})    
进入这个`inet_add_protocol`注册函数可以发现它是将`struct net_protocol`这个结构体加入到`inet_protos[MAX_INET_PROTOS]`这个全局数组中去。我们再来看对于TCP、UDP来说他是怎么初始化这个`struct net_protocol`结构体
的，代码也在`af_inet.c`文件中如下：
```c
static struct net_protocol tcp_protocol = {
	.early_demux	=	tcp_v4_early_demux,
	.early_demux_handler =  tcp_v4_early_demux,
	.handler	=	tcp_v4_rcv,
	.err_handler	=	tcp_v4_err,
	.no_policy	=	1,
	.netns_ok	=	1,
	.icmp_strict_tag_validation = 1,
};

static struct net_protocol udp_protocol = {
	.early_demux =	udp_v4_early_demux,
	.early_demux_handler =	udp_v4_early_demux,
	.handler =	udp_rcv,
	.err_handler =	udp_err,
	.no_policy =	1,
	.netns_ok =	1,
};
```
从这个结构体的初始化来看，我们就可以基本判断出IP层收到的数据包最后肯定是通过`udp_rcv`和`tcp_v4_rcv`函数进入在具体协议中去处理的。

然后我们再来看IP层中是如何调用这里注册的接口的，在[Linux协议栈--IP网络层](http://cxd2014.github.io/2016/10/17/network-ip/)这篇文章中我提到过IP网络层接收到的数据包最终在`ip_local_deliver_finish`函数中向上层协议分发。我们再次来看这个函数，他首先从数据包中取出`protocol`这个字段，然后用这个字段在`inet_protos[protocol]`全局数组中找到对应的协议，最后调用`ret = ipprot->handler(skb);`函数指针将数据包网上层发送，这个`handler`指针正好对应上面`struct net_protocol`结构体中初始化的`handler`函数。所以这里已经证明了我们上面的判断是正确的，哈哈！！
```c
static int ip_local_deliver_finish(struct net *net, struct sock *sk, struct sk_buff *skb)
{
	__skb_pull(skb, skb_network_header_len(skb));

	rcu_read_lock();
	{
		int protocol = ip_hdr(skb)->protocol;
		const struct net_protocol *ipprot;
		int raw;

	resubmit:
		raw = raw_local_deliver(skb, protocol);

		/* 根据数据包中的 protocol 字段在 inet_protos 数组中查找对应的协议 */
		ipprot = rcu_dereference(inet_protos[protocol]);
		if (ipprot) {
			int ret;

			if (!ipprot->no_policy) {
				if (!xfrm4_policy_check(NULL, XFRM_POLICY_IN, skb)) {
					kfree_skb(skb);
					goto out;
				}
				nf_reset(skb);
			}
			/* 调用对应协议的 handler 函数上传输层发送数据包，正好对应了上面的注册过程 */
			ret = ipprot->handler(skb);
			if (ret < 0) {
				protocol = -ret;
				goto resubmit;
			}
			__IP_INC_STATS(net, IPSTATS_MIB_INDELIVERS);
		} else {
			if (!raw) {
				if (xfrm4_policy_check(NULL, XFRM_POLICY_IN, skb)) {
					__IP_INC_STATS(net, IPSTATS_MIB_INUNKNOWNPROTOS);
					icmp_send(skb, ICMP_DEST_UNREACH,
						  ICMP_PROT_UNREACH, 0);
				}
				kfree_skb(skb);
			} else {
				__IP_INC_STATS(net, IPSTATS_MIB_INDELIVERS);
				consume_skb(skb);
			}
		}
	}
 out:
	rcu_read_unlock();

	return 0;
}
```

### 参考

基于Linux-4.12.1内核源码分析   

最后啰嗦两句，内核代码看多了你就会发现它并没有那么难懂，基本上大多数模块的实现套路都是一样的，无非是创建一个结构体里面包括各种函数指针，然后一边实现这些函数指针做具体的事情，然后注册到框架中；另一边就通过这些函数指针来调用到不同模块中的实际处理函数来完成相应功能。

