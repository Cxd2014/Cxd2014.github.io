---
layout: post
title:  "Linux中网桥设备的实现"
date:   2016-11-08 10:20:10
categories: network
tags: linux bridge 网桥
---

* content
{:toc}

### 网桥的概念

网桥就是将桥一端的网络数据转发到桥的另一端的设备，这个转发是双向的。网桥和交换机是同一种设备。

* 网桥工作在数据链路层上。
* 网桥所连接的网络需要在同一网段内。

![bridge_1]({{"/css/pics/bridge_1.jpg"}})

### 网桥在Linux中的实现

Linux中的网桥是一种虚拟设备。通常我们将一个或几个真实的设备（网卡）绑定到网桥设备上，网桥设备将绑定在它上面的设备视为端口`port`，
从而统一管理所有从设备。可以为网桥配置一个IP地址，而它的MAC地址则是它管理的所有从设备中最小的那个MAC地址。
绑定在网桥上的从设备不再需要IP地址及MAC，且他们被设置为可以接受任何数据包（设置网卡为混杂模式），然后统一交给网桥设备来决定数据包的去向：接受、转发、丢弃。
网桥对于Linux内核而言就是一个普通的网卡设备，当内核要发送数据时会调用网桥向内核注册的网卡驱动程序。然后在网桥内部决策由哪个从设备完成数据包的实际发送。

![bridge_2]({{"/css/pics/bridge_2.jpg"}})

图2 Linux中网桥设备上的数据传输

### 网桥设备的初始化

#### 网桥设备的创建

Linux中可以使用`brctl`命令来管理网桥设备，当创建一个新的网桥设备时的主要函数调用关系如下（net/bridge/br_if.c）：

`br_add_bridge` ==> `new_bridge_dev` ==> `br_dev_setup`

在`br_dev_setup`函数中注册一个`net_device_ops`，这就是网桥设备对上层的接口。

```c
static const struct net_device_ops br_netdev_ops = {
	.ndo_open		 = br_dev_open,
	.ndo_stop		 = br_dev_stop,
	.ndo_start_xmit		 = br_dev_xmit,
	.ndo_get_stats64	 = br_get_stats64,
	.ndo_set_mac_address	 = br_set_mac_address,
	.ndo_set_multicast_list	 = br_dev_set_multicast_list,
	.ndo_change_mtu		 = br_change_mtu,
	.ndo_do_ioctl		 = br_dev_ioctl,
#ifdef CONFIG_NET_POLL_CONTROLLER
	.ndo_netpoll_setup	 = br_netpoll_setup,
	.ndo_netpoll_cleanup	 = br_netpoll_cleanup,
	.ndo_poll_controller	 = br_poll_controller,
#endif
}
```

#### 网桥设备下添加从设备

网桥设备创建完成后需要在其下面添加从设备才能使网桥设备正常工作起来，添加从设备也可以使用`brctl`命令完成。
添加从设备的主要任务在`br_add_if`函数中完成。其中最重要的两个任务是调用`dev_set_promiscuity`函数设置从设备为混杂模式。
然后调用`netdev_rx_handler_register`函数将从设备的`dev->rx_handler_data`实例赋值为`br_handle_frame`函数。
这就实现了将从设备接受到的所有数据包转发给网桥设备的功能。

```c
int netdev_rx_handler_register(struct net_device *dev,
			       rx_handler_func_t *rx_handler,
			       void *rx_handler_data)
{
	ASSERT_RTNL();

	if (dev->rx_handler)
		return -EBUSY;

	rcu_assign_pointer(dev->rx_handler_data, rx_handler_data);
	rcu_assign_pointer(dev->rx_handler, rx_handler);

	return 0;
}
```

### 网桥的数据发送

前面说过网桥设备对于内核来说就是一个普通的网卡，当有数据需要发送时内核调用函数指针`ndo_start_xmit`，
这样就进入到了网桥设备向内核注册的`br_dev_xmit`函数中。在此函数中首先检查数据包是否是广播数据包，
如果是则将数据包下发给所有端口（这里的端口指网桥下面的从设备）。如果不是则调用`__br_fdb_get`函数查找需要下发的端口，
如果找到则下发给指定端口，如果没有找到则下发给所有端口。

```c
netdev_tx_t br_dev_xmit(struct sk_buff *skb, struct net_device *dev)
{
	···

	rcu_read_lock();
	/* 检查数据包是否是广播数据包 */
	if (is_multicast_ether_addr(dest)) {
		if (unlikely(netpoll_tx_running(dev))) {
			br_flood_deliver(br, skb);
			goto out;
		}
		if (br_multicast_rcv(br, NULL, skb)) {
			kfree_skb(skb);
			goto out;
		}

		mdst = br_mdb_get(br, skb);
		if (mdst || BR_INPUT_SKB_CB_MROUTERS_ONLY(skb))
			br_multicast_deliver(mdst, skb); /* 多播数据包 */
		else
			br_flood_deliver(br, skb); /* 广播数据包 */
	}  /* 查找端口 */
	else if ((dst = __br_fdb_get(br, dest)) != NULL)
		br_deliver(dst->dst, skb); /* 下发给指定端口 */
	else
		br_flood_deliver(br, skb); /* 广播数据 */

out:
	rcu_read_unlock();
	return NETDEV_TX_OK;
}
```

### 网桥的数据接收

数据链路层的所有数据包都会经过`__netif_receive_skb`函数，
在此函数中会调用`rcu_dereference`函数解引用`skb->dev->rx_handler`函数指针，
这个函数指针正好是前面说过的在网桥设备下添加从设备时将它赋值为`br_handle_frame`函数。这样就将数据包交给了网桥设备。

```c
static int __netif_receive_skb(struct sk_buff *skb)
{
	···

	/* Handle special case of bridge or macvlan */
		rx_handler = rcu_dereference(skb->dev->rx_handler);
		if (rx_handler) {
			if (pt_prev) {
				ret = deliver_skb(skb, pt_prev, orig_dev);
				pt_prev = NULL;
			}
			skb = rx_handler(skb);
			if (!skb)
				goto out;
		}
	
	···
}
```

在`br_handle_frame`函数中首先检查数据包的合法性，如果有问题就直接丢掉。然后调用`br_handle_frame_finish`函数
在此函数中决定数据包的前送或者上传给内核。如果是本地数据包则调用`br_pass_frame_up`函数回到`__netif_receive_skb`函数中继续处理。
如果是前送数据包则调用`br_forward`函数，最终在`br_dev_queue_push_xmit`函数中调用`dev_queue_xmit`函数下发给指定端口将数据包发送出去。

```c
int br_handle_frame_finish(struct sk_buff *skb)
{
	const unsigned char *dest = eth_hdr(skb)->h_dest;
	struct net_bridge_port *p = br_port_get_rcu(skb->dev);
	struct net_bridge *br;
	struct net_bridge_fdb_entry *dst;
	struct net_bridge_mdb_entry *mdst;
	struct sk_buff *skb2;

	if (!p || p->state == BR_STATE_DISABLED)
		goto drop;

	/* insert into forwarding database after filtering to avoid spoofing */
	br = p->br;
	br_fdb_update(br, p, eth_hdr(skb)->h_source);

	if (is_multicast_ether_addr(dest) &&
	    br_multicast_rcv(br, p, skb))
		goto drop;

	if (p->state == BR_STATE_LEARNING)
		goto drop;

	BR_INPUT_SKB_CB(skb)->brdev = br->dev;

	/* The packet skb2 goes to the local host (NULL to skip). */
	skb2 = NULL;

	if (br->dev->flags & IFF_PROMISC)
		skb2 = skb;

	dst = NULL;

	if (is_multicast_ether_addr(dest)) {
		mdst = br_mdb_get(br, skb);
		if (mdst || BR_INPUT_SKB_CB_MROUTERS_ONLY(skb)) {
			if ((mdst && !hlist_unhashed(&mdst->mglist)) ||
			    br_multicast_is_router(br))
				skb2 = skb;
			br_multicast_forward(mdst, skb, skb2);
			skb = NULL;
			if (!skb2)
				goto out;
		} else
			skb2 = skb;

		br->dev->stats.multicast++;
	} else if ((dst = __br_fdb_get(br, dest)) && dst->is_local) {
		skb2 = skb;
		/* Do not forward the packet since it's local. */
		skb = NULL;
	}
	
	/* 前送数据包 */
	if (skb) {
		if (dst)
			br_forward(dst->dst, skb, skb2);
		else
			br_flood_forward(br, skb, skb2);
	}

	/* 本地数据包上传 */
	if (skb2)
		return br_pass_frame_up(skb2);

out:
	return 0;
drop:
	kfree_skb(skb);
	goto out;
}
```

### 参考

《深入理解LINUX网络技术内幕》

[Linux下的虚拟Bridge实现](http://www.cnblogs.com/zmkeil/archive/2013/04/21/3034733.html)

基于`Linux2.6.36`内核分析