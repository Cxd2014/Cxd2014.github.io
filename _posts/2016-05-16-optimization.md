---

layout: post
title:  "编写高效的C代码和C代码优化"
date:   2016-05-16 10:20:10
categories: programming
tags: C optimization

---

* content
{:toc}

### 前言

本片文章翻译于：[Writing Efficient C and C Code Optimization](http://www.codeproject.com/Articles/6154/Writing-Efficient-C-and-C-Code-Optimization)


注不是全部翻译，只是把我觉得非常有用的翻译了。

### 整型

如果我们知道一个值不可能是负数，我们应该使用`unsigned int `而不是`int`。因为有些处理器处理无符号整型运算要比有符号快很多（这也是一个非常好的习惯，也可以帮助你编写自我注释(self-documenting)的代码）。

所以在一个紧密循环体中应该这样声明一个`int`变量：

```c
register unsigned int variable_name;
```

虽然不保证编译器会关注`register`，`unsigned`也可能对处理器不会产生任何影响，但是不是所有编译器都是这样。

记住整数运算要比浮点运算快很多，因为整数运算可以直接在处理器中执行而不需要额外的FPUs或者浮点数学库支持。

如果我们需要精确到小数点后两位（例如：一个简单的财务软件），将所有数据乘以100然后将最后的运算结果转化为浮点数。

### 除法和取余

在标准处理器中，一个32位的除法运算需要执行20-140次循环，循环次数依赖于分子和分母。除法运算的执行时间是一个固定的加法运算时间加上每一个位的除法运算时间。

    Time (numerator / denominator) = C0 + C1* log2 (numerator / denominator)
         = C0 + C1 * (log2 (numerator) - log2 (denominator)).

当前版本的ARM处理器需要`20+4.3N`次循环。做为一种昂贵的操作，应该尽可能的避免使用。有时候这样的表达式可以使用乘法来代替除法。例如，如果知道`b`是正数并且`b *c`的结果是一个整数则`(a / b) > c`可以改写为`a > (c * b)`。如果确定其中一个操作数是`unsigned`类型，最好使用无符号除法因为它比有符号除法运行速度快。

### 合并除法和取余操作

在有些场合中除法`(x / y)`和取余`(x % y)`都需要。在这种情况下编译器可以结合两者而只调用一次除法函数因为它总是返回除数和余数。如果我们都需要，我们可以把它们写在一起就像下面的例子：

```c

int func_div_and_mod (int a, int b) { 
        return (a / b) + (a % b);
    }

```

### 使用数组索引

如果你希望根据某个值给一个变量赋一个特定的字符，你可能会这样做：

```c
switch ( queue ) {
case 0 :   letter = 'W';
   break;
case 1 :   letter = 'S';
   break;
case 2 :   letter = 'U';
   break;
}
```

或者这样：

```c
if ( queue == 0 )
  letter = 'W';
else if ( queue == 1 )
  letter = 'S';
else
  letter = 'U';
```

一种更加整洁（并且高效）的方法是将该值作为一个字符数组的索引，例如：

```c
static char *classes="WSU";

letter = classes[queue];
```

### 全局变量

全局变量不会分配在寄存器中。全局变量可以通过指针或者函数调用改变他的值。所以编译器不会在寄存器中缓存全局变量的值，导致使用全局变量时产生了额外的（通常是没有必要的）加载和存储操作。因此我们不应该在循环中使用全局变量。

如果一个函数频繁使用全局变量，最好将全局变量复制到一个局部变量中这样就可以在寄存器中访问它。这种方法只适应于全局变量没有在被调用函数中使用。

例如：

```c
int f(void);
int g(void);
int errs;
void test1(void)
{
  errs += f();
  errs += g();
}

void test2(void)
{
  int localerrs = errs;
  localerrs += f();
  localerrs += g();
  errs = localerrs;
}
```

注意`test1`每次使用全局变量`errs`时都必须到内存中加载和存储它，然而`test2`将`localerrs`存放到寄存器中每次只需要一条指令来访问它。

### 使用别名

考虑下面的例子：

```c
void func1( int *data )
{
    int i;
    for(i=0; i<10; i++)
    {
          anyfunc( *data, i);
    }
}
```

虽然`*data`的值不会改变但是编译器不知道`anyfunc ()`函数会不会改变它，所以这个程序每次使用它时都必须到内存中去读取-他可能是其他变量的别名可能在其他地方被改变。如果我们知道他不会被改变，我们可以使用下面这样的代码：

```c
void func1( int *data )
{
    int i;
    int localdata;
    localdata = *data;
    for(i=0; i<10; i++)
    {
          anyfunc ( localdata, i);
    }
}
```

这样给了编译器一个很好的优化机会。

### 变量类型

C编译器支持的基本类型有`char`,`short`,`int`和`long`(`signed`和`unsigned`),`float`和`double`。使用最合适的变量类型是非常重要的，它可以减少代码和数据的体积并大幅提高性能。

### 本地变量

如果可能，最好不要使用`char`和`short`类型的本地变量。对于`char`和`short`类型的变量，编译器每次分配空间时都需要减小本地变量的大小为8或者16位。这对于有符号变量叫做符号扩展，对于无符号变量叫做零扩展。它是通过寄存器左移24或者16位，然后将符号位右移相同的为数来实现的，需要两个指令（`unsigned char`类型需要一个指令）。

可以使用`int`或者`unsigned int`类型的变量来避免移位。尤其是当第一次加载数据到本地变量然后在本地变量中处理数据时这种方法是非常重要的。即使数据是以8或者16位来的输出和输入的，将他们作为32位来处理是值得考虑的。

考虑下面三个例子函数：

```c
int wordinc (int a)
{
   return a + 1;
}
short shortinc (short a)
{
    return a + 1;
}
char charinc (char a)
{
    return a + 1;
}
```
他们的结果是一样的但是第一个函数比其他函数运行的要快一些。

### 指针

如果可能我们应该使用引用来传递结构体，也就是说传递结构体的指针，否则会将整个结构体复制到栈中然后传递过去，这会是减慢程序运行速度。我看到过通过值传递几KB大小的结构体的程序，而一个简单的指针可以完成同样的事情。

接收结构体指针作为参数的函数，如果函数不改变结构体的内容应该声明为指针常量。例如：

```c
void print_data_of_a_structure ( const Thestruct  *data_pointer)
{
    ...printf contents of the structure...
}
```

这个例子告诉了编译器这个函数不会改变外部结构体的内容（使用一个指针常量指向结构体），所以不需要每次访问他们都重新读取一遍。他也保护了结构体的内容，如果你的代码试图改变只读结构体编译器会抛出异常。

### 指针链

指针链通常用于访问结构体中的内容。例如常见的指针链如下：

```c
typedef struct { int x, y, z; } Point3;
typedef struct { Point3 *pos, *direction; } Object;

void InitPos1(Object *p)
{
   p->pos->x = 0;
   p->pos->y = 0;
   p->pos->z = 0;
}
```

然而这种代码每次访问`p->pos`时都必须重新加载一次，因为编译器不知道`p->pos->x`是否是`p->pos`的别名。一种更好的写法是将`p->pos`缓存到本地变量中：

```c
void InitPos2(Object *p)
{
   Point3 *pos = p->pos;
   pos->x = 0;
   pos->y = 0;
   pos->z = 0;
}
```

另一种方法是将`Point3`结构体包含在`Object`结构体中，从而完全避免指针。

### 条件执行

条件执行通常包含在`if`语句中，而且需要使用复杂的关系操作符表达式（<, ==, > 等等）或者布尔运算符（&&, !, 等等）。条件执行会禁止含有函数调用的代码序列，函数的返回值标志也会被破坏。

因此尽可能的保持`if`和`else`语句体内的代码简洁，这样他们就可以被条件化。关系表达式应该组织成相似的条件语句块。

下面的例子显示了编译器怎样使用条件执行：

```c
int g(int a, int b, int c, int d)
{
   if (a > 0 && b > 0 && c < 0 && d < 0)
   //  将条件判断组织在一起 //
      return a + b + c + d;
   return -1;
}
```

由于条件判断都组织在一起，编译器可以条件化编译他们。

### 布尔表达式 & 范围检查

布尔表达式通常用于检查一个变量是否在指定范围内，例如，检查图形坐标是否在一个窗口内：

```c
bool PointInRectangelArea (Point p, Rectangle *r)
{
   return (p.x >= r->xmin && p.x < r->xmax &&
                      p.y >= r->ymin && p.y < r->ymax);
}
```

有一种更快的方法来实现它：`(x >= min && x < max)`可以改写为`(unsigned)(x-min) < (max-min)`。特别是当`min`为0时，优化后的代码为：

```c
bool PointInRectangelArea (Point p, Rectangle *r)
{
    return ((unsigned) (p.x - r->xmin) < r->xmax &&
   (unsigned) (p.y - r->ymin) < r->ymax);

}
```

### 布尔表达式 & 与0比较

当执行条件指令(i.e. CMP)后处理器标志位被置位。这个标志位也可以被其他指令设置，例如MOV, ADD, AND, MUL等基本的算术和逻辑指令（数据处理指令）。如果数据处理指令设置了这个标志位，如果计算结果与0比较时`N`和`Z`标志也会被设置。`N`标志表示结果为负数，`Z`标志表示结果为0。

处理器中的`N`和`Z`标志在C语言中对应有符号关系操作`x < 0, x >= 0, x == 0, x != 0`，和无符号操作`x == 0, x != 0 (or x > 0)`。

C语言中的每个关系操作符都会使编译器执行一次比较指令。如果操作符是上述之一并且数据处理操作在比较指令之前则编译器可以删除比较指令。例如：

```c
int aFunction(int x, int y)
{
   if (x + y < 0)
      return 1;
  else
     return 0;
}
```

如果可能，设置一个临界例程来测试上述条件。这通常可以让你在循环中保存比较结果，从而减少代码量和提高性能。C语言没有进位或溢出标志的概念，所以如果不使用内联汇编不可能直接测试`C`和`V`标志位。但是编译器支持进位标志（无符号溢出）。例如：

```c
int sum(int x, int y)
{
   int res;
   res = x + y;
   if ((unsigned) res < (unsigned) x) // carry set?  //
     res++;
   return res;
}
```

### 懒惰计算(Lazy Evaluation Exploitation)

在`if(a>10 && b=4)`这种表达式中，确保`AND`语句前面的表达式在多数情况下返回非真结果（或者更简单的、更快的表达式），这样`AND`语句后面的表达式很可能不需要执行。

### switch()而不是if...else...

对于大的条件判断语句`if...else...else...`，像这样的：

```c
if( val == 1)
    dostuff1();
else if (val == 2)
    dostuff2();
else if (val == 3)
    dostuff3();

```

如果使用`switch`语句可以更加高效：

```c
switch( val )
{
    case 1: dostuff1(); break;

    case 2: dostuff2(); break;

    case 3: dostuff3(); break;
}
```

在`if()`语句中，如果最后一个条件是成立的，前面的所有条件都会先测试一次。`switch`语句可以省掉这些多余的工作。如果你不得不使用一个庞大的`if..else..`表达式，最先测试最可能成立的条件。

### 分割语句

将例如下面的这种一长串语句分开写：

```c
if(a==1) {
} else if(a==2) {
} else if(a==3) {
} else if(a==4) {
} else if(a==5) {
} else if(a==6) {
} else if(a==7) {
} else if(a==8)
{
}
```

替换为下面的代码：

```c
if(a<=4) {
    if(a==1)     {
    }  else if(a==2)  {
    }  else if(a==3)  {
    }  else if(a==4)   {

    }
}
else
{
    if(a==5)  {
    } else if(a==6)   {
    } else if(a==7)  {
    } else if(a==8)  {
    }
}
```

或者这样的：

```c
if(a<=4)
{
    if(a<=2)
    {
        if(a==1)
        {
            /* a is 1 */
        }
        else
        {
            /* a must be 2 */
        }
    }
    else
    {
        if(a==3)
        {
            /* a is 3 */
        }
        else
        {
            /* a must be 4 */
        }
    }
}
else
{
    if(a<=6)
    {
        if(a==5)
        {
            /* a is 5 */
        }
        else
        {
            /* a must be 6 */
        }
    }
    else
    {
        if(a==7)
        {
            /* a is 7 */
        }
        else
        {
            /* a must be 8 */
        }
    }
}
```

```c
/* 速度慢并且效率低下的版本         速度快并且效率高效的版本*/
c=getch();                       c=getch();
switch(c){                       switch(c){
    case 'A':                        case 0:
    {                                {
        do something;                   do something;
        break;                          break;
    }                                }
    case 'H':                        case 1:
    {                                {
        do something;                   do something;
        break;                          break;
    }                                }
    case 'Z':                        case 2:
    {                                {
        do something;                   do something;
        break;                          break;
    }                                }
}                                }
```

比较这两种`Case`语句的写法

### Switch语句 VS 查找表

`switch`语句通常使用在下面这些场景下：

* 调用几个函数中的一个

* 设置一个变量或者返回一个值

* 执行几段代码中的一段

如果`switch`语句中的`case`标签非常多，他们可以使用更加高效的查找表代替。例如，下面两种根据不同条件返回字符串的实现方式：

```c
char * Condition_String1(int condition) {
  switch(condition) {
     case 0: return "EQ";
     case 1: return "NE";
     case 2: return "CS";
     case 3: return "CC";
     case 4: return "MI";
     case 5: return "PL";
     case 6: return "VS";
     case 7: return "VC";
     case 8: return "HI";
     case 9: return "LS";
     case 10: return "GE";
     case 11: return "LT";
     case 12: return "GT";
     case 13: return "LE";
     case 14: return "";
     default: return 0;
  }
}

char * Condition_String2(int condition) {
   if ((unsigned) condition >= 15) return 0;
      return
      "EQ\0NE\0CS\0CC\0MI\0PL\0VS\0VC\0HI\0LS\0GE\0LT\0GT\0LE\0\0" +
       3 * condition;
}
```

第一个函数需要240个字节的代码来实现而第二种只需要72个字节来实现。

### 循环

循环在大多数程序中是常用的结构；大量的执行时间经常消耗在循环当中。因此值得关注要求执行时间严格的循环。

#### 循环终止

如果没有仔细编写循环的终止条件会造成非常大的性能开销。我们应该总是编写递减至0的循环并使用简单的终止条件。如果终止条件非常简单会减少循环执行时间。下面的两个示例程序计算`n!`。第一个程序使用循环递增，第二个使用循环递减。

```c
int fact1_func (int n)
{
    int i, fact = 1;
    for (i = 1; i <= n; i++)
      fact *= i;
    return (fact);
}

int fact2_func(int n)
{
    int i, fact = 1;
    for (i = n; i != 0; i--)
       fact *= i;
    return (fact);
}
```

结果是第二个`fact2_func`函数比第一个函数执行的更快。

#### 加速`for()`循环

这是一个简单的技巧但是非常有效。通常我们这样编写`for()`循环代码:

```c
for( i=0;  i<10;  i++){ ... }
```

[ `i` 的值依次为 0,1,2,3,4,5,6,7,8,9 ]

如果我们不关心循环计数器的顺序，我们可以使用下面代码代替：

```c
for( i=10; i--; ) { ... }
```

使用这种代码，`i`的值依次为9,8,7,6,5,4,3,2,1,0这样的循环更加快速。

这样更加有效的原因是`i--`作为条件判断处理的更加快速，相当于“`i`的值是非0吗？如果是，把它减一然后继续”。而前面的代码。处理器必须计算“首先将10减去`i`，然后判断结果是否为非0？如果是，将`i`加1然后继续”。在大量的循环中，这两种写法的性能区别非常大。

这种语法有点奇怪，可以把它改成更加合法的形式。循环中的第三个语句是可选的（无限循环可以写成这样`for( ; ; )`）。同样的效果可以写成这样：

```c
for(i=10; i; i--){}
```
或者更进一步扩展为：

```c
for(i=10; i!=0; i--){}
```

有一件事我们必须得小心要记住这种方式只适应于循环的停止条件为0（所以如果循环的范围是50-80，就不能使用这种方法），并且循环计数器是递减的。非常容易看出你的循环计数器是不是递增的。

我们也可以使用寄存器分配，这会使函数中的代码更加高效。将循环计数器初始化为某个值然后递减至0的方法也适用与`while`和`do`语句中。

#### 冗余循环

千万不要在只需要使用一个循环就能解决问题的地方使用两个循环。但是如果你的循环中有很多代码，它可能会超出处理器的指令缓存。在这种情况下分成两个可以全部在缓存中运行的循环会更加高效。这有一个例子。

```c
//原始代码:                       //更好的实现方式
for(i=0; i<100; i++){            for(i=0; i<100; i++){                       
    stuff();                         stuff();                  
}                                    morestuff();      
                                 }          
for(i=0; i<100; i++){                                           
    morestuff();                                            
}                                           
```

#### 函数循环

函数调用总会带来一定的性能消耗。不仅需要改变程序指针而且还要将正在使用的变量压入栈中然后分配新的变量。一个程序的函数结构可以有很多地方来提高程序的性能。注意这一点可以使程序在保持可读性的同时可以控制程序的体积。

如果循环中反复调用一个函数，如果可能把循环放在函数体内部这样可以避免函数调用带来的消耗，例如：

```c
for(i=0 ; i<100 ; i++)
{
    func(t,i);
}

void func(int w,d)
{
    lots of stuff.
}
```

可以变成这样

```c
func(t);

void func(w)
{
    for(i=0 ; i<100 ; i++)
    {
        //lots of stuff. 
    }
}
```

#### 循环展开

为了提高性能可以展开那些小的循环体，但是会使程序体积增大。当循环体被展开，可以减少循环计数器的更新和分支代码的执行。如果循环的次数很少完全可以展开它，这样循环的开销完全消失。

循环展开可以节省很多的开销，例如：

```c
for(i=0; i<3; i++){
    something(i);
}
```

这样会更加高效：

```c
something(0);
something(1);
something(2);
```

因为每次循环代码都需要检查并增加`i`的值。当循环的次数是固定的时候编译器经常会展开这种简单的循环。但是像这种情况：

```c
for(i=0;i< limit;i++) { ... }
```

这种情况不可能被展开，因为我们不知道要循环多少次。然而还是有可能展开这种循环来得到更高的性能。

下面的代码体积比一个简单的循环大，但是它更加高效。以`8`为单位仅仅是为了演示，任何合适的大小都可以-我们只需要使用相同数目的循环内容来代替就行了。在这个例子中每8次判断一次循环条件，而不是每次循环都需要判断。但是块的大小依赖于机器的缓存大小。

```c
//Example 1

#include<STDIO.H> 

#define BLOCKSIZE (8) 

void main(void)
{ 
int i = 0; 
int limit = 33;  /* could be anything */ 
int blocklimit; 

/* The limit may not be divisible by BLOCKSIZE, 
 - go as near as we can first, then tidy up.
 */ 
blocklimit = (limit / BLOCKSIZE) * BLOCKSIZE; 

/* unroll the loop in blocks of 8 */ 
while( i < blocklimit ) 
{ 
    printf("process(%d)\n", i); 
    printf("process(%d)\n", i+1); 
    printf("process(%d)\n", i+2); 
    printf("process(%d)\n", i+3); 
    printf("process(%d)\n", i+4); 
    printf("process(%d)\n", i+5); 
    printf("process(%d)\n", i+6); 
    printf("process(%d)\n", i+7); 

    /* update the counter */ 
    i += 8; 

} 

/* 
 - There may be some left to do.
 - This could be done as a simple for() loop, 
 - but a switch is faster (and more interesting) 
 */ 

if( i < limit ) 
{ 
    /* Jump into the case at the place that will allow
     - us to finish off the appropriate number of items. 
     */ 

    switch( limit - i ) 
    { 
        case 7 : printf("process(%d)\n", i); i++; 
        case 6 : printf("process(%d)\n", i); i++; 
        case 5 : printf("process(%d)\n", i); i++; 
        case 4 : printf("process(%d)\n", i); i++; 
        case 3 : printf("process(%d)\n", i); i++; 
        case 2 : printf("process(%d)\n", i); i++; 
        case 1 : printf("process(%d)\n", i); 
    }
} 
}
```

#### 提前跳出循环

通常我们不需要执行整个循环。例如，当我们寻找一个数组中的特定项时，当我们找到了想要的项时马上跳出循环。下面这个例子中我们在10000个数中找-99这个数。

```c
found = FALSE;
for(i=0;i<10000;i++)
{
    if( list[i] == -99 )
    {
        found = TRUE;
    }
}

if( found ) printf("Yes, there is a -99. Hooray!\n");
```

它可以正常运行但是他总是会查找整个数组，不管在哪里找到我们需要的数。一种更好的方法是找到之后立即跳出。

```c
found = FALSE;
for(i=0; i<10000; i++)
{
    if( list[i] == -99 )
    {
        found = TRUE;
        break;
    }
}
if( found ) printf("Yes, there is a -99. Hooray!\n");
```

### 函数设计

保持函数小巧并简单是非常好的习惯。他可以使编译器进行其他优化，例如寄存器分配。

#### 函数调用开销

函数调用的开销对于处理器来说是非常小的，它相对于函数执行的开销比例很小。在寄存器中传递参数到调用函数中有一定限制。这些参数可以是整型兼容的（char, shorts, ints and floats 所有一个字大小的类型），或者4个字的（包括2个字的doubles和long longs）。如果参数限制为4个，那么剩下的参数需要通过栈来传递。这会增加函数调用时存储这些参数和被调函数加载这些参数的开销。

下面是一个简单的示例代码：

```c
int f1(int a, int b, int c, int d) {
   return a + b + c + d;
}

int g1(void) {
   return f1(1, 2, 3, 4);
}


int f2(int a, int b, int c, int d, int e, int f) {
  return a + b + c + d + e + f;
}

ing g2(void) {
 return f2(1, 2, 3, 4, 5, 6);
}
```

第5个和第6个参数在函数`g2`中存储到栈中，然后在函数`f2`中加载，造成了每个参数要在内存中访问2次的开销。

#### 最小化参数传递开销

最小化参数传递开销的方法：

* 确保函数需要传递4个或者更少的参数。这样可以不需要使用栈来传递参数。
* 如果一个函数需要多于4个参数，尽量确保它不是常用的函数，这样它的参数传递开销可以忽略。
* 传递结构体的指正而不是结构体本身。
* 将相关参数放在一个结构体中，然后传递这个结构体的指针。这可以减少参数的数量并提高可阅读性。
* 最少化体积大的参数，因为他们会占用两个参数的空间。如果启用软件浮点也适用于`doubles`类型。
* 尽量不要使用可变参数的函数。这种函数调用时会将所有参数放在栈中。

### 使用查找表

某些函数通常可以使用一个查找表来代替，他会显著增加性能。查找表通常没有计算出来的值精确但是对于大多数应用程序来说没有关系。

很多信号处理程序（例如，调制解调器的解调软件）大量使用了`sin`和`cos`函数，这些函数会产生大量计算。对于一个实时系统没有必要精确计算，使用sin/cos查找表是非常必要的。当使用查找表时将尽可能多的相邻操作放在同一个查找表中。相对于多个查找表来说这会使程序运行更快并且节约空间。

### 其他优化技巧

通常优化会让我们在内存和速度上做选择。如果你可以缓存任何经常使用的数据而不是重新计算或者加载它，这非常有用。例如上面的sin/cosin查找表或者建立伪随机数表。

* 避免在循环表达式中使用`++`和`--`等等。例如：`while(n--){}`,因为这种操作符有时候非常难以优化。

* 最少化使用全局变量。

* 文件中的（函数外的）任何声明使用`static`关键字，除非要把它要在其他文件中使用。

* 如果可以使用字长变量，因为处理器可以更好的处理他们（而不是char, short, double, bit fields等等）。

* 不要使用递归。递归可以很优雅和简洁，但是太多的函数调用会造成巨大的开销。

* 避免在循环中使用`sqrt()`函数，因为计算平方根是非常消耗CPU的。

* 一维数组比多维数组更快。

* 编译器通常优化整个文件--避免将密切相关的函数分开在几个文件中，如果把他们放在一起编译器可以更好的优化他们（例如，可以内联某些函数）。

* 单精度运算比双精度运算更快-编译器经常优化这一点。

* 浮点数的乘法通常比除法快--使用`val * 0.5 `而不是`val / 2.0`。

* 加法运算比乘法更快--使用`val + val + val`而不是`val * 3`。`puts()`函数比`printf()`函数快，虽然不灵活。

* 使用`#defined`定义宏而不要使用简单的函数--有时候CPU的使用大部分集中在一个上千次的循环调用外部函数中使用宏来代替这个函数可以消除函数调用开销并且可以使编译器更加高效的优化程序。

* 二进制/未格式化的文件访问速度要比格式化文件快，因为机器不需要在人类可读的`ASCII`码和机器可读的二进制码之间相互转换。如果你自己不需要查看文件数据，可以考虑将他储存为二进制文件。

* 如果你的库支持`mallopt()`函数（用于控制`malloc`函数），使用它。`MAXFAST`宏的设置可以显著提高`malloc`函数的效率。如果某个特定结构体经常被创建/销毁，尝试设置`mallopt`选项使它可以在这种情况下更好的工作。

最后，但是绝对不是最终 -- 打开编译器优化选项！这是显而易见的但是在产品发布时经常忘记了使用优化选项来编译程序。编译器可以进行比源代码更加底层的优化，并且可以针对特定平台的处理器进行优化。
