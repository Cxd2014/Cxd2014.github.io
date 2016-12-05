---
layout: post
title:  "Linux中网桥设备的实现"
date:   2016-12-05 10:20:10
categories: network
tags: linux vlan
---

* content
{:toc}

### IEEE802.1Q VLAN简介

IEEE 802.1Q所附加的VLAN识别信息，位于数据帧中“发送源MAC地址”与“类别域”（Type Field）之间。具体内容为2字节的TPID（Tag Protocol IDentifier）和2字节的TCI（Tag Control Information），共计4字节。
在数据帧中添加了4字节的内容，那么CRC值自然也会有所变化。这时数据帧上的CRC是插入TPID、TCI后，对包括它们在内的整个数据帧重新计算后所得的值。

![vlan_1]({{"/css/pics/vlan_1.jpg"}})

而当数据帧离开汇聚链路时，TPID和TCI会被去除，这时还会进行一次CRC的重新计算。
TPID字段在以太网报文中所处位置与不带VLAN Tag的报文中协议类型字段所处位置相同。TPID的值固定为0x8100，它标示网络帧承载的802.1Q类型，交换机通过它来确定数据帧内附加了基于IEEE 802.1Q的VLAN信息。而实质上的VLAN ID，是TCI中的12位元。由于总共有12位，因此最多可供识别4096个VLAN。
基于IEEE 802.1Q附加的VLAN信息，就像在传递物品时附加的标签。因此，它也被称作“标签型VLAN”（Tagging VLAN）。

#### PVID和VID

交换机中的`VID`(VLAN ID)很好理解，它是用于标记VLAN的，`VID`相同的端口属于同一个VLAN，可以相互通信。

`PVID`(Port VLAN ID)的作用就是当一个不带`tag`的包进来，交换机就将`PVID`作为VLAN ID来标记此数据包，然后转发到对应的端口上去。

#### Access和Trunk

Access（访问口）通常用于连接普通客户端的，只属于一个VLAN，且仅向该VLAN转发数据帧。

Trunk（汇聚口）通常用于交换机之间的连接，它同时属于交换机上所有的VLAN,能够转发所有VLAN的数据包。

注： 这里有一片文章对VLAN做了详细介绍：[VLAN原理详解](http://blog.csdn.net/phunxm/article/details/9498829)


### VLAN在Linux中的实现

和网桥一样，Linux中的VLAN是一种虚拟设备。他需要绑定一个真实网卡才能完成实际的数据发送和接收。
我们知道上层协议通过调用`ndo_start_xmit`函数接口来调用网卡驱动发送数据，所以上层协议首先调用VLAN虚拟设备的`ndo_start_xmit`函数接口，
然后在VLAN虚拟设备中将数据包打上`tag`。随后调用绑定的真实设备来完成数据包的实际发送。一个真实的物理网卡可以承载多个VLAN虚拟设备，
此时这个真实网卡就是`trunk`端口了。

![vlan_2]({{"/css/pics/vlan_2.jpg"}})

### VLAN设备的创建

Linux中可以使用`vconfig`命令来添加VLAN设备，当创建一个新的VLAN设备时通过`vlan_ioctl_handler`调用`register_vlan_device`函数来完成VLAN设备的创建（net/8021q/vlan.c）：
在`register_vlan_device`函数中首先检查要需要绑定的物理网卡是否支持VLAN，然后设置VLAN虚拟网卡的名字（例如：eth0.5 表示绑定的物理设备是eth0，VLAN ID是5）
接着初始化VLAN虚拟设备的`struct net_device`结构体，最后将VLAN虚拟设备注册进内核，使之可以被内核协议栈识别。

```c
static int register_vlan_device(struct net_device *real_dev, u16 vlan_id)
{
	struct net_device *new_dev;
	struct net *net = dev_net(real_dev);
	struct vlan_net *vn = net_generic(net, vlan_net_id);
	char name[IFNAMSIZ];
	int err;

	if (vlan_id >= VLAN_VID_MASK)
		return -ERANGE;
    
    /* 检查物理网卡是否支持VLAN操作 */
	err = vlan_check_real_dev(real_dev, vlan_id);
	if (err < 0)
		return err;

	/* Gotta set up the fields for the device. 
     * 设置VLAN虚拟设备的名字
     */
	switch (vn->name_type) {
	case VLAN_NAME_TYPE_RAW_PLUS_VID:
		/* name will look like:	 eth1.0005 */
		snprintf(name, IFNAMSIZ, "%s.%.4i", real_dev->name, vlan_id);
		break;
	case VLAN_NAME_TYPE_PLUS_VID_NO_PAD:
		/* Put our vlan.VID in the name.
		 * Name will look like:	 vlan5
		 */
		snprintf(name, IFNAMSIZ, "vlan%i", vlan_id);
		break;
	case VLAN_NAME_TYPE_RAW_PLUS_VID_NO_PAD:
		/* Put our vlan.VID in the name.
		 * Name will look like:	 eth0.5
		 */
		snprintf(name, IFNAMSIZ, "%s.%i", real_dev->name, vlan_id);
		break;
	case VLAN_NAME_TYPE_PLUS_VID:
		/* Put our vlan.VID in the name.
		 * Name will look like:	 vlan0005
		 */
	default:
		snprintf(name, IFNAMSIZ, "vlan%.4i", vlan_id);
	}

    /* 分配并初始化VLAN虚拟设备的struct net_device结构体 */
	new_dev = alloc_netdev_mq(sizeof(struct vlan_dev_info), name,
				  vlan_setup, real_dev->num_tx_queues);

	if (new_dev == NULL)
		return -ENOBUFS;

	new_dev->real_num_tx_queues = real_dev->real_num_tx_queues;
	dev_net_set(new_dev, net);
	/* need 4 bytes for extra VLAN header info,
	 * hope the underlying device can handle it.
	 */
	new_dev->mtu = real_dev->mtu;

	vlan_dev_info(new_dev)->vlan_id = vlan_id;
	vlan_dev_info(new_dev)->real_dev = real_dev;
	vlan_dev_info(new_dev)->dent = NULL;
	vlan_dev_info(new_dev)->flags = VLAN_FLAG_REORDER_HDR;

	new_dev->rtnl_link_ops = &vlan_link_ops;

    /* 将VLAN虚拟设备注册进内核 */
	err = register_vlan_dev(new_dev);
	if (err < 0)
		goto out_free_newdev;

	return 0;

out_free_newdev:
	free_netdev(new_dev);
	return err;
}
```

### VLAN的数据发送

当有数据需要通过VLAN虚拟设备发送时，上层协议通过调用`ndo_start_xmit`函数接口进入到VLAN虚拟设备的`vlan_dev_hard_start_xmit`函数中去，
VLAN虚拟设备的`net_device_ops`结构体定义在`net/8021q/vlan_dev.c`文件中，在`vlan_setup`函数中赋值给新添加的VLAN虚拟设备。
`vlan_dev_hard_start_xmit`函数的功能非常简单，首先判断数据包是否需要打上`tag`，如果需要则将数据包添加上`tag`。
然后将数据包发送设备设置为物理设备，最后再次将数据包加入到发送队列中去。

```c
static netdev_tx_t vlan_dev_hard_start_xmit(struct sk_buff *skb,
					    struct net_device *dev)
{
	int i = skb_get_queue_mapping(skb);
	struct netdev_queue *txq = netdev_get_tx_queue(dev, i);
	struct vlan_ethhdr *veth = (struct vlan_ethhdr *)(skb->data);
	unsigned int len;
	int ret;

	/* Handle non-VLAN frames if they are sent to us, for example by DHCP.
	 * 判断数据包是否需要打上tag，如果需要则将数据包添加上tag
	 * NOTE: THIS ASSUMES DIX ETHERNET, SPECIFICALLY NOT SUPPORTING
	 * OTHER THINGS LIKE FDDI/TokenRing/802.3 SNAPs...
	 */
	if (veth->h_vlan_proto != htons(ETH_P_8021Q) ||
	    vlan_dev_info(dev)->flags & VLAN_FLAG_REORDER_HDR) {
		unsigned int orig_headroom = skb_headroom(skb);
		u16 vlan_tci;

		vlan_dev_info(dev)->cnt_encap_on_xmit++;

		vlan_tci = vlan_dev_info(dev)->vlan_id;
		vlan_tci |= vlan_dev_get_egress_qos_mask(dev, skb);
		skb = __vlan_put_tag(skb, vlan_tci);
		if (!skb) {
			txq->tx_dropped++;
			return NETDEV_TX_OK;
		}

		if (orig_headroom < VLAN_HLEN)
			vlan_dev_info(dev)->cnt_inc_headroom_on_tx++;
	}

    /* 将数据包发送设备设置为物理设备 */
	skb_set_dev(skb, vlan_dev_info(dev)->real_dev);
	len = skb->len;
    /* 再次将数据包加入到发送队列中去 */
	ret = dev_queue_xmit(skb);

	if (likely(ret == NET_XMIT_SUCCESS || ret == NET_XMIT_CN)) {
		txq->tx_packets++;
		txq->tx_bytes += len;
	} else
		txq->tx_dropped++;

	return ret;
}
```

### VLAN的数据接收

内核协议栈对于VLAN数据包的处理和其他协议一样，VLAN模块首先向内核注册了一个和IP协议同等的`ETH_P_8021Q`(0x8100)协议（net/8021q/vlan.c）：

```c
static struct packet_type vlan_packet_type __read_mostly = {
	.type = cpu_to_be16(ETH_P_8021Q),
	.func = vlan_skb_recv, /* VLAN receive method */
};
```

所以在`__netif_receive_skb`函数中VLAN协议的处理和其他协议一样：首先识别协议号，然后根据协议号找到对应的协议处理函数。
如果是VLAN协议则会调用`vlan_skb_recv`函数。此函数的主要作用是数据包统计，然后去除`tag`最后将数据包重新放入数据包接收队列中。

```c
int vlan_skb_recv(struct sk_buff *skb, struct net_device *dev,
		  struct packet_type *ptype, struct net_device *orig_dev)
{
	struct vlan_hdr *vhdr;
	struct vlan_rx_stats *rx_stats;
	struct net_device *vlan_dev;
	u16 vlan_id;
	u16 vlan_tci;

	skb = skb_share_check(skb, GFP_ATOMIC);
	if (skb == NULL)
		goto err_free;

	if (unlikely(!pskb_may_pull(skb, VLAN_HLEN)))
		goto err_free;

	vhdr = (struct vlan_hdr *)skb->data;
	vlan_tci = ntohs(vhdr->h_vlan_TCI);
	vlan_id = vlan_tci & VLAN_VID_MASK;

	rcu_read_lock();
	vlan_dev = __find_vlan_dev(dev, vlan_id);

	/* If the VLAN device is defined, we use it.
	 * If not, and the VID is 0, it is a 802.1p packet (not
	 * really a VLAN), so we will just netif_rx it later to the
	 * original interface, but with the skb->proto set to the
	 * wrapped proto: we do nothing here.
     * 数据包数量统计
	 */

	if (!vlan_dev) {
		if (vlan_id) {
			pr_debug("%s: ERROR: No net_device for VID: %u on dev: %s\n",
				 __func__, vlan_id, dev->name);
			goto err_unlock;
		}
		rx_stats = NULL;
	} else {
		skb->dev = vlan_dev;

		rx_stats = per_cpu_ptr(vlan_dev_info(skb->dev)->vlan_rx_stats,
					smp_processor_id());
		u64_stats_update_begin(&rx_stats->syncp);
		rx_stats->rx_packets++;
		rx_stats->rx_bytes += skb->len;

		skb->priority = vlan_get_ingress_priority(skb->dev, vlan_tci);

		pr_debug("%s: priority: %u for TCI: %hu\n",
			 __func__, skb->priority, vlan_tci);

		switch (skb->pkt_type) {
		case PACKET_BROADCAST:
			/* Yeah, stats collect these together.. */
			/* stats->broadcast ++; // no such counter :-( */
			break;

		case PACKET_MULTICAST:
			rx_stats->rx_multicast++;
			break;

		case PACKET_OTHERHOST:
			/* Our lower layer thinks this is not local, let's make
			 * sure.
			 * This allows the VLAN to have a different MAC than the
			 * underlying device, and still route correctly.
			 */
			if (!compare_ether_addr(eth_hdr(skb)->h_dest,
						skb->dev->dev_addr))
				skb->pkt_type = PACKET_HOST;
			break;
		default:
			break;
		}
		u64_stats_update_end(&rx_stats->syncp);
	}

    /* 重新计算数据包的 checksum 值 */
	skb_pull_rcsum(skb, VLAN_HLEN);
	vlan_set_encap_proto(skb, vhdr);

	if (vlan_dev) {
        /* 取出VLAN tag */
		skb = vlan_check_reorder_header(skb);
		if (!skb) {
			rx_stats->rx_errors++;
			goto err_unlock;
		}
	}

    /* 将数据包重新放入数据包接收队列中 */
	netif_rx(skb);
	rcu_read_unlock();
	return NET_RX_SUCCESS;

err_unlock:
	rcu_read_unlock();
err_free:
	kfree_skb(skb);
	return NET_RX_DROP;
}
```

### 参考

[VLAN原理详解](http://blog.csdn.net/phunxm/article/details/9498829)

基于`Linux-2.6.36`内核分析
