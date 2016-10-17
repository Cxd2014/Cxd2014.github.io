---
layout: post
title:  "Linux协议栈--数据链路层"
date:   2016-10-17 10:20:10
categories: network
tags: TCP/IP协议 IP网络层
---

* content
{:toc}

### IP网络层

数据包进入网络层后，IP协议的函数需要对数据包做以下处理：

* 数据包校验和检验
* 防火墙对数据包过滤
* IP选项处理
* 数据分片和重组
* 接受、发送和前送

### 输入数据包在IP层的处理

Linux内核定义了`ptype_base`链表来实现接口，网络层各协议将自己的接受数据包处理函数注册到`ptype_base`链表中，
数据链路层按接收数据包的`skb->protocol`值在`ptype_base`链表中找到匹配的协议实例，将数据包传给注册的处理函数。
IP协议在`PF_INET`协议族初始化函数`inet_init`中调用`dev_add_pack`函数注册处理函数`ip_rcv`。

`ip_rcv`函数的作用是对数据包做各种合法性检查：协议头长度、协议版本、数据包长度、校验和等。
然后调用网络过滤子系统的回调函数对数据包进行安全过滤（通过`NF_HOOK`宏进入网络过滤子系统，这就是著名的`netfilter`架构中的钩子，以后应该会研究一下`netfilter`架构），
如果数据包通过过滤系统则调用`ip_rcv_finish`函数对数据包进行实际处理。

`ip_rcv_finish`函数主要完成的任务是：

* 确定数据包是前送还是在本机协议栈中上传，如果是前送需要确定输出网络设备和下一个接收站点的地址。
* 解析和处理部分IP选项。

```
static int ip_rcv_finish(struct sk_buff *skb)
{
	const struct iphdr *iph = ip_hdr(skb);
	struct rtable *rt;

	/*
	 *	获取数据包传递的路由信息，如果 skb->dst 数据域为空，就通过路由子系统获取，
	 *	如果 ip_route_input 返回错误信息，表明数据包目标地址不正确，扔掉数据包
	 */
	if (skb_dst(skb) == NULL) {
		int err = ip_route_input_noref(skb, iph->daddr, iph->saddr,
					       iph->tos, skb->dev);
		if (unlikely(err)) {
			if (err == -EHOSTUNREACH)
				IP_INC_STATS_BH(dev_net(skb->dev),
						IPSTATS_MIB_INADDRERRORS);
			else if (err == -ENETUNREACH)
				IP_INC_STATS_BH(dev_net(skb->dev),
						IPSTATS_MIB_INNOROUTES);
			else if (err == -EXDEV)
				NET_INC_STATS_BH(dev_net(skb->dev),
						 LINUX_MIB_IPRPFILTER);
			goto drop;
		}
	}

   /*
    * 如果配置了流量控制功能，则更新QoS的统计信息
    */
#ifdef CONFIG_NET_CLS_ROUTE
	if (unlikely(skb_dst(skb)->tclassid)) {
		struct ip_rt_acct *st = this_cpu_ptr(ip_rt_acct);
		u32 idx = skb_dst(skb)->tclassid;
		st[idx&0xFF].o_packets++;
		st[idx&0xFF].o_bytes += skb->len;
		st[(idx>>16)&0xFF].i_packets++;
		st[(idx>>16)&0xFF].i_bytes += skb->len;
	}
#endif

    /* 如果IP协议头的长度大于20字节，说明有IP选项，调用 ip_rcv_options 函数处理IP选项 */
	if (iph->ihl > 5 && ip_rcv_options(skb))
		goto drop;

    /* 统计收到的各类数据包个数：组播包、广播包 */
	rt = skb_rtable(skb);
	if (rt->rt_type == RTN_MULTICAST) {
		IP_UPD_PO_STATS_BH(dev_net(rt->dst.dev), IPSTATS_MIB_INMCAST,
				skb->len);
	} else if (rt->rt_type == RTN_BROADCAST)
		IP_UPD_PO_STATS_BH(dev_net(rt->dst.dev), IPSTATS_MIB_INBCAST,
				skb->len);
    
    /* 在此函数中确定下一步对数据包的处理函数是哪一个，实际是调用函数指针 skb->dst->input 
     * 函数指针的值可能为 ip_local_deliver 或 ip_forward 函数
     */
	return dst_input(skb);

drop:
	kfree_skb(skb);
	return NET_RX_DROP;
}
```

#### 数据包从IP层上传至传输层

IP层处理完成后，如果是本地数据则调用`ip_local_deliver`函数，此函数的作用是如果IP数据包被分片了，在这里重组数据包。
然后再次通过`NF_HOOK`宏进入过滤子系统，最后调用`ip_local_deliver_finish`函数将数据包传递给传输层相关协议。

Linux内核支持的传输层协议都实现了各自的协议处理函数（如UDP、TCP协议），然后将协议处理函数放到`struct net_protocol`结构体中。
最后将`struct net_protocol`结构体注册到`inet_protos[MAX_INET_PROTOS]`全局数组中，
网络层协议头中的`protocol`数据域描述的协议编码，就是该协议在`inet_protos`全局数组中的索引号。

`ip_local_deliver_finish`函数的主要任务是：

* 将数据包传递给正确的协议处理函数
* 将数据包传递给裸IP
* 执行数据安全策略检查

```
static int ip_local_deliver_finish(struct sk_buff *skb)
{
	struct net *net = dev_net(skb->dev);

	__skb_pull(skb, ip_hdrlen(skb));

	/* Point into the IP datagram, just past the header. */
	skb_reset_transport_header(skb);

	/* 读取保护锁 */
	rcu_read_lock();
	{
		int protocol = ip_hdr(skb)->protocol;
		int hash, raw;
		const struct net_protocol *ipprot;

	resubmit:
        /* 如果有RAW socket传递给RAW socket处理 */
		raw = raw_local_deliver(skb, protocol);

		/* 根据 protocol 在inet_protos数组中获得上层协议实例 */
		hash = protocol & (MAX_INET_PROTOS - 1);
		ipprot = rcu_dereference(inet_protos[hash]);
		if (ipprot != NULL) {
			int ret;

			if (!net_eq(net, &init_net) && !ipprot->netns_ok) {
				if (net_ratelimit())
					printk("%s: proto %d isn't netns-ready\n",
						__func__, protocol);
				kfree_skb(skb);
				goto out;
			}
			
			/* 数据安全策略检查 */
			if (!ipprot->no_policy) {
				if (!xfrm4_policy_check(NULL, XFRM_POLICY_IN, skb)) {
					kfree_skb(skb);
					goto out;
				}
				nf_reset(skb);
			}
			/* 将数据包发送给上层协议 */
			ret = ipprot->handler(skb);
			if (ret < 0) {
				protocol = -ret;
				goto resubmit;
			}
			IP_INC_STATS_BH(net, IPSTATS_MIB_INDELIVERS);
		} else {
			/* 如果获取不到上层协议实例，并且也没有RAW socket则发送ICMP端口不可达报文 */
			if (!raw) {
				if (xfrm4_policy_check(NULL, XFRM_POLICY_IN, skb)) {
					IP_INC_STATS_BH(net, IPSTATS_MIB_INUNKNOWNPROTOS);
					icmp_send(skb, ICMP_DEST_UNREACH,
						  ICMP_PROT_UNREACH, 0);
				}
			} else
				IP_INC_STATS_BH(net, IPSTATS_MIB_INDELIVERS);
			kfree_skb(skb);
		}
	}
 out:
	rcu_read_unlock();

	return 0;
}
```

#### 数据包前送

如果数据包的目的地址不是本机，内核需要将数据包前送给适当的主机（如果内核被设置为允许路由数据包，否则丢弃）。
如果数据包需要前送则调用`ip_forward`函数。处理数据包前送的主要步骤如下：

* 处理IP选项，主要是在IP协议头中记录本机IP地址和数据包到达本机的时间信息。
* 基于IP协议头的数据域确定数据包可以前送
* 对IP协议头中的TTL数据域减1，如果TTL为0则扔掉数据包
* 基于路由的MTU，如果数据包的长度大于MTU，对数据包进行分片处理
* 将数据包通过选定的网络接口发送出去。
* 处理错误，如果由于某种原因或错误数据包不能前送，源主机会收到一条ICMP报文。

### 输出数据包在IP层的处理

数据包对外发送阶段在内核的处理任务包括：

* 查找下一站点，IP层需要知道由哪个网络设备发送数据和到达下一站点的路由器，寻找路由的任务由`ip_route_output_flow`函数来完成，它由网络层或传输层调用。
* 初始化IP头部的几个数据域和数据包分片以及处理校验和
* 由网络过滤子系统检查数据包
* 更新统计信息

#### 执行发送的关键函数

Linux内核在传输层实现了多个传输层协议实例，在应用与TCP/IP协议栈之间发送数据包时，如果使用的协议不同则调用IP层的发送函数也不同。
下图是传输层和网络层发送数据包最后阶段的关键函数：

![ip]({{"/css/pics/network-ip.jpg"}})

图1 注：当裸IP使用了`IP_HDRINCL`选项时，由应用程序自己构造全部IP协议头部，所以可以直接调用`dst_input`函数。

下面介绍一下图中几个函数的作用：

* `ip_queue_xmit`函数将数据包从传输层发送到网络层，设置路由、创建IP协议头和IP选项，调用`dst_input`发送
* `ip_append_data`函数将数据包缓存到缓冲区、管理缓冲区
* `ip_push_pending_frames`函数将`ip_append_data`函数和`ip_append_page`函数创建的输出队列发送出去
* `dst_output`函数是一个函数指针，它指向`ip_output`函数
* `ip_finish_output2`函数最终通过`dst->neighbour->output`函数指针或`hh->hh_output`函数指针调用数据链路层的`dev_queue_xmit`函数发送，这两个函数指针的初始化在`/net/ipv4/arp.c`文件中


### 参考

《嵌入式Linux网络体系结构设计与TCP/IP协议栈》

注：这是Linux协议栈系列的最后一篇文章，这几篇文章都是基于`Linux-2.6.36`内核源码分析的。




