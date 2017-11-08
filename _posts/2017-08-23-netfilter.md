---
layout: post
title:  " Linux协议栈--Netfilter源码分析"
date:   2017-08-23 10:10:10
categories: network
tags: Linux kernel Netfilter 
---

* content
{:toc}

### netfilter钩子的注册

netfilter框架提供了两个接口用于外部模块注册钩子函数：`nf_register_hook`和`nf_register_hooks`后者可以同时注册多个钩子函数，两个函数都在`/net/netfilter/core.c`文件中实现。`nf_register_hook`函数加锁后调用`_nf_register_hook`函数，在此函数中遍历网络命名空间链表`net_namespace_list`，然后调用`nf_register_net_hook`函数完成实际的注册任务，最终结果是钩子函数会在每个网络命名空间中都注册一遍。关于网络命名空间这个概念可以参考这篇博文[Linux Network Namespaces](http://www.opencloudblog.com/?p=42)。所有钩子函数在内核中的组织方式如下图所示：   
![netfilter]({{"/css/pics/netfilter.jpg"}})   

按照上面的图来分析一下`nf_register_net_hook`函数注册钩子的具体实现过程，首先调用`nf_hook_entry_head`函数根据网络类型和挂载点在网络命名空间的`hooks`二维数组中找到`nf_hook_entry`链表。然后初始化一个新的节点，根据优先级将新的节点插入到链表中的对应位置。   
```c
int nf_register_net_hook(struct net *net, const struct nf_hook_ops *reg)
{
	struct nf_hook_entry __rcu **pp;
	struct nf_hook_entry *entry, *p;

	if (reg->pf == NFPROTO_NETDEV) {
#ifndef CONFIG_NETFILTER_INGRESS
		if (reg->hooknum == NF_NETDEV_INGRESS)
			return -EOPNOTSUPP;
#endif
		if (reg->hooknum != NF_NETDEV_INGRESS ||
		    !reg->dev || dev_net(reg->dev) != net)
			return -EINVAL;
	}

	/* 查找hooks二维数组中对应的nf_hook_entry链表 */
	pp = nf_hook_entry_head(net, reg);
	if (!pp)
		return -EINVAL;

	/* 分配一个新的 nf_hook_entry 节点并初始化 */
	entry = kmalloc(sizeof(*entry), GFP_KERNEL);
	if (!entry)
		return -ENOMEM;

	nf_hook_entry_init(entry, reg);

	mutex_lock(&nf_hook_mutex);

	/* Find the spot in the list */
	/* 在nf_hook_entry链表中按照优先级顺序，查找新增节点应该放置的位置 */
	for (; (p = nf_entry_dereference(*pp)) != NULL; pp = &p->next) {
		if (reg->priority < nf_hook_entry_priority(p))
			break;
	}
	/* 将新的 nf_hook_entry 节点插入到链表中的指定位置 */
	rcu_assign_pointer(entry->next, p);
	rcu_assign_pointer(*pp, entry);

	mutex_unlock(&nf_hook_mutex);
#ifdef CONFIG_NETFILTER_INGRESS
	if (reg->pf == NFPROTO_NETDEV && reg->hooknum == NF_NETDEV_INGRESS)
		net_inc_ingress_queue();
#endif
#ifdef HAVE_JUMP_LABEL
	static_key_slow_inc(&nf_hooks_needed[reg->pf][reg->hooknum]);
#endif
	return 0;
}
```

### 钩子函数的执行

在内核网络协议栈中经常会看到下面这种代码，这就是内核在协议栈中安装的钩子，协议栈中的数据包通过这些钩子进入到Netfilter架构中，然后Netfilter架构调用挂载在此钩子上的处理函数对数据包进行处理。
```c
return NF_HOOK(NFPROTO_IPV4, NF_INET_FORWARD,
		       net, NULL, skb, skb->dev, rt->dst.dev,
		       ip_forward_finish);
```

当在协议栈中调用`NF_HOOK`这个内联函数时，最终会在`/include/linux/netfilter.h`文件中的`nf_hook`函数中完成实际操作。此函数首先通过协议类型和挂载点找到对应的`nf_hook_entry`链表，然后调用`nf_hook_slow`函数依次调用此链表中的钩子函数：   
```c
static inline int nf_hook(u_int8_t pf, unsigned int hook, struct net *net,
			  struct sock *sk, struct sk_buff *skb,
			  struct net_device *indev, struct net_device *outdev,
			  int (*okfn)(struct net *, struct sock *, struct sk_buff *))
{
	struct nf_hook_entry *hook_head;
	int ret = 1;

#ifdef HAVE_JUMP_LABEL
	if (__builtin_constant_p(pf) &&
	    __builtin_constant_p(hook) &&
	    !static_key_false(&nf_hooks_needed[pf][hook]))
		return 1;
#endif

	/* 加锁 */
	rcu_read_lock();
	/* 通过协议号 pf 和挂载点 hook 在二维数组中获取 nf_hook_entry 链表 */
	hook_head = rcu_dereference(net->nf.hooks[pf][hook]);
	if (hook_head) {
		struct nf_hook_state state;

		nf_hook_state_init(&state, hook, pf, indev, outdev,
				   sk, net, okfn);

		/* 在此函数中调用实际的钩子函数 */
		ret = nf_hook_slow(skb, &state, hook_head);
	}
	rcu_read_unlock();

	return ret;
}
```

`nf_hook_slow`函数会遍历整个链表，然后依次调用节点上的钩子函数，判断钩子函数的返回值，如果钩子函数返回`NF_ACCEPT`则继续遍历下一个节点；如果返回`NF_DROP`则释放数据包内存结束遍历直接返回；如果返回`NF_QUEUE`则将数据包加入到缓存队列中，结束遍历直接返回；其他返回值不做任何处理（例如`NF_STOLEN`）结束遍历直接返回。   
```c
int nf_hook_slow(struct sk_buff *skb, struct nf_hook_state *state,
		 struct nf_hook_entry *entry)
{
	unsigned int verdict;
	int ret;

	/* 使用do while循环遍历链表 */
	do {
		/* 调用节点中的钩子函数 */
		verdict = nf_hook_entry_hookfn(entry, skb, state);
		/* 判断钩子函数的返回值 */
		switch (verdict & NF_VERDICT_MASK) {
		/* 继续遍历下一个节点 */
		case NF_ACCEPT: 
			entry = rcu_dereference(entry->next);
			break;
		/* 丢弃数据包，直接返回 */
		case NF_DROP:
			kfree_skb(skb);
			ret = NF_DROP_GETERR(verdict);
			if (ret == 0)
				ret = -EPERM;
			return ret;
		/* 将数据包入队，直接返回 */
		case NF_QUEUE:
			ret = nf_queue(skb, state, &entry, verdict);
			if (ret == 1 && entry)
				continue;
			return ret;
		default:
			/* Implicit handling for NF_STOLEN, as well as any other
			 * non conventional verdicts.
			 */
			return 0;
		}
	} while (entry);

	return 1;
}
```

### 参考

[Linux Network Namespaces](http://www.opencloudblog.com/?p=42)   
基于Linux-4.12.1内核源码分析
