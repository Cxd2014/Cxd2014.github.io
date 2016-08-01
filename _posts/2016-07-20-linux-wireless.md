---

layout: post
title:  "Linux无线网络简介"
date:   2016-07-20 10:20:10
categories: linux
tags: Linux wireless wifi

---

* content
{:toc}


### 前言

本文章翻译于：[Linux Wireless Networking: a short walk](https://www.linux.com/blog/linux-wireless-networking-short-walk)


### Linux无线网络简介

Linux无线模块和内核的接口是怎样的？无线数据包是怎样接受和发送的？

当我的工作开始涉及Linux无线时，我迷失在这庞大的代码库中。然后四处查找能够解答上面这些高层次问题的介绍资料。

在跟踪源码验证后，将我的总结放在这里，希望可以帮助到那些想要了解Linux无线网络大致框架的人。

### 概要

在开始谈论之前让我们先了解一下无线网络的总体框架，如图1。
它展示了Linux内核网络中的各个模块和Linux无线网络是怎样加入到内核的。

![arch]({{ "/css/pics/arch.jpg"}}) 

其中最大的一块区域是Linux内核空间。用户空间的应用程序运行在它上面，硬件设备在内核的下面。左边是以太网设备，右边是WIFI设备。

WIFI设备有两种类型，它取决于IEEE802.11 MLME是在哪实现的。如果是在硬件设备上实现的则这个设备是完整的MAC设备，如果是在软件上实现的则这个设备是软MAC设备。现今大多数设备都是软MAC设备。

通常我们可以认为Linux无线子系统包括两大块：cfg80211和mac80211，他们帮助WIFI驱动提供内核和用户空间的接口。通常cfg80211在内核中提供配置管理服务，它也通过nl80211提供用户空间的管理接口。
软MAC和全MAC设备都需要cfg80211才能工作。Mac80211是驱动API它只支持软MAC设备。我们关注的重点是图1中显示的软MAC设备。

Linux无线子系统和WIFI驱动都是处理OSI模型中的下面两层(MAC 和 PHY层)。如果需要更细致的划分MAC层可以分为上层MAC和下层MAC，上层MAC负责管理方面（例如：探测、认证和关联），
下层MAC负责对时序要求严格的操作例如ACK。大多数时候，硬件例如WiFi适配器，处理大部分PHY层和下层MAC的任务，而Linux无线子系统处理大多数上层MAC的任务。

### 模块之间的接口

图1中的各个模块都是明确划分的，这意味着一个模块发生了变化不会影响其他模块。例如，我们可能会对WiFi驱动模块做一些修改（例如：打补丁或者增加新的驱动来支持新设备），
但是这些改变不会影响mac80211模块，我们不需要改变mac80211模块中的代码。在比如增加一个新的网络协议，理想情况下不需要改变socket层和设备无关层的代码。
这种方式通常是通过函数指针来实现的。下面的例子是WiFi驱动模块和mac80211模块之间的接口：

```c
static const struct ieee80211_ops rt73usb_mac80211_ops = { 
    .tx                     = rt2x00mac_tx,
    .start                  = rt2x00mac_start,         
    .stop                   = rt2x00mac_stop,         
    .add_interface          = rt2x00mac_add_interface,         
    .remove_interface       = rt2x00mac_remove_interface,         
    .config                 = rt2x00mac_config,         
    .configure_filter       = rt2x00mac_configure_filter,         
    .set_tim                = rt2x00mac_set_tim,         
    .set_key                = rt2x00mac_set_key,         
    .sw_scan_start          = rt2x00mac_sw_scan_start,         
    .sw_scan_complete       = rt2x00mac_sw_scan_complete,         
    .get_stats              = rt2x00mac_get_stats,         
    .bss_info_changed       = rt2x00mac_bss_info_changed,         
    .conf_tx                = rt73usb_conf_tx,         
    .get_tsf                = rt73usb_get_tsf,         
    .rfkill_poll            = rt2x00mac_rfkill_poll,         
    .flush                  = rt2x00mac_flush,         
    .set_antenna            = rt2x00mac_set_antenna,         
    .get_antenna            = rt2x00mac_get_antenna,         
    .get_ringparam          = rt2x00mac_get_ringparam,         
    .tx_frames_pending      = rt2x00mac_tx_frames_pending,
}; 
```

`ieee80211_ops`结构体中左边的API函数是mac80211模块提供给WiFi设备驱动的，它们需要设备驱动来实现这些函数。很明显，不同的设备驱动实现方法是不同的。 
`ieee80211_ops`结构体用于将设备驱动的具体实现映射为mac80211模块中公共的API。当驱动注册时，这些处理函数也被注册到mac80211模块中（通过 `ieee80211_alloc_hw`），
然后mac80211可以随便调用API而不需要知道他的真实函数名和实现细节。`ieee80211_ops`结构体中包含一个很长的API函数列表，但是他们不都是强制性的。只需要实现前面7个APIs就可以通过编译阶段，
但是为了正确的功能还需要实现更多上面列出的APIs。

### 数据路径和管理路径

图1的架构中有两个主要的路径：一个数据路径和一个管理路径。数据路径对应IEEE 802.11的数据帧，管理路径对应IEEE 802.11的管理帧。
IEEE 802.11控制帧通常用于时序要求严格的操作例如ACK，他们通常是被硬件处理的。一个例外是PS-Poll帧，它也可以在mac80211中处理。
数据和管理路径在mac80211模块中被分开。

### 数据包是怎样传递的？

本节我们来讨论数据的传输路径。

从用户空间的应用程序开始，通常我们创建一个socket然后绑定到一个接口上面（例如：以太网或者WiFi），将数据放在socket缓冲区中然后发送它。
在创建socket时我们也会指定协议族，他会被内核使用。这些都发生在图1的data application模块中。最后它会调用系统调用，接下来的工作发生在内核空间。

传输路径首先通过socket层，这个层里有一个重要的结构体sk_buff，通常称为skb。skb保存着数据帧的指针并且会跟踪数据帧的长度。他为数据帧在内核中不同层之间的传输提供了非常好的支持和APIs，
例如插入或者删除不同层的协议头，并且他会被用在数据包的整个发送和接受过程中。

然后数据包传送到网络协议层，网络协议层没有什么好说的因为讨论网络协议的资料太多了。网络协议不是本文关注的重点你只需要知道根据创建socket时指定的协议类型映射为相应的网络协议然后这个协议会继续处理数据包就可以了。

到此时数据包传送到了设备无关层，这里连接着不同的硬件设备如以太网和WiFi对应着不同的网络协议。
设备无关层是用一个重要的结构体 `net_device` 来表示。他是内核与以太网设备驱动之间的接口，如图1中显示的以太网驱动模块。该接口中包含一个 `net_device_ops` 结构体，这个结构体中包含一长列操作函数。例如发送函数：

```c
struct net_device_ops { 
    ...
    netdev_tx_t(*ndo_start_xmit) (struct sk_buff *skb, struct net_device *dev); 
    ...
};
```

发送数据包时会调用`dev_queue_xmit`函数，这个函数最终会调用`ops->ndo_start_xmit(skb, dev)`。这正是以太网设备驱动在注册时的一个必要API函数。

对于WiFi设备来说，通常是由`mac80211`模块（而不是设备驱动）注册`netdev_ops`。查看`net/mac80211/iface.c`：

```c
static const struct net_device_ops ieee80211_dataif_ops = {        
    .ndo_open               = ieee80211_open,        
    .ndo_stop               = ieee80211_stop,        
    .ndo_uninit             = ieee80211_uninit,        
    .ndo_start_xmit         = ieee80211_subif_start_xmit,        
    .ndo_set_rx_mode        = ieee80211_set_multicast_list,        
    .ndo_change_mtu         = ieee80211_change_mtu,       
    .ndo_set_mac_address    = ieee80211_change_mac,       
    .ndo_select_queue       = ieee80211_netdev_select_queue,
};
```

因此mac80211模块是作为一个`net_device`出现的，当一个数据包需要通过WiFi发送时对应的发送函数`ieee80211_subif_start_xmit`会被调用。然后我们就进入到了mac80211模块，` ieee80211_subif_start_xmit`函数内的调用链如下：
ieee80211_xmit => ieee80211_tx => ieee80211_tx_frags => drv_tx
现在我们到了mac80211模块和WiFi驱动的边界。`drv_tx`只是一个简单的包装函数，它对应着WiFi设备驱动注册的发送函数`tx`：

```c
static inline void drv_tx(struct ieee80211_local *local, struct ieee80211_tx_control *control, struct sk_buff *skb)
{        
    local->ops->tx(&local->hw, control, skb);
}
```

这时mac80211模块结束的地方，该设备驱动接管了。

如前面提到的，mac80211模块通过`local->ops->tx`会调用到设备驱动注册的处理函数，每个驱动的处理函数实现方式都不一样。前面例子中的处理函数是` rt2x00mac_tx`，它首先需要准备发送描述符通常包括例如：帧长度、ACK策略、RTS/CTS、MCS、重传限制和多余片段等等信息。
有些信息是mac80211模块传递过去的（例如：`ieeee80211_tx_info`结构体中包含了设备驱动需要做的事情），
设备驱动必须将信息转换为下层硬件设备能够理解的格式。一旦设备的特定描述符准备好了，驱动程序可能会调整数据帧（例如：调整字节对齐）然后将数据帧放在发送队列上，最后将数据帧（和发送描述符）发送给硬件。
我们的例子中是一个基于`rt73usb`的USB WiFi适配器，所以数据帧是通过USB接口发送给硬件的，然后硬件会在数据包中加上PHY头和其他信息最后通过无线发送出去。
驱动也需要返回发送的结果（也是通过`ieee80211_tx_info`结构体）给mac80211模块，通过调用`ieee80211_tx_status`或者它的变种。这也标志着数据包的发送结束了。

### 管理路径是什么样的？

理论上我们可以像发送数据包一样在用户空间构造管理帧然后通过socket发送它，但是用户空间已经有了非常先进的工具，特别是`wpa_supplicant`和`host_apd`他们可以做这些工作。
`Wpa_supplicant`控制无线客户端的连接过程例如扫描、认证、关联，而`host_apd`功能如同AP。这些用户空间的工具使用netlink socket与内核通信，内核中对应的处理是cfg80211模块中的nl80211。
这些用户空间的工具会调用netlink库中的发送函数来传递命令给内核（例如：`NL80211_CMD_TRIGGER_SCAN`），在内核空间这些命令被nl80211接收，它使用结构体`static struct genl_ops nl80211_ops`使命令和执行动作一一映射：

```c
static const struct genl_opsnl80211_ops[] = {
    ...
    {                
        .cmd = NL80211_CMD_TRIGGER_SCAN,                
        .doit = nl80211_trigger_scan,                
        .policy = nl80211_policy,                
        .flags = GENL_ADMIN_PERM,                
        .internal_flags = NL80211_FLAG_NEED_WDEV_UP | NL80211_FLAG_NEED_RTNL,        
    },
    ...
};
```

这个是触发扫描的例子，扫描请求从cfg80211传递到mac80211是通过mac80211在cfg80211中的结构体`cfg80211_ops`中注册的扫描处理函数完成的：

```c
const struct cfg80211_ops mac80211_config_ops = {
    ...    
    .scan = ieee80211_scan,
    ...
};
```

mac80211模块中的`ieee80211_scan`函数会接管扫描任务：

```c
    =>ieee80211_scan_state_send_probe 

    =>ieee80211_send_probe_req

    =>ieee80211_tx_skb_tid_band

    =>ieee80211_xmit

    =>ieee80211_tx

    =>ieee80211_tx_frags

    =>drv_tx
```

### 怎样处理接受的数据包？

包的接收过程和发送过程是相反的。此时我们不会区分数据包和管理包。

当一个数据包被WiFi硬件捕获到，硬件会向内核产生一个中断（例如：PCI接口的设备），或者数据包会被轮询（例如：USB接口的设备）。
前一种情况下该中断会调用中断接受处理函数，后一种情况下接受回调处理函数会被调用。

事实证明设备驱动对数据的接收不会做太多的事情除了一些完整性检查和为mac80211模块填充接收描述符，然后将数据包传送到mac80211模块中进一步处理（无论是直接或者更常见的将数据包先放到接受队列中）。

进入mac80211是通过`ieee80211_rx`函数或者它的变种，它会调用mac80211中的某个接收处理函数（参见代码中的`ieee80211_rx_handlers`）。
这个地方也是数据包和管理包分离的地方。

如果接收到的帧是数据包，它会被转换为802.3帧格式（通过`__ieee80211_data_to8023`函数）然后通过`netif_receive_skb`函数传递到网络栈中。
从现在开始，网络协议栈模块会分析和解码协议头。

如果接受到的帧是管理包，它会被`ieee80211_sta_rx_queued_mgmt`函数处理。一些管理帧在mac80211模块中就结束了，另外一些会进一步传递到cfg80211模块然后发送到用户空间的管理工具中去。
例如，认证帧会被`cfg80211_rx_mlme_mgmt`函数处理然后通过 `nl80211_send_rx_auth` 函数发送到用户空间。
而关联响应帧会被`cfg80211_rx_assoc_resp`函数处理然后通过`nl80211_send_rx_assoc`函数发送到用户空间。

### 总结

一个典型的WiFi驱动包含三个任务：配置、发送处理、接受处理。再次使用USB WiFi适配器作为例子，当有设备被识别到，探测函数会被调用。
这通常发生在配置阶段例如注册`ieee80211_ops`结构体的时候：

首先`ieee80211_alloc_hw`函数分配一个`ieee80211_hw`结构体，它代表着WiFi设备。通常下面的这些数据结构会被分配：

* `struct wiphy`：主要用于描述WiFi硬件的参数如MAC地址、接口方式和组合、支持频段和其他硬件性能参数。

* `ieee80211_local`这是驱动可见的部分并且mac80211会大量使用。`ieee80211_ops`的映射会被链接到`ieee80211_local`结构体中（`ieee80211_local`结构体中包含`ieee80211_ops`）。它可以从`ieee80211_hw`中使用`container_of`或者` hw_to_local`API来访问。 

* 设备驱动的私有结构体(`ieee80211_hw`结构体中的`void *priv`域)。如果需要更细致的划分MAC层可以分为上层MAC和下层MAC，上层MAC负责管理方面（例如：探测、认证和关联），

在mac80211其他功能完成之后，通过`ieee80211_register_hw`完成注册硬件。
例如，在STA模式下`wpa_supplicant`会指导设备扫描、认证和关联BSS，然后才可以进行数据通信。

希望在阅读这篇文章后，跟踪源码会变得简单一点。


### 参考

[Linux无线子系统](https://wireless.wiki.kernel.org/en/developers/documentation)


