---
layout: post
title:  "Linux协议栈--数据链路层"
date:   2016-10-01 10:20:10
categories: network
tags: TCP/IP协议 数据链路层
---

* content
{:toc}


## 数据链路层的数据接收过程

### 将数据包加入到CPU的输入队列

当设备驱动程序接受到数据时，产生一个中断然后在中断处理函数中调用数据链路层的`netif_rx`函数，
此函数的作用是把输入数据帧放入CPU的输入队列中（每个CPU都以一个独立的输入队列），随后标记软件中断，在软件中断中将数据帧上传给TCP/IP协议栈。
`netif_rx`函数的主要任务都是调用`enqueue_to_backlog`函数完成的。

```c
static int enqueue_to_backlog(struct sk_buff *skb, int cpu,
			      unsigned int *qtail)
{
	struct softnet_data *sd;
	unsigned long flags;
	sd = &per_cpu(softnet_data, cpu);
	local_irq_save(flags);

	rps_lock(sd);
    /* 如果存放数据包的队列已满则直接丢掉数据包返回 NET_RX_DROP  */
	if (skb_queue_len(&sd->input_pkt_queue) <= netdev_max_backlog) {

        /* 如果存放数据包的队列不为空则将数据包放入队列后直接返回 NET_RX_SUCCESS */
        /* 当队列不为空时说明前面已经标记过接受软件中断，不需要在标记 */
		if (skb_queue_len(&sd->input_pkt_queue)) {
enqueue:
			__skb_queue_tail(&sd->input_pkt_queue, skb);
			input_queue_tail_incr_save(sd, qtail);
			rps_unlock(sd);
			local_irq_restore(flags);
			return NET_RX_SUCCESS;
		}

		/* 如果存放数据包的队列为空则先调用 ____napi_schedule 函数标记软件中断，然后再加入队列 */
        /* 如果队列为空时则说明是当前收到的第一个数据帧，应标记接受软件中断 */
		if (!__test_and_set_bit(NAPI_STATE_SCHED, &sd->backlog.state)) {
			if (!rps_ipi_queued(sd))
				____napi_schedule(sd, &sd->backlog);
		}
		goto enqueue;
	}

	sd->dropped++;
	rps_unlock(sd);
	local_irq_restore(flags);
	kfree_skb(skb);
	return NET_RX_DROP;
}
```

### 软件中断处理过程

软件中断的处理函数是`net_rx_action`函数，它在`net_dev_init`函数中被注册，
它的作用是展开`poll_list`队列链表，从队列中获取每一个`struct napi_struct`结构体的实例，
然后调用它们的`poll`函数指针指向的实例。

```c
static void net_rx_action(struct softirq_action *h)
{
    /* 如果队列不为空 */
	while (!list_empty(&sd->poll_list)) {
		struct napi_struct *n;

        /* 取出队列中的第一个元素 */
		n = list_first_entry(&sd->poll_list, struct napi_struct, poll_list);

		if (test_bit(NAPI_STATE_SCHED, &n->state)) {
            /* 调用`poll`函数指针指向的实例 */
			work = n->poll(n, weight);
			trace_napi_poll(n);
		}
    }
}
```

`struct napi_struct`结构体中`poll`函数指针的实例是`process_backlog`函数，是在`net_dev_init`函数中初始化的。
`process_backlog`函数的作用就是从CPU输入队列中读取所有存放数据包的`Socker Buffer`，
然后调用`__netif_receive_skb`函数根据协议类型`type = skb->protocol`将数据包传递给上层对应的协议处理函数。

## 数据链路层的数据发送过程

内核提供了`dev_queue_xmit`函数，上层所有协议都调用此函数将数据帧放到网络设备的发送队列，随后流量控制系统
按照内核配置的队列管理策略，将网络设备发送队列中的数据帧依次发送给设备驱动程序的`dev->netdev_ops->ndo_start_xmit`方法。
`dev_queue_xmit`函数的任务是：如果此设备有队列则将数据帧放入队列中然后调用`__dev_xmit_skb`函数，
在此函数中根据一系列流量控制规则来决定要发送的数据包，最终调用`dev_hard_start_xmit`函数将数据帧发送给驱动程序。
如果此设备没有队列（如回环设备）则调用`dev_hard_start_xmit`函数，直接将数据帧发送给驱动程序。

`__dev_xmit_skb`函数的函数调用链如图，因为涉及到QoS部分，这部分的处理过程非常复杂，以后应该会专门分析这块内容，现在只能简单了解一下函数调用路径：

![tc]({{"/css/pics/tc.jpg"}})

### 参考

《嵌入式Linux网络体系结构设计与TCP/IP协议栈》
