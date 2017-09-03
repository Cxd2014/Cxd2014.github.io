---
layout: post
title:  "Linux中的连接跟踪源码分析"
date:   2017-08-15 10:10:10
categories: network
tags: connection tracking system
---

* content
{:toc}

### 连接跟踪简介

以前的包过滤策略是根据数据包的头部信息，如IP源地址、目的地址、端口号来过滤包。这种方法很难解决探测和拒绝服务这种类型的攻击。幸运的是连接跟踪可以解决这种问题，在Netfilter项目之初连接跟踪就被加入到Linux内核中。连接跟踪是工作在Netfilter框架之上的一个模块。连接跟踪系统将一个连接的状态信息存放在内存中，这些信息包括目的、源IP地址、目的、源端口号、协议类型、状态和超时时间。使用这些信息我们可以实现更加智能的过滤策略。连接跟踪系统本身不会过滤数据包，除了一些特殊情况之外（例如，内存不足）它的默认行为是让数据包继续在网络协议栈中处理，所以请记住连接跟踪系统仅仅是跟踪数据包，没有过滤功能。

### 连接跟踪中的几种状态

连接跟踪系统中定义了一个连接可能处于以下几种状态：   
* NEW：一个连接的初始状态（例如：TCP连接中，一个SYN包的到来），或者防火墙只收到一个方向的流量（例如：防火墙在没有收到回复包之前）。
* ESTABLISHED：连接已经建立完成，换句话说防火墙已经看到了这条连接的双向通信。
* RELATED：这是一个异常连接。
* INVALID：这是一个特殊的状态，用于记录那些没有按照预期行为进行的连接。系统管理员可以定义一个iptables规则来记录和丢弃这种数据包。就像前面说的连接跟踪不会过滤数据包，但是他提供了一种方法来过滤。   

按照上面的描述，即使一个无状态协议例如UDP，也会有状态，但是这个状态和TCP中的状态是不一样的。

### 连接跟踪的建立

这里基于IPv4协议来简单跟踪一下Linux内核中一个连接跟踪的建立过程。首先连接跟踪是基于Netfilter实现的，所以它肯定会在Netfilter中注册钩子函数来处理数据包，这个过程是由`/net/ipv4/netfilter/nf_conntrack_l3proto_ipv4.c`文件中的`ipv4_hooks_register`函数实现，它最终调用`nf_register_net_hooks`函数一次性将`ipv4_conntrack_ops`数组中的6个钩子函数一起注册到Netfilter架构中。至于连接跟踪的建立肯定是在第一个钩子函数`ipv4_conntrack_in`中进行的，可以看到他的挂载点是`NF_INET_PRE_ROUTING`，也就是在数据包进入本机后，执行路由策略前就要对该数据包进行连接跟踪。

`ipv4_conntrack_in`函数会直接调用`nf_conntrack_in`函数，此函数在`/net/netfilter/nf_conntrack_core.c`文件中实现，此函数的大致流程是首先检查此数据包是否在连接跟踪中，如果不在则根据数据包中的信息找到对应的协议处理函数，对该连接跟踪做相应的正确性检查，然后调用`resolve_normal_ct`函数创建一个新的连接跟踪：

```c
unsigned int
nf_conntrack_in(struct net *net, u_int8_t pf, unsigned int hooknum,
		struct sk_buff *skb)
{
	struct nf_conn *ct, *tmpl;
	enum ip_conntrack_info ctinfo;
	struct nf_conntrack_l3proto *l3proto;
	struct nf_conntrack_l4proto *l4proto;
	unsigned int *timeouts;
	unsigned int dataoff;
	u_int8_t protonum;
	int ret;

    /* 首先判断该数据包是否已经做过连接跟踪，如果没有则将 skb->_nfct 标记设置为零 */
	tmpl = nf_ct_get(skb, &ctinfo);
	if (tmpl || ctinfo == IP_CT_UNTRACKED) {
		/* Previously seen (loopback or untracked)?  Ignore. */
		if ((tmpl && !nf_ct_is_template(tmpl)) ||
		     ctinfo == IP_CT_UNTRACKED) {
			NF_CT_STAT_INC_ATOMIC(net, ignore);
			return NF_ACCEPT;
		}
		skb->_nfct = 0;
	}

	/* rcu_read_lock()ed by nf_hook_thresh */
    /* 
     * 通过协议类型 pf 的值来得到该协议的L3层的协议处理函数，对于IPv4来说也就是IP网络层的处理函数
     * 这些函数在 /net/ipv4/netfilter/nf_conntrack_l3proto_ipv4.c 
     * 文件中的 nf_conntrack_l3proto_ipv4 结构体中注册
     */
	l3proto = __nf_ct_l3proto_find(pf);

    /* 
     * 通过L3层的 get_l4proto 函数获取L4层的协议类型，对于IPv4来说也就是TCP或者UDP运输层协议 
     * 对于TCP来说这些函数在 /net/netfilter/nf_conntrack_proto_tcp.c 
     * 文件中的 nf_conntrack_l4proto_tcp4 结构体中注册
     */
	ret = l3proto->get_l4proto(skb, skb_network_offset(skb),
				   &dataoff, &protonum);
	if (ret <= 0) {
		pr_debug("not prepared to track yet or error occurred\n");
		NF_CT_STAT_INC_ATOMIC(net, error);
		NF_CT_STAT_INC_ATOMIC(net, invalid);
		ret = -ret;
		goto out;
	}

    /* 通过L3层协议类型和L4层协议号，获取L4层的协议处理函数 */
	l4proto = __nf_ct_l4proto_find(pf, protonum);

	/* It may be an special packet, error, unclean...
	 * inverse of the return code tells to the netfilter
	 * core what to do with the packet. */
    /* 
     * 调用L4层协议的 error 函数对数据包进行正确性检查，对于TCP协议来说调用的是
     * nf_conntrack_l4proto_tcp4 结构体中的 tcp_error 函数
     */
	if (l4proto->error != NULL) {
		ret = l4proto->error(net, tmpl, skb, dataoff, pf, hooknum);
		if (ret <= 0) {
			NF_CT_STAT_INC_ATOMIC(net, error);
			NF_CT_STAT_INC_ATOMIC(net, invalid);
			ret = -ret;
			goto out;
		}
		/* ICMP[v6] protocol trackers may assign one conntrack. */
		if (skb->_nfct)
			goto out;
	}
repeat:
    /* 在此函数中对该数据包创建一个连接跟踪记录 */
	ret = resolve_normal_ct(net, tmpl, skb, dataoff, pf, protonum,
				l3proto, l4proto);
	if (ret < 0) {
		/* Too stressed to deal. */
		NF_CT_STAT_INC_ATOMIC(net, drop);
		ret = NF_DROP;
		goto out;
	}

	ct = nf_ct_get(skb, &ctinfo);
	if (!ct) {
		/* Not valid part of a connection */
		NF_CT_STAT_INC_ATOMIC(net, invalid);
		ret = NF_ACCEPT;
		goto out;
	}

	/* Decide what timeout policy we want to apply to this flow. */
	timeouts = nf_ct_timeout_lookup(net, ct, l4proto);

    /* 对于TCP来说是设置TCP的各种状态信息，对于UDP来说就只设置了一个超时时间 */
	ret = l4proto->packet(ct, skb, dataoff, ctinfo, pf, hooknum, timeouts);
	if (ret <= 0) {
		/* Invalid: inverse of the return code tells
		 * the netfilter core what to do */
		pr_debug("nf_conntrack_in: Can't track with proto module\n");
		nf_conntrack_put(&ct->ct_general);
		skb->_nfct = 0;
		NF_CT_STAT_INC_ATOMIC(net, invalid);
		if (ret == -NF_DROP)
			NF_CT_STAT_INC_ATOMIC(net, drop);
		/* Special case: TCP tracker reports an attempt to reopen a
		 * closed/aborted connection. We have to go back and create a
		 * fresh conntrack.
		 */
		if (ret == -NF_REPEAT)
			goto repeat;
		ret = -ret;
		goto out;
	}

	if (ctinfo == IP_CT_ESTABLISHED_REPLY &&
	    !test_and_set_bit(IPS_SEEN_REPLY_BIT, &ct->status))
		nf_conntrack_event_cache(IPCT_REPLY, ct);
out:
	if (tmpl)
		nf_ct_put(tmpl);

	return ret;
}
```

`resolve_normal_ct`函数首先会获取该数据包的五元组信息，然后通过这个信息计算出hash值，通过这个hash值在hash表中查找，如果没有找到则调用`init_conntrack`函数创建一个新的连接跟踪，最后调用`nf_ct_set`函数设置此数据包的连接跟踪标记。这里要特别强调一下这个标记，`nf_ct_set`函数中只有一行代码：`skb->_nfct = (unsigned long)ct | info;`可以看到他将`ct`这个结构体指针和`info`这个枚举类型同时放在了一个`unsigned long`类型的变量中，`info`这个枚举类型占最后3个bit，`ct`结构体占用剩下的所有bit位。这意味着`ct`这个结构体指针地址最低是8字节对齐的，才能留下3个空闲bit位用于存放`info`枚举类型。这种操作我估计也只有玩内核的大神才能想得出来。。。

```c
/* On success, returns 0, sets skb->_nfct | ctinfo */
static int
resolve_normal_ct(struct net *net, struct nf_conn *tmpl,
		  struct sk_buff *skb,
		  unsigned int dataoff,
		  u_int16_t l3num,
		  u_int8_t protonum,
		  struct nf_conntrack_l3proto *l3proto,
		  struct nf_conntrack_l4proto *l4proto)
{
	const struct nf_conntrack_zone *zone;
	struct nf_conntrack_tuple tuple;
	struct nf_conntrack_tuple_hash *h;
	enum ip_conntrack_info ctinfo;
	struct nf_conntrack_zone tmp;
	struct nf_conn *ct;
	u32 hash;

    /* struct nf_conntrack_tuple tuple 变量保存的就是一个连接的五元组信息，
     * nf_ct_get_tuple函数调用对应的协议处理函数来填充这个结构体 
     */
	if (!nf_ct_get_tuple(skb, skb_network_offset(skb),
			     dataoff, l3num, protonum, net, &tuple, l3proto,
			     l4proto)) {
		pr_debug("Can't get tuple\n");
		return 0;
	}

	/* look for tuple match */
	zone = nf_ct_zone_tmpl(tmpl, skb, &tmp);
    /* 通过五元组信息计算一个 hash 值 */
	hash = hash_conntrack_raw(&tuple, net);
    /* 使用这个hash值在hash表中查找，如果没有找到，则调用init_conntrack函数创建一个 */
	h = __nf_conntrack_find_get(net, zone, &tuple, hash);
	if (!h) {
		h = init_conntrack(net, tmpl, &tuple, l3proto, l4proto,
				   skb, dataoff, hash);
		if (!h)
			return 0;
		if (IS_ERR(h))
			return PTR_ERR(h);
	}
	ct = nf_ct_tuplehash_to_ctrack(h);

	/* It exists; we have (non-exclusive) reference. */
	if (NF_CT_DIRECTION(h) == IP_CT_DIR_REPLY) {
		ctinfo = IP_CT_ESTABLISHED_REPLY;
	} else {
		/* Once we've had two way comms, always ESTABLISHED. */
		if (test_bit(IPS_SEEN_REPLY_BIT, &ct->status)) {
			pr_debug("normal packet for %p\n", ct);
			ctinfo = IP_CT_ESTABLISHED;
		} else if (test_bit(IPS_EXPECTED_BIT, &ct->status)) {
			pr_debug("related packet for %p\n", ct);
			ctinfo = IP_CT_RELATED;
		} else {
			pr_debug("new packet for %p\n", ct);
			ctinfo = IP_CT_NEW;
		}
	}
    /* 设置 skb->_nfct 标记 */
	nf_ct_set(skb, ct, ctinfo);
	return 0;
}
```

### 连接跟踪的销毁

既然有创建连接跟踪的地方，那就肯定有销毁连接跟踪的地方，不然内核就发生内存泄漏了。连接跟踪的销毁是在`/net/netfilter/nf_conntrack_core.c`文件中的`gc_worker`函数中实现的，这个函数是个定时执行的函数，它首先会遍历整个hash表，然后通过检查一些标记来确定该连接是否可以被回收，例如一个最明显的标记就是`timeout`超时时间。最后调用`nf_ct_put`函数来进行实际的销毁动作。

### 参考

[Netfilter’s connection tracking system](http://people.netfilter.org/pablo/docs/login.pdf)   
基于Linux-4.12.1内核源码分析
