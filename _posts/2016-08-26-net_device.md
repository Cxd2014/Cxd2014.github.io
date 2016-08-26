---

layout: post
title:  "Linux协议栈--网络设备驱动程序"
date:   2016-08-26 10:20:10
categories: network
tags: TCP/IP 网卡 协议栈

---

* content
{:toc}

### 网络设备在内核中的识别

网络设备驱动程序直接编译到内核时，需要由驱动程序将函数名为`xxx_probe`类型的函数放到`drivers\net\Space.c`文件中，
系统启动时就会自动调用配置硬件的探测函数来探测网络设备硬件。例如CS8900A网卡的探测函数为`cs89x0_probe`。然后根据网络控制器连入系统的总线类型，
如ISA总线、EISA总线、微通道MCA等，将网络设备探测函数加入到`struct devprobe2`数据结构类型数组中：

```c
static struct devprobe2 isa_probes[] __initdata = {
    #ifdef CONFIG_CS89x0
        {cs89x0_probe, 0},
    #endif
};
```

系统启动时会调用`ethif_probe2`函数，所有网络设备探测函数在这里被调用执行：

```c
static void __init ethif_probe2(int unit)
{
	unsigned long base_addr = netdev_boot_base("eth", unit);
	if (base_addr == 1)
		return;
	(void)(	probe_list2(unit, m68k_probes, base_addr == 0) &&
		probe_list2(unit, eisa_probes, base_addr == 0) &&
		probe_list2(unit, mca_probes, base_addr == 0) &&
		probe_list2(unit, isa_probes, base_addr == 0) &&
		probe_list2(unit, parport_probes, base_addr == 0));
}
```

### 网络设备的初始化

网络设备驱动程序中执行实际设备探测的函数，一般命名为`xxx_probel`；`xxx_probe`函数是`xxx_probel`函数的包装函数，它向实际探测函数传递正确的参数，
指定探测函数在某一确定的IO端口地址上探测设备，还是在所有可能的IO端口上探测设备。

`xxx_probel`函数的主要作用探测设备是否存在，探测设备的具体型号。然后初始化设备、初始化`net_device`结构体中的数据域，其中最重要的数据域是`dev->netdev_ops`它指定了所有上层程序操作网卡所对应的驱动函数。最后将`net_device`结构体注册到内核。
CS8900A网卡的所有操作函数如下：

```c
static const struct net_device_ops net_ops = {
	.ndo_open		= net_open,            //打开网络设备
	.ndo_stop		= net_close,           //关闭网络设备
	.ndo_tx_timeout		= net_timeout,
	.ndo_start_xmit 	= net_send_packet, //数据包发送函数
	.ndo_get_stats		= net_get_stats,   //获取数据包的统计信息
	.ndo_set_multicast_list = set_multicast_list, //组发送函数
	.ndo_set_mac_address 	= set_mac_address,
#ifdef CONFIG_NET_POLL_CONTROLLER
	.ndo_poll_controller	= net_poll_controller,
#endif
	.ndo_change_mtu		= eth_change_mtu,
	.ndo_validate_addr	= eth_validate_addr,
};
```

### 打开网络设备

上层程序调用`open`函数时最终会执行网络设备注册的`ndo_open`函数，如CS8900A注册的`net_open`函数。此函数的作用是为设备申请支持设备活动的各种资源，
包括：中断资源、DMA通道、网络设备物理地址等。

```c
static int net_open(struct net_device *dev)
{
		
	/* 注册中断 */
	for (i = 2; i < CS8920_NO_INTS; i++) {
		if ((1 << i) & lp->irq_map) {
			if (request_irq(i, net_interrupt, 0, dev->name, dev) == 0) {
				dev->irq = i;
				write_irq(dev, lp->chip_type, i);
				/* 这里只会申请了一个中断号，若申请成功则退出循环 */
				break;
			}
		}
	}


/* 如果允许DMA工作方式，首先为DMA发送分配数据缓冲区页面，如果分配不成功，则释放已申请的中断 */
#if ALLOW_DMA
	if (lp->use_dma) {
		if (lp->isa_config & ANY_ISA_DMA) {
			unsigned long flags;
			lp->dma_buff = (unsigned char *)__get_dma_pages(GFP_KERNEL,
							get_order(lp->dmasize * 1024));

			if (!lp->dma_buff) {
				printk(KERN_ERR "%s: cannot get %dK memory for DMA\n", dev->name, lp->dmasize);
				goto release_irq;
			}
			
			/* 为设备申请DMA通道，如果申请成功则将DMA通道号写入DMA通道寄存器 */
			memset(lp->dma_buff, 0, lp->dmasize * 1024);	/* Why? */
			if (request_dma(dev->dma, dev->name)) {
				printk(KERN_ERR "%s: cannot get dma channel %d\n", dev->name, dev->dma);
				goto release_irq;
			}
			write_dma(dev, lp->chip_type, dev->dma);

			/* 设置DMA的配置信息，比如DMA发送的缓冲区起始地址，发送方式，一次DMA发送字节数等 */
			lp->rx_dma_ptr = lp->dma_buff;
			lp->end_dma_buff = lp->dma_buff + lp->dmasize*1024;
			spin_lock_irqsave(&lp->lock, flags);
			disable_dma(dev->dma);
			clear_dma_ff(dev->dma);
			set_dma_mode(dev->dma, DMA_RX_MODE); /* auto_init as well */
			set_dma_addr(dev->dma, isa_virt_to_bus(lp->dma_buff));
			set_dma_count(dev->dma, lp->dmasize*1024);
			enable_dma(dev->dma);
			spin_unlock_irqrestore(&lp->lock, flags);
		}
	}
#endif	/* ALLOW_DMA */

	/* set the Ethernet address */
	for (i=0; i < ETH_ALEN/2; i++)
		writereg(dev, PP_IA+i*2, dev->dev_addr[i*2] | (dev->dev_addr[i*2+1] << 8));

	/* while we're testing the interface, leave interrupts disabled */
	writereg(dev, PP_BusCTL, MEMORY_ON);

	/* Turn on both receive and transmit operations */
	writereg(dev, PP_LineCTL, readreg(dev, PP_LineCTL) | SERIAL_RX_ON | SERIAL_TX_ON);

	/* Receive only error free packets addressed to this card */
	lp->rx_mode = 0;
	writereg(dev, PP_RxCTL, DEF_RX_ACCEPT);

	lp->curr_rx_cfg = RX_OK_ENBL | RX_CRC_ERROR_ENBL;

	if (lp->isa_config & STREAM_TRANSFER)
		lp->curr_rx_cfg |= RX_STREAM_ENBL;
#if ALLOW_DMA
	set_dma_cfg(dev);
#endif
	/* 配置接收寄存器 */
	writereg(dev, PP_RxCFG, lp->curr_rx_cfg);
	/* 配置发送寄存器 */
	writereg(dev, PP_TxCFG, TX_LOST_CRS_ENBL | TX_SQE_ERROR_ENBL | TX_OK_ENBL |
		TX_LATE_COL_ENBL | TX_JBR_ENBL | TX_ANY_COL_ENBL | TX_16_COL_ENBL);
	/* 配置缓冲区寄存器 */
	writereg(dev, PP_BufCFG, READY_FOR_TX_ENBL | RX_MISS_COUNT_OVRFLOW_ENBL |
#if ALLOW_DMA
		dma_bufcfg(dev) |
#endif
		TX_COL_COUNT_OVRFLOW_ENBL | TX_UNDERRUN_ENBL);

	/* now that we've got our act together, enable everything */
	writereg(dev, PP_BusCTL, ENABLE_IRQ
		 | (dev->mem_start?MEMORY_ON : 0) /* turn memory on */
#if ALLOW_DMA
		 | dma_busctl(dev)
#endif
                 );
		/* 启动设备发送队列 */
        netif_start_queue(dev);
	if (net_debug > 1)
		printk("cs89x0: net_open() succeeded\n");
	return 0;
bad_out:
	return ret;
}

```

### 网络设备发送数据包

CS8900A网卡的数据包发送函数是`net_send_packet`，此函数首先将发送命令与发送数据包长度写入芯片的相应寄存器，芯片接收到命令与数据包长度后，
在芯片的缓冲区中为发送数据包分配缓冲区，随后主机将要发送的数据包复制到芯片。

```c
static netdev_tx_t net_send_packet(struct sk_buff *skb,struct net_device *dev)
{
	struct net_local *lp = netdev_priv(dev);
	unsigned long flags;

	if (net_debug > 3) {
		printk("%s: sent %d byte packet of type %x\n",
			dev->name, skb->len,
			(skb->data[ETH_ALEN+ETH_ALEN] << 8) | skb->data[ETH_ALEN+ETH_ALEN+1]);
	}

	/* 禁止本地中断，停止设备的发送队列 */
	spin_lock_irqsave(&lp->lock, flags);
	netif_stop_queue(dev);

	/* 向寄存器写入发送命令和数据包长度 */
	writeword(dev->base_addr, TX_CMD_PORT, lp->send_cmd);
	writeword(dev->base_addr, TX_LEN_PORT, skb->len);

	/* 查看网卡是否有足够空间的缓冲区存放数据包 */
	if ((readreg(dev, PP_BusST) & READY_FOR_TX_NOW) == 0) {
		/*
		 * Gasp!  It hasn't.  But that shouldn't happen since
		 * we're waiting for TxOk, so return 1 and requeue this packet.
		 */

		spin_unlock_irqrestore(&lp->lock, flags);
		if (net_debug) printk("cs89x0: Tx buffer not free!\n");
		return NETDEV_TX_BUSY;
	}
	/* 将数据包复制到网卡缓冲区中去 */
	writewords(dev->base_addr, TX_FRAME_PORT,skb->data,(skb->len+1) >>1);
	/* 打开中断 */
	spin_unlock_irqrestore(&lp->lock, flags);
	dev->stats.tx_bytes += skb->len;
	/* 释放数据包 */
	dev_kfree_skb (skb);

	return NETDEV_TX_OK;
}
```

### 网络设备接收数据包

当网络设备接收到数据包后（以CS8900A为例），会产生一个中断。在`ndo_open`函数中注册的中断处理函数`net_interrupt`会被调用执行,中断函数将会调用`net_rx`函数来完成数据包的接受任务。
`net_rx`函数首先分配一个`sk_buff`结构体来存放数据包，然后调用`readwords`函数将数据包从网卡缓存区复制到内存。

```c
static irqreturn_t net_interrupt(int irq, void *dev_id)
{
	
	/* 读取网卡的中断寄存器ISQ，根据寄存器的值判断是什么原因产生的中断 */
	while ((status = readword(dev->base_addr, ISQ_PORT))) {
		if (net_debug > 4)printk("%s: event=%04x\n", dev->name, status);
		handled = 1;
		switch(status & ISQ_EVENT_MASK) {
		case ISQ_RECEIVER_EVENT:   /* 有数据包需要接受 */
			/* Got a packet(s). */
			net_rx(dev);           /* 调用net_rx函数接收数据 */
			break;
		case ISQ_TRANSMITTER_EVENT:  /* 发送数据帧完成事件 */
			dev->stats.tx_packets++; /* 更新发送统计信息 */
			netif_wake_queue(dev);	 /* 唤醒设备发送队列 */
			if ((status & (	TX_OK |  /* 根据发送事件产生原因，更新相应的统计信息 */
					TX_LOST_CRS |
					TX_SQE_ERROR |
					TX_LATE_COL |
					TX_16_COL)) != TX_OK) {
				if ((status & TX_OK) == 0)
					dev->stats.tx_errors++;
				if (status & TX_LOST_CRS)
					dev->stats.tx_carrier_errors++;
				if (status & TX_SQE_ERROR)
					dev->stats.tx_heartbeat_errors++;
				if (status & TX_LATE_COL)
					dev->stats.tx_window_errors++;
				if (status & TX_16_COL)
					dev->stats.tx_aborted_errors++;
			}
			break;
		case ISQ_BUFFER_EVENT:      /* 缓冲区事件中断 */
			if (status & READY_FOR_TX) {
				netif_wake_queue(dev);	/* Inform upper layers. */
			}
			if (status & TX_UNDERRUN) {
				if (net_debug > 0) printk("%s: transmit underrun\n", dev->name);
                                lp->send_underrun++;
                                if (lp->send_underrun == 3) lp->send_cmd = TX_AFTER_381;
                                else if (lp->send_underrun == 6) lp->send_cmd = TX_AFTER_ALL;
				netif_wake_queue(dev);	/* Inform upper layers. */
                        }
#if ALLOW_DMA
			if (lp->use_dma && (status & RX_DMA)) {
				int count = readreg(dev, PP_DmaFrameCnt);
				while(count) {
					if (net_debug > 5)
						printk("%s: receiving %d DMA frames\n", dev->name, count);
					if (net_debug > 2 && count >1)
						printk("%s: receiving %d DMA frames\n", dev->name, count);
					dma_rx(dev);
					if (--count == 0)
						count = readreg(dev, PP_DmaFrameCnt);
					if (net_debug > 2 && count > 0)
						printk("%s: continuing with %d DMA frames\n", dev->name, count);
				}
			}
#endif
			break;
		case ISQ_RX_MISS_EVENT:    /* 接收错误事件 */
			dev->stats.rx_missed_errors += (status >> 6);
			break;
		case ISQ_TX_COL_EVENT:     /* 发送冲突事件 */
			dev->stats.collisions += (status >> 6);
			break;
		}
	}
	return IRQ_RETVAL(handled);
}
```

### 参考

《嵌入式Linux网络体系结构设计与TCP/IP协议栈》