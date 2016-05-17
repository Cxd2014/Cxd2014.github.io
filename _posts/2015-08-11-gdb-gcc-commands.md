---
layout: post
title:  "GDB GCC常用命令"
date:   2015-08-11 12:40:10
categories: others
tags: GDB命令 GCC命令选项
---

* content
{:toc}


## GDB调试器

命令|解释
---|---
gdb program           |进入调试模式
list file.c:fanction  |显示file.c文件中的fanction函数
break file.c:fanction |在file.c文件中的fanction函数处打一个断点
break file.c:100      |在file.c文件中的第100行打一个断点
info break            |查看所有断点
delete num            |删除断点号为 num 的断点
run                   |开始运行程序
bt                    |显示程序的栈
watch expr            |监视 expr变量，（每次运行到变量会打印变量的值）（watch不能简写）
print expr            |打印 expr 变量的值，(当前运行函数中的变量)
c                     |继续运行程序
next                  |单步运行，跳过函数调用
step                  |但不运行，进入函数调用
help name             |查看name命令的帮助信息
quit                  |退出调试

* 注
1. 需要调试的程序在编译的时候要加 -g 选项，程序才能进行调试
2. 以上所有命令都可以简写首字母，例：`info break` ==> `i b` 除特殊声明外
3. gdb --args app args 传递参数给调试程序。app是需要调试的程序 args为传递的参数，可以有多个参数  

---


---

## GCC编译器

命令|解释
---|---
gcc hello.c -o hello                  |将hello.c编译成hello可执行文件
gcc -E hello.c -o hello.i             |将hello.c 转换成预处理后的文件hello.i
gcc -S hello.c -o hello.S             |将hello.c 转换成汇编文件 hello.S
gcc -c hello.c -o hello.o             |将hello.c 转换成二进制文件 hello.o
gcc -I dir hello.c -o hello           |-I后面加路径，指定在dir路径下寻找头文件
gcc -Wall hello.c -o hello            |显示编译过程中所有的警告信息
gcc -g hello.c -o hello               |带调试信息的程序，可以用GDB进行调试
gcc -v hello.c -o hello               |显示执行编译阶段的命令,编译器驱动程序,预处理器,编译器的版本号
gcc -nostdinc -I dir hello.c -o hello |不要在标准系统目录中寻找头文件只搜索-I选项指定的目录(以及当前目录)



#### 编译静态链接库

```shell
     gcc -c hello.c -o hello.o                        #先生成目标文件 .o 
     ar crv hello.a hello.o                           #打包为 .a 的静态链接库文件
     gcc cxd.c -o cxd -L /root/desktop/hello.a        #调用自己的静态链接库
```

#### 编译动态链接库

```shell
    gcc -fPIC -c hello.c                             #编译成位置无关的 .o 文件
    gcc -shared hello.o -o hello.so                  #生成动态链接库
    gcc cxd.c -o cxd -L /root/desktop/hello.so       #调用自己的动态链接库
```
#### 查看程序需要哪些链接库

    ldd application_name

---
