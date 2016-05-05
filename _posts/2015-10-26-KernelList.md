---

layout: post
title:  "Linux内核链表"
date:   2015-10-26 21:40:10
categories: linux
tags: linux kernel list 内核链表
---

* content
{:toc}



#### Linux内核链表定义
linux内核定义的链表结构不带数据域，只需要两个指针完成链表的操作。将链表节点加入数据结构，具备非常高的扩展性，通用性。
```c
/* include/linux/types.h */
struct list_head {
	struct list_head *next, *prev;
};
```

#### 初始化链表 

* 利用宏在编译时静态初始化

		#define LIST_HEAD_INIT(name) { &(name), &(name) }
		#define LIST_HEAD(name) \
			struct list_head name = LIST_HEAD_INIT(name)

1. `LIST_HEAD_INIT(name)`函数宏只进行初始化
2. `LIST_HEAD(name)`函数宏声明并进行初始化
3. 初始化是将`next`,`prev`指针都指向本身

* 利用函数在运行时初始化
```c
/* include/linux/list.h */
static inline void INIT_LIST_HEAD(struct list_head *list)
{
	/* 将前驱和后继节点都指向本身 */
	list->next = list;
	list->prev = list;
}
```

#### 插入节点

1. 插入新节点在指定节点后面 

		/*
		 *	参数 new 需要插入的节点
		 *	参数 head 新节点将插入节点后面
		 */
		static inline void list_add(struct list_head *new, struct list_head *head)
		{
			__list_add(new, head, head->next);
		}

2. 插入新节点在指定节点前面

		static inline void list_add_tail(struct list_head *new, struct list_head *head)
		{
			__list_add(new, head->prev, head);
		}

3. 最终调用此函数进入插入操作

		static inline void __list_add(struct list_head *new,
					      struct list_head *prev,
					      struct list_head *next)
		{
			next->prev = new;
			new->next = next;
			new->prev = prev;
			prev->next = new;
		}

#### 删除节点
```c
static inline void list_del(struct list_head *entry)
{
	__list_del(entry->prev, entry->next);
	entry->next = LIST_POISON1;
	entry->prev = LIST_POISON2;
}
```
1. `__list_del`改变该节点前驱节点的后继结点和后继结点的前驱节点。
2. 设置该节点的前驱节点和后继结点指向`LIST_POSITION1`和`LIST_POSITION2`两个特殊值，因为此节点只是从链表中删除，此节点所占用的内存空间并没有释放。所以这样设置是为了保证不在链表中的节点项不可访问，对`LIST_POSITION1`和`LIST_POSITION2`的访问将引起页故障。

---

```c
static inline void list_del_init(struct list_head *entry)
{
	__list_del_entry(entry);
	INIT_LIST_HEAD(entry);
}
```

1. `__list_del_entry`函数也是调用`__list_del`
2. 然后在将此节点初始化为`next`,`prev`指针都指向本身

#### 获取节点

	#define list_entry(ptr, type, member) \
		container_of(ptr, type, member)

`list_entry(ptr, type, member)` 实际上是调用的`container_of`宏。
它的作用是：根据"结构体(type)变量"中的"域成员变量(member)的指针(ptr)"来获取指向整个结构体变量的指针，此宏在`include/linux/kernel.h`中定义：

	#define container_of(ptr, type, member) ({			\
	const typeof( ((type *)0)->member ) *__mptr = (ptr);	\
	(type *)( (char *)__mptr - offsetof(type,member) );})

#### 遍历链表

* 用于遍历链表然后获取节点
```c
#define list_for_each(pos, head) \
	for (pos = (head)->next; prefetch(pos->next), pos != (head); \
        	pos = pos->next)
```
* 用于遍历链表然后删除节点
```c
#define list_for_each_safe(pos, n, head) \
	for (pos = (head)->next, n = pos->next; pos != (head); \
		pos = n, n = pos->next)
```

#### 链表的使用

```c
struct person 
{ 
    int age; 
    char name[20];
    struct list_head list; //将链表嵌入结构体中
};
 
void main(int argc, char* argv[]) 
{ 
    struct person *pperson; 
    struct person person_head; 
    struct list_head *pos, *next; 
    int i;

    // 初始化双链表的表头 
    INIT_LIST_HEAD(&person_head.list); 

    // 添加节点
    for (i=0; i<5; i++)
    {
        pperson = (struct person*)malloc(sizeof(struct person));
        pperson->age = (i+1)*10;
        sprintf(pperson->name, "%d", i+1);
        // 将节点链接到链表的末尾 
        // 如果想把节点链接到链表的表头后面，则使用 list_add
        list_add_tail(&(pperson->list), &(person_head.list));
    }

    // 遍历链表
    list_for_each(pos, &person_head.list) 
    { 
        pperson = list_entry(pos, struct person, list);//获取该节点的结构体指针 
        printf("name:%-2s, age:%d\n", pperson->name, pperson->age); 
    } 

    // 删除节点age为20的节点
    list_for_each_safe(pos, next, &person_head.list)
    {
        pperson = list_entry(pos, struct person, list);
        if(pperson->age == 20)
        {
            list_del_init(pos);//从链表中删除
            free(pperson); //释放内存
        }
    }

    // 释放所有节点
    list_for_each_safe(pos, next, &person_head.list)
    {
        pperson = list_entry(pos, struct person, list); 
        list_del_init(pos); 
        free(pperson); 
    }    
}
```
参考文章:   

* [Linux内核中双向链表的经典实现](http://www.cnblogs.com/skywang12345/p/3562146.html)
* [Linux内核链表的研究与应用](http://blog.csdn.net/tigerjibo/article/details/8299599)
