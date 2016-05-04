---

layout: post
title:  "GCC常见属性"
date:   2015-10-05 20:40:10
categories: others
tags:  GCC属性

---

* content
{:toc}



#### 属性介绍
GCC允许声明函数、变量和类型的特殊属性，以便指示编译器进行特定方面的优化和更仔细的代码检查。在Linux内核经常见到这种用法！使用方法是在声明后面加上如下代码：

    __attribute__ ((ATTRIBUTE)) //ATTRIBUTE是属性的说明，多个属性之间用逗号隔开



#### 各属性的作用 

1. __noreturn__   
    
    此属性用在函数中，表示该函数从不返回。他能够让编译器生成较为优化的代码，消除不必要的警告信息。

        __attribute__((noreturn))


2. __unused__   

    此属性用于函数和变量，表示该函数或变量可能并不使用，这个属性能够避免编译器产生警告信息。

        __attribute__ ((unused))


3. __aligned__   

    此属性常用在变量、结构体或联合体中，用于设定一个指定大小的对齐格式，以字节为单位。

        __attribute__((aligned(8)))


4. __packed__  

    此属性用在变量和类型中，当用在变量或结构体成员时，表示使用最小可能的对齐；当用在枚举、结构体或联合体时，表示该类型使用最小的内存。

        __attribute__ ((packed))


5. __format(archetype,string-index,first-to-check)__   

    `archetype`指定哪种风格   

    `string-index`指定传入的函数的第几个参数是格式化字符串  

    `first-to-check`指定从函数的第几个参数开始按照上述规则进行检查 

    此属性用在函数中，表示该函数使用`printf`、`scanf`风格的参数，并可以让编译器检查函数声明和函数实际调用参数之间的格式化字符串是否匹配。

        __attribute__ ((format(printf, 2, 3)))



