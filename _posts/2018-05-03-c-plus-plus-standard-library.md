---
layout: post
title:  "C++11语言学习"
date:   2018-03-07 10:20:10
categories: life
tags: life
---

* content
{:toc}

### C++11语言新特性

#### 使用auto自动推导类型

C++11允许你申明一个变量或对象而不需要指明其类型，只需要使用`auto`关键字进行申明，这样就可以摆脱超长的永远记不住的类型申明；   
注意：以`auto`声明的变量，其类型是根据其初值在编译期被自动推导出来的，因此必须要有初始化操作，不然会报错：
```c
auto i = 42; // i has type int
double f();
auto d = f(); // d has type double

vector<string> v;
auto pos = v.begin(); // pos has type vector<string>::iterator

auto i; // ERROR: can’t dedulce the type of i
```

#### Range-Based for 循环

C++11引入了一种崭新的`for`循环形式，可以逐一迭代某个给定的区间、数组、集合内的每一个元素。其语法如下：   
其中`decl`是给定`coll`集合中的每个元素的声明；针对这些元素，给定的`statement`会被执行。
```c
for ( decl : coll ) {
    statement
}
```
为了避免调用每个元素的copy构造函数和析构函数，通常应该申明当前元素为一个`const reference`，
不然for循环中的语句会作用在元素的一份`local copy`上，对集合内的元素没有产生影响（但是有时候需要这样做）：
```c
std::vector<double> vec;
for ( auto& elem : vec ) {
    elem *= 3;
}
```

#### Lambda

所谓`lambda`是一份功能定义式，可被定义于语句或表达式内部。因此`lambda`可以当作inline函数使用。
最小型的`lambda`函数申明，可以直接调用他，或者赋值给一个对像然后在被调用：
```c
// 申明
[] {
    std::cout << "hello lambda" << std::endl;
}

//直接调用
[] {
    std::cout << "hello lambda" << std::endl;
} (); // prints "hello lambda"

//赋值给一个对像然后在调用
auto l = [] {
    std::cout << "hello lambda" << std::endl;
};
l(); // prints "hello lambda"
```
`lambda`可以拥有参数指明于小括号内和一般函数一样，也可以有返回值，可以不用指明返回值类型，该类型会根据返回值被推导出来，
也可以使用下面的形式指定返回值：
```c
// 指定返回值为 double 类型
[] () -> double {
    return 42;
}

// 参数传递
auto l = [] (const std::string& s) {
    std::cout << s << std::endl;
};
l("hello lambda"); // prints "hello lambda"
```
在`lambda introducer`（方括号中）内，你可以指明一个`capture`用来处理外部作用域内未被传递为实参的数据：   
* [=] 意味着外部作用域以by value的方式传递给lambda。因此当这个lambda被定义时，你可以读取它，但是不能改动它。
* [&] 意味着外部作用域以by reference方式传递给lambda。因此当这个lambda被定义时，你可以对这个数据进行修改。

```c
int x=0;
int y=42;
auto qqq = [x, &y] {
    std::cout << "x: " << x << std::endl;
    std::cout << "y: " << y << std::endl;
    ++y; // OK
};
x = y = 77;
qqq();
qqq();
std::cout << "final y: " << y << std::endl;

// 输出如下：
x: 0
y: 77
x: 0
y: 78
final y: 79
```
由于x是因by value而获得一份拷贝，在此lambda内部不能改动它，调用++x是通不过编译的。
y是以by reference方式传递，所以可以修改它，并且其值的变化会影响外部。

### 智能指针

#### Class shared_ptr

`Class shared_ptr`实现共享式拥有概念。多个指针可以指向同一个对象，对象的最末一个拥有者有责任销毁对象，并清理于该对象相关的所有资源。
```c
// util/sharedptr1.cpp
#include <iostream>
#include <string>
#include <vector>
#include <memory>
using namespace std;
int main()
{
    // two shared pointers representing two persons by their name
    shared_ptr<string> pNico = make_shared<string>("nico");
    shared_ptr<string> pJutta = make_shared<string>("jutta");

    // capitalize person names
    (*pNico)[0] = 'N';
    pJutta->replace(0,1,"J");

    // put them multiple times in a container
    vector<shared_ptr<string>> whoMadeCoffee;
    whoMadeCoffee.push_back(pJutta);
    whoMadeCoffee.push_back(pJutta);
    whoMadeCoffee.push_back(pNico);
    whoMadeCoffee.push_back(pJutta);
    whoMadeCoffee.push_back(pNico);

    // print all elements
    for (auto ptr : whoMadeCoffee) {
        cout << *ptr << " ";
    }
    cout << endl;

    // overwrite a name again
    *pNico = "Nicolai";

    // print all elements again
    for (auto ptr : whoMadeCoffee) {
        cout << *ptr << " ";
    }
    cout << endl;

    // print some internal data
    cout << "use_count: " << whoMadeCoffee[0].use_count() << endl;
}

// 输出结果
Jutta Jutta Nico Jutta Nico
Jutta Jutta Nicolai Jutta Nicolai
use_count: 4
```

#### Class unique_ptr 

`Class unique_ptr`实现独占式拥有或严格拥有概念，保证同一时间只有一个指针可以指向该对象。一旦拥有者被销毁或变成empty，或开始拥有另一个对象，先前拥有的那个对象就会被销毁，其任何相应资源也会被释放。
```c
// create and initialize (pointer to) string:
std::unique_ptr<std::string> up(new std::string("nico"));

(*up)[0] = 'N'; // replace first character

up->append("lai"); // append some characters

std::cout << *up << std::endl; // print whole string

// 转移 unique_ptr 的拥有权
std::unique_ptr<ClassA> up1(new ClassA);
std::unique_ptr<ClassA> up2; // create another unique_ptr

up2 = up1; // ERROR: not possible

up2 = std::move(up1); // assign the unique_ptr

```

#### Class weak_ptr

`Class weak_ptr`用于解决循环引用问题，如果两个对象使用`shared_ptr`相互指向对方，而一旦不存在其他reference指向他们时，需要释放他们和其相应资源，这种情况下`shared_ptr`不会释放数据，因为每个对象的`use_count()`仍是1。

### 拷贝构造函数

当用一个已初始化过了的自定义类类型对象去初始化另一个新构造的对象的时候，拷贝构造函数就会被自动调用。也就是说，当类的对象需要拷贝时，拷贝构造函数将会被调用。
以下情况都会调用拷贝构造函数：

* 一个对象以值传递的方式传入函数体 
* 一个对象以值传递的方式从函数返回 
* 一个对象需要通过另外一个对象进行初始化。

如果在类中没有显式地声明一个拷贝构造函数，那么，编译器将会自动生成一个默认的拷贝构造函数，该构造函数完成对象之间的位拷贝。位拷贝又称浅拷贝。   

#### 浅拷贝和深拷贝：    
在某些状况下，类内成员变量需要动态开辟堆内存，如果实行位拷贝，也就是把对象里的值完全复制给另一个对象，如A=B。这时，如果B中有一个成员变量指针已经申请了内存，那A中的那个成员变量也指向同一块内存。这就出现了问题：当B把内存释放了（如：析构），这时A内的指针就是野指针了，出现运行错误。   
深拷贝和浅拷贝可以简单理解为：如果一个类拥有资源，当这个类的对象发生复制过程的时候，资源重新分配，这个过程就是深拷贝，反之，没有重新分配资源，就是浅拷贝。

### 参考

本文主要是阅读《C++标准库第2版》的读书笔记。   
[C++拷贝构造函数(深拷贝，浅拷贝)](https://www.cnblogs.com/BlueTzar/articles/1223313.html)
