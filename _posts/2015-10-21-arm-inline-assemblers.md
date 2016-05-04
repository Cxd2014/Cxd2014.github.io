---
layout: post
title:  "ARM内联汇编"
date:   2015-10-22 09:16:10
categories: arm
tags: arm 汇编
---

* content
{:toc}



### 使用内联汇编
C和C++中内置汇编程序可以让你访问到目标处理器中那些不能直接用C访问的特性。   

内联汇编和C或者C++可以非常灵活的交互使用，任何寄存器操作数可以是任意的C或C++表达式。内联汇编还可以扩展复杂指令和优化汇编代码。   

__注：这种内联汇编语法只适用于ARM的编译器，所以在Linux内核中看到的内联汇编语法不一样，那是GCC编译器支持的内联汇编语法。__   

内联汇编使用例子：

	#include <stdio.h>
	void my_strcpy(const char *src, char *dst)
	{
		int ch;
		__asm
		{
			loop:
		#ifndef __thumb
			//ARM version
			LDRB ch, [src], #1
			STRB ch, [dst], #1
		#else
			//Thumb version
			LDRB ch, [src]
			ADD src, #1
			STRB ch, [dst]
			ADD dst, #1
		#endif
			CMP ch, #0
			BNE loop
		}
	}
	int main(void)
	{
		const char *a = "Hello world!";
		char b[20];
		my_strcpy (a, b);
		printf("Original string: '%s'\n", a);
		printf("Copied string: '%s'\n", b);
		return 0;
	}

### 使用内联汇编需要遵守下面几点

1. 在汇编语言中逗号用来隔开指令，所以C表达式的逗号操作符必须用括号括起来以区分他们：

		__asm {ADD x,y (f(),z)}

2. 如果要用物理寄存器，必须确保编译器在编译时没有覆盖该寄存器，例如：
		
		__asm
		{
			MOV r0, x
			ADD y, r0, x / y //(x / y) 覆盖了r0的值
		}

	r0的原始值丢失，但是我们可以使用C语言变量来代替r0寄存器，例如：

		__asm
		{
			mov var,x
			add y, var, x / y
		}
	
3. 不要用物理寄存器寻址变量，即使这个变量非常明显的映射一个物理寄存器中，如果编译器检测到这种情况他会产生错误信息或者将这个变量发到其他寄存器中以避免冲突：
	
		int bad_f(int x) //x 在 r0 中
		{
			__asm
			{
				ADD r0, r0, #1 //错误的认为 x 始终在 r0 中
			}
			return x; //x 在 r0 中
		}
	
	这段代码不会改变变量x的值，编译器会认为r0和x是两个不同的变量。正确的写法是：
		
		ADD x, x, #1

	不要保存和恢复内联汇编使用过的物理寄存器。编译器会为你做这些事情。除了CPSR和SPSR寄存器之外在读寄存器之前没有写入数据，会发出一个错误信息。例如：

		int f(int x)
		{
			__asm
			{
				STMFD sp!, {r0} // save r0 - illegal: read before write
				ADD r0, x, 1
				EOR x, r0, x
				LDMFD sp!, {r0} // restore r0 - not needed.
			}
			return x;
		}

4. 利用内联汇编使能和失能中断的示例程序：

		__inline void enable_IRQ(void)
		{
			int tmp;
			__asm
			{
				MRS tmp, CPSR
				BIC tmp, tmp, #0x80
				MSR CPSR_c, tmp
			}
		}
		__inline void disable_IRQ(void)
		{
			int tmp;
			__asm
			{
				MRS tmp, CPSR
				ORR tmp, tmp, #0x80
				MSR CPSR_c, tmp
			}
		}
		int main(void)
		{
			disable_IRQ();
			enable_IRQ();
		}

### ARM体系中函数参数传递机制

可变参数（如：printf函数的参数不固定）和不可变参数的传递规则是不一样的   

#### 不可变参数的传递规则
1. 前四个整型参数按顺序分配到r0-r3寄存器中
2. 剩余的参数按顺序压入堆栈中   
	注：访问堆栈会增大代码量和影响运行速度，所以尽量让函数参数少于5个。

3. 一个整型参数长于32位，例如 long long类型的参数，可能一半分配到寄存器中，一半分配到堆栈中。
在这种情况下分配到栈中的那一部分会在任何浮点数之前分配，即使不符合参数列表的顺序。

4. 分配浮点数据，如果你的系统有支持浮点的硬件，浮点参数会被分配到浮点寄存器中

#### 可变参数传递规则

使用参数的顺序就好像这些参数储存在连续的内存中然后转移到:

1. r0-r3,r0 最先

2. 堆栈中，低地址最先(这意味着他们按相反的顺序压入栈中)


#### 函数值返回规则

* 一个字的整型数据放在r0中

* 2-4个字的整型数据放在r0-r1,r0-r2或者r0-r3中

* 浮点数放在f0, d0, 或者 s0中

* 更长的数据必须在内存中通过地址间接返回

翻译自《ARM Developer Suite》第四章
