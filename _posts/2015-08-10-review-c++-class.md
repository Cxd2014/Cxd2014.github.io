---
layout: post
title:  "C++关于类的复习"
date:   2015-08-10 09:06:10
categories: Qt
tags: C++ Class
---

* content
{:toc}

## C++ 类的声明

    class class_name  
    {  
        private:  
            /* 
            *私有的数据和成员函数 
            *只能被本类中的成员函数引用，类外不能调用 
            *友元类例外 
            */  
        public:  
            /* 
            *公共的数据和成员函数 
            *可以被本类中的成员函数引用，也可以被类的作用域内的其他函数引用 
            */  
        protected:  
            /* 
            *受保护的数据和成员函数 
            *不能被类外访问，但可以被派生类的成员函数访问 
            */  
    };  

## 在类外定义成员函数
    void class_name::fanction_name()  
    {  
        //函数体  
    } 


## 定义内置函数
    inline void class_name::fanction_name()  
    {  
        /* 
        - 内置函数在正真执行时，是把函数代码嵌入到程序的调用点 
        - 以减少调用成员函数的时间开销 
        - 内置函数的要求：函数规模很小，调用频率较高 
        */  
    } 


## 定义类的对象

    class_name name_1,name_2;


## 对象成员的引用

##### 通过对象名和成员运算符访问对象中的成员  

    class_name name_1;  
    name_1.fanction_name();  
  
##### 通过指向对象的指针访问对象中的成员 

    class_name name_1,*p; //定义对象 name_1 和 class_name 类的指针变量 p  
    p = &name_1;          //是 p 指向对象 name_1  
    p->fanction_name();  
  
##### 通过对象的引用来访问对象中的成员 

    class_name name_1;  
    class_name & name_2 = name_1; //定义类的引用变量 name_2 并使之初始化为 name_1  
    name_2.fanction_name();         
    /* 
    *name_1 和 name_2 共同占用一段内存 
    *所以 name_2.fanction_name() 就是 name_1.fanction_name() 
    */


## 构造函数

##### 构造函数的简介
1. 构造函数是用来处理对象的初始化；
2. 构造函数的名字必须与类名同名，不能任意命名；  
3. 构造函数不能被用户调用，而是在建立对象时自动执行；  
4. 构造函数不具有任何类型，不返回任何值；  
  
##### 构造函数在类外的定义 

    //先在定义类时的 public 中声明构造函数  
    class_name();  
    //在在类外定义  
    class_name::class_name()  
    {  
        /*如果用户自己没有定义构造函数，则 C++ 系统会自动生成一个构造函数， 
        * 只是这个构造函数的函数体是空的，不执行初始化操作 
        */  
    }  
  
##### 带参数的构造函数  

    class class_name  
    {  
        public:  
            class_name(int,int,int); //声明带参数的构造函数  
        private:  
            int height;  
            int width;  
            int lengh;  
    };  
    //在类外定义带参数的构造函数  
    class_name::class_name(int a,int b,int c)  
    {  
        height = a;  
        width = b;  
        lengh = c;  
    }  
    //定义对象并给三个成员变量赋初值  
    class_name name_1(1,2,3);  
  
##### 构造函数的重载  
在一个类中定义多个构造函数，以便对类的对象提供不同的初始化方法，这些构造函数具有相同的名字，而参数的个数或参数的类型不同编译器根据定义对象时给对象赋值的参数去确定对应的构造函数  

    //在类的定义中声明构造函数  
    class_name(); //声明一个无参数的构造函数  
    //声明一个有参数的构造函数，用参数的初始化表对数据成员初始化  
    class_name(int a,int b,int c):height(a),width(b),lengh(c){}  
    //定义对象  
    class_name::name_1;  //定义对象 name_1 不指定实参，这时调用第一个构造函数  
    class_name::name_2(1,2,3);//定义对象 name_2 指定实参，这时调用第二个构造函数 


## 析构函数
    //析构函数在定义类时的声明  
    ~class_name();  
    //在类外的定义  
    class_name::~class_name()  
    {  
        //析构函数的作用是在撤销对象占用的内存之前完成一些清理工作  
    } 


## this指针
在每一个成员函数中都包含一个特殊的指针 this ，它是指向本类对象的指针；它的值是当前被调用的成员函数所在的对象的起始地址；this 指针是用来区分不同对象的成员函数引用其对应的数据成员


## 派生与继承

##### 派生类的声明

    //声明基类是 class_name 以公用继承方式的派生类 class_name_1
    class class_name : public class_name_1
    {
        private:
            //派生类中新增的成员
        public:
    };

##### 派生类成员的访问属性  
1. 基类成员函数不能访问派生类的成员;  
2. 派生类的成员函数根据继承方式不同而不同：  

* 公用继承  

基类成员 | 派生类中的访问属性
---|---
私有成员 | 不可访问
公用成员 | 公用
保护成员 | 保护
 
* 私有继承  

基类成员 | 派生类中的访问属性  
---|---
私有成员 | 不可访问  
公用成员 | 私有  
保护成员 | 私有  

* 保护继承 
 
基类成员 | 派生类中的访问属性  
---|---
私有成员 | 不可访问  
公用成员 | 保护  
保护成员 | 保护  

## 友元

##### 友元的含义
在一个类中声明一个外部函数或者另一个类的成员函数为友元，则这个函数就可以访问这个类的私有数据


##### 友元的声明
    //在类的定义时声明外部函数 fanction_name 为友元 
    friend void fanction_name(class_name &);  
    //在 class_name 类的定义时声明 class_name_1 的成员函数 fanction_name 为友元  
    friend void class_name_1::fanction_name(class_name &);
