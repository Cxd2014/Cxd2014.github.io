---

layout: post
title:  "头文件中不能定义变量"
date:   2016-05-11 12:20:10
categories: programming
tags: 全局变量 头文件

---

* content
{:toc}

### 头文件中定义全局变量会出现的问题

1. 直接在头文件中定义全局变量，然后有多个文件包含这个头文件时，编译通过不了，提示重复定义变量！

2. 在头文件中定义全局变量时前面加上关键字`static`，此时编译会通过但是此时全局变量的作用域不是我们想要的结果！

测试：

```c
/* 再头文件中定义一个全局变量 */
static int a = 0;

/* 然后在两个包含了此头文件的C文件中分别打印这个变量的地址 */
printf("&a = %x\n", (uint)&a);

```

测试结果你会发现 __两个地址不一样__ ！！原因是它在每个源文件中都有一份这个变量的拷贝，而不是共用一个变量。它的作用域只在一个源文件中，而不是我们想要的跨文件的全局变量。

### 怎样得到真正的全局变量？

1. 在其中一个源文件中定义一个全局变量
2. 在其他源文件中使用 `extern` 声明此变量，就可以使用了
3. 或者在 __头文件__ 中使用 `extern` 声明此变量，然后在需要使用这个变量的源文件中包含此头文件

例如：

```c
/* 在其中一个源文件中定义一个全局变量 */
int a = 0;

/* 在其他源文件或者头文件中使用 `extern` 声明此变量 */
extern int a;

```

### 特别注意 `结构体变量` 

1. 在`GCC`编译环境下，在头文件中直接定义`全局结构体变量`是可以的。编译时不会报错，而且它在所有包含这个头文件的源文件中共用一个变量。

2. 而在windows中的VS编译环境下，不能直接在头文件中定义`全局结构体变量`，会和普通变量一样报错，提示重复定义变量！

```c
/* 在头文件中定义一个全局结构体变量 */
struct test{
    int a;
    char b;
};

struct test test_1;
```


__注：这些结果都是我亲自动手测试过的__

所使用的GCC版本：gcc version 4.8.2

所使用的VS版本：VS2010

__所以建议不要在头文件中定义任何变量__