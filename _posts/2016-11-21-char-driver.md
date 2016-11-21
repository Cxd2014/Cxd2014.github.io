---
layout: post
title:  "Linux中的字符设备驱动程序"
date:   2016-11-21 10:20:10
categories: linux
tags: linux char driver
---

* content
{:toc}

### 字符设备驱动简介

在Linux内核中使用`设备号`和`struct cdev`结构体来表示一个字符设备。一个`struct cdev`结构体在内核中就代表
一个字符设备，它的定义如下(include/linux/cdev.h)：

```c
struct cdev {
	struct kobject kobj;
	struct module *owner;
	const struct file_operations *ops;
	struct list_head list;
	dev_t dev;
	unsigned int count;
};
```

设备号又分为主设备号和次设备号：

* 主设备号用于区分不同的字符设备驱动程序
* 次设备号用于区分不同的实体设备（一个驱动程序可以驱动多个实体设备）

### 设备号的构成与分配

Linux用一个32为的无符号整数来表示设备号，该整数的低20位用于表示次设备号，高12位用来表示主设备号。
内核中使用一个全局数组`chrdevs[CHRDEV_MAJOR_HASH_SIZE]`来分配和管理所有设备号，它的定义如下(fs/char_dev.c)：

```c
static struct char_device_struct {
	struct char_device_struct *next;
	unsigned int major;
	unsigned int baseminor;
	int minorct;
	char name[64];
	struct cdev *cdev;		/* will die */
} *chrdevs[CHRDEV_MAJOR_HASH_SIZE];
```

内核调用`register_chrdev_region`函数来将分配到的设备号加入到`chrdevs`数组中，为防止别的驱动程序也使用这个设备号。
如果此设备号已经被其他驱动程序使用了，则这个函数调用将不会成功。

![bridge_1]({{"/css/pics/char-driver-1.jpg"}})
![bridge_1]({{"/css/pics/char-driver-2.jpg"}})

### 字符设备的注册

和设备号一样内核内核也使用了一个全局数组`struct kobj_map *cdev_map`来管理所有字符设备，它的定义如下(drivers/base/map.c)：

```c
struct kobj_map {
	struct probe {
		struct probe *next;
		dev_t dev;
		unsigned long range;
		struct module *owner;
		kobj_probe_t *get;
		int (*lock)(dev_t, void *);
		void *data;
	} *probes[255];
	struct mutex *lock;
};
```
设备驱动程序通过调用`cdev_add`把它所管理的设备对象的指针嵌入到一个类型为`struct probe`的节点中，然后再把该节点加入到`cdev_map`所实现的哈希链表中。
我们在编写驱动的时候通常调用`register_chrdev`函数来注册字符设备驱动，该函数是`__register_chrdev`的包装函数。
在`__register_chrdev`函数中调用`__register_chrdev_region`函数来分配和注册设备号，
然后调用`cdev_add`函数将字符设备对象`struct cdev`加入到全局数组`cdev_map`中去。

设备号的分配与注册任务主要是在`__register_chrdev_region`函数中完成，如果传入的主设备号参数`major`为0，
则此函数自动分配一个主设备号给驱动程序，如果`major`不为0，则直接将此设备号加入到全局数组`chrdevs`中去。

`cdev_add`函数通过调用`kobj_map`函数来完成字符设备的注册，在`kobj_map`函数中首先分配一个`struct probe`结构体，
然后初始化此结构体的各个数据域，最后将结构体加入到`cdev_map`全局数组中。

![bridge_1]({{"/css/pics/char-driver-3.jpg"}})

```c
int __register_chrdev(unsigned int major, unsigned int baseminor,
		      unsigned int count, const char *name,
		      const struct file_operations *fops)
{
	struct char_device_struct *cd;
	struct cdev *cdev;
	int err = -ENOMEM;

	/* 注册分配设备号 */
	cd = __register_chrdev_region(major, baseminor, count, name);
	if (IS_ERR(cd))
		return PTR_ERR(cd);
	
	/* 分配一个 struct cdev 结构体 */
	cdev = cdev_alloc();
	if (!cdev)
		goto out2;

	cdev->owner = fops->owner;
	cdev->ops = fops;
	kobject_set_name(&cdev->kobj, "%s", name);
	
	/* 将 cdev 结构体注册到 cdev_map 中去 */
	err = cdev_add(cdev, MKDEV(cd->major, baseminor), count);
	if (err)
		goto out;

	cd->cdev = cdev;

	return major ? 0 : cd->major;
out:
	kobject_put(&cdev->kobj);
out2:
	kfree(__unregister_chrdev_region(cd->major, baseminor, count));
	return err;
}
```

### 参考

《深入Linux设备驱动程序内核机制》
