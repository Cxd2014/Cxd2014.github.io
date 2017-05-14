---
layout: post
title:  "GDB调试core dump文件"
date:   2017-04-15 10:20:10
categories: others
tags: gdb core dump
---

* content
{:toc}

### 查看系统是否可以产生core dump文件

在Ubuntu中执行`ulimit -a`命令，查看`core file size`的值，如果为`0`说明系统默认不会产生core文件,需要执行`ulimit -c 1024`指定core文件的大小。系统生成的core文件一般存放在程序当前执行的目录下。如图：

![core-dump-1]({{"/css/coredump/core-dump-1.jpg"}})  

### 测试程序

```c
#include<stdio.h>
#include<string.h>

void test_3()
{
	char *p = NULL;
	char *str = "hello word!";	
	printf("%s\n",str);

    /* 这里调用strcpy函数时传递了一个空指针，会导致段错误并产生core文件 */
	strcpy(p,str);
}

void test_2()
{
	test_3();
}

void test_1()
{
	test_2();
}

int main()
{
	test_1();
	return 0;
}
```

### GDB调试

* 执行如下命令启动gdb进行调试：`gdb -c path/to/the/corefile path/to/the/binary`

* 执行`bt`或者`where`命令查看程序的堆栈信息，可以看到函数调用链；

* 执行`frame 1`指定`test_3()`这个栈帧；

* 执行`info locals`查看当前栈帧中函数的局部变量，如图：

	![core-dump-2]({{"/css/coredump/core-dump-2.jpg"}})  

注：如果源文件也在当前目录下还可以查看函数的代码，如图：

![core-dump-3]({{"/css/coredump/core-dump-3.jpg"}})  
