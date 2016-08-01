---

layout: post
title:  "Linux协议栈--套接字的实现"
date:   2016-07-30 10:20:10
categories: network
tags: TCP/IP socket network

---

* content
{:toc}

### 前言

身在一个网络设备公司怎么能对Linux协议栈不熟悉，我决定写一系列博文把Linux协议栈的整个数据流程搞清楚。


### 套接字简介

套接字是Linux协议栈中传输层协议的接口，也是传输层以上所有协议的实现。同时套接字接口在网络程序功能中是内核与应用层之间的接口。
它有三个基本功能：传输数据、为TCP管理连接、控制或调节TCP/IP协议栈的操作。
Linux套接字总共有`19`个API函数接口，这些函数的索引号定义在`include\linux\net.h`文件中。

```c
#define SYS_SOCKET	1		/* sys_socket(2)		*/
#define SYS_BIND	2		/* sys_bind(2)			*/
#define SYS_CONNECT	3		/* sys_connect(2)		*/
#define SYS_LISTEN	4		/* sys_listen(2)		*/
#define SYS_ACCEPT	5		/* sys_accept(2)		*/
#define SYS_GETSOCKNAME	6		/* sys_getsockname(2)		*/
#define SYS_GETPEERNAME	7		/* sys_getpeername(2)		*/
#define SYS_SOCKETPAIR	8		/* sys_socketpair(2)		*/
#define SYS_SEND	9		/* sys_send(2)			*/
#define SYS_RECV	10		/* sys_recv(2)			*/
#define SYS_SENDTO	11		/* sys_sendto(2)		*/
#define SYS_RECVFROM	12		/* sys_recvfrom(2)		*/
#define SYS_SHUTDOWN	13		/* sys_shutdown(2)		*/
#define SYS_SETSOCKOPT	14		/* sys_setsockopt(2)		*/
#define SYS_GETSOCKOPT	15		/* sys_getsockopt(2)		*/
#define SYS_SENDMSG	16		/* sys_sendmsg(2)		*/
#define SYS_RECVMSG	17		/* sys_recvmsg(2)		*/
#define SYS_ACCEPT4	18		/* sys_accept4(2)		*/
#define SYS_RECVMMSG	19		/* sys_recvmmsg(2)		*/

```

### 套接字API系统调用的实现

在Linux内核中只有一个系统调用`sys_socketcall`完成用户程序对所有套接字操作的调用，它以套接字API函数的索引号来选择需要调用的实际函数。
`sys_socketcall`函数首先检查函数调用索引号是否正确，其后调用`copy_from_user`函数将用户地址空间参数复制到内核地址空间。最后`switch`
语句根据索引号实现套接字分路器的功能。`sys_socketcall`函数代码在`net\socket.c`文件中。

```c
SYSCALL_DEFINE2(socketcall, int, call, unsigned long __user *, args)
{
    ···

    /* 检查函数调用索引号是否正确 */
	if (call < 1 || call > SYS_RECVMMSG)
		return -EINVAL;

	/* 将用户地址空间参数复制到内核地址空间 */
	if (copy_from_user(a, args, len))
		return -EFAULT;

    /* switch 语句根据索引号实现套接字分路器 */
	switch (call) {
	case SYS_SOCKET:
		err = sys_socket(a0, a1, a[2]);
		break;
	case SYS_BIND:
		err = sys_bind(a0, (struct sockaddr __user *)a1, a[2]);
		break;
	case SYS_CONNECT:
		err = sys_connect(a0, (struct sockaddr __user *)a1, a[2]);
		break;
	case SYS_LISTEN:
		err = sys_listen(a0, a1);
		break;

        ···
    }
}

```

### 套接字的创建

当用户调用`socket `函数时`sys_socketcall`分路器会将调用传送到`sys_socket`函数，此函数再调用`sock_create`函数完成通用套接字的创建、初始化任务；
然后在调用特定协议族的套接字创建函数。例如`AF_INET`协议族的`inet_create`函数完成套接字与特定协议的关联工作。
`sock_create`函数会直接调用`__sock_create`函数：

```c
static int __sock_create(struct net *net, int family, int type, int protocol,
			 struct socket **res, int kern)
{
	···

	/* 查看指定的协议族是否在Linux所支持的范围内 */
	if (family < 0 || family >= NPROTO)
		return -EAFNOSUPPORT;
	if (type < 0 || type >= SOCK_MAX)
		return -EINVAL;

	···

	/* 为新套接字分配内存空间，返回指向新套接字结构的指针 */
	sock = sock_alloc();
	
	/* 
	 * 根据参数 family 返回指定协议族的指针
	 * net_families是一个全局数组，定义在 net/socket.c 文件中。
	 * 它存放了所有协议族特定的套接字创建函数（Linux支持多个协议族）
	 */
	pf = rcu_dereference(net_families[family]);

	/* 调用特定协议族的套接字创建函数 */
	err = pf->create(net, sock, protocol, kern);

	···
}

```

#### AF_INET套接字的创建

每个程序使用的套接字都有一个`struct socket`数据结构与`struct sock`数据结构的实例。
Linux内核在套接字层定义了包含套接字通用属性的数据结构`struct socket`与`struct sock`，他们独立于具体协议；
具体的协议族与协议实例继承通用套接字的属性，加入协议相关属性，形成管理协议本身套接字的结构。
在TCP/IP协议栈中，`AF_INET`协议族套接字的创建由`inet_create`函数实现。该函数定义在`net/ipv4/af_inet.c`文件中。

```c
static int inet_create(struct net *net, struct socket *sock, int protocol,
		       int kern)
{
	···

	/* 
	 * 查询协议交换表inetsw，根据协议族套接字创建类型 sock->type 获取要创建的协议实例。
	 * 如果是TCP协议，sock->type为SOCK_STREAM；
	 */
lookup_protocol:
	err = -ESOCKTNOSUPPORT;
	rcu_read_lock();
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

	/* 检查用户进程是否有权限创建该类型的套接字 */
	if (sock->type == SOCK_RAW && !kern && !capable(CAP_NET_RAW))
		goto out_rcu_unlock;

	/* 分配一个新的 struct sock *sk 数据结构 */
	sk = sk_alloc(net, PF_INET, GFP_KERNEL, answer_prot);
	if (sk == NULL)
		goto out;

	/* AF_INET支持两个协议IPv4和IPv6，由inet_sk确定 */
	inet = inet_sk(sk);
	inet->is_icsk = (INET_PROTOSW_ICSK & answer_flags) != 0;
}
```

### 其他套接字函数的函数调用链

为了说明套接字函数的调用链，这里以应用层API`send`函数为例来说明整个过程，
当调用`send`函数时，内核通过`sys_socketcall`套接字分路器将`send`函数调用翻译为`sys_sendto`，
`sys_sendto`会调用`sock_sendmsg`函数，`sock_sendmsg`函数又会调用`__sock_sendmsg`函数，最后调用由`struct socket`数据结构中`struct proto_ops *ops`数据域引用的协议实现函数`sendmsg`；
在TCP/IP协议中最终会调用`inet_sendmsg`函数实现数据发送。

在TCP/IP协议中所有的套接字API都最终会调用到下面对应的函数中（`\net\ipv4\af_inet.c`）：

* TCP协议对应的函数

```c
const struct proto_ops inet_stream_ops = {
	.family		   = PF_INET,
	.owner		   = THIS_MODULE,
	.release	   = inet_release,
	.bind		   = inet_bind,
	.connect	   = inet_stream_connect,
	.socketpair	   = sock_no_socketpair,
	.accept		   = inet_accept,
	.getname	   = inet_getname,
	.poll		   = tcp_poll,
	.ioctl		   = inet_ioctl,
	.listen		   = inet_listen,
	.shutdown	   = inet_shutdown,
	.setsockopt	   = sock_common_setsockopt,
	.getsockopt	   = sock_common_getsockopt,
	.sendmsg	   = inet_sendmsg,
	.recvmsg	   = inet_recvmsg,
	.mmap		   = sock_no_mmap,
	.sendpage	   = inet_sendpage,
	.splice_read	   = tcp_splice_read,
#ifdef CONFIG_COMPAT
	.compat_setsockopt = compat_sock_common_setsockopt,
	.compat_getsockopt = compat_sock_common_getsockopt,
#endif
};
EXPORT_SYMBOL(inet_stream_ops);
```

* UDP协议对应的函数

```c
const struct proto_ops inet_dgram_ops = {
	.family		   = PF_INET,
	.owner		   = THIS_MODULE,
	.release	   = inet_release,
	.bind		   = inet_bind,
	.connect	   = inet_dgram_connect,
	.socketpair	   = sock_no_socketpair,
	.accept		   = sock_no_accept,
	.getname	   = inet_getname,
	.poll		   = udp_poll,
	.ioctl		   = inet_ioctl,
	.listen		   = sock_no_listen,
	.shutdown	   = inet_shutdown,
	.setsockopt	   = sock_common_setsockopt,
	.getsockopt	   = sock_common_getsockopt,
	.sendmsg	   = inet_sendmsg,
	.recvmsg	   = inet_recvmsg,
	.mmap		   = sock_no_mmap,
	.sendpage	   = inet_sendpage,
#ifdef CONFIG_COMPAT
	.compat_setsockopt = compat_sock_common_setsockopt,
	.compat_getsockopt = compat_sock_common_getsockopt,
#endif
};
EXPORT_SYMBOL(inet_dgram_ops);
```

### 参考

《嵌入式Linux网络体系结构设计与TCP/IP协议栈》