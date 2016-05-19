---

layout: post
title:  "分析goahead web 服务器中的哈希表"
date:   2016-05-18 10:20:10
categories: programming
tags: C hash table goahead

---

* content
{:toc}

### 前言

之前看过很多关于哈希表的博文，但是都是讲的原理，没有实际使用过总是对他一知半解。再看goahead web 服务器的源码时发现他里面大量使用了哈希表，并且它的哈希表实现的非常实用、精巧。所以把他的哈希表相关函数提取出来，作为一个单独程序拿来分析、调试。

### 哈希表的整体储存结构

![hash-table]({{ "/css/pics/hash-table.png"}})  

分析：

1. 首先它定义了一个全局数组`static HashTable **sym`每个数组项存放一个哈希表。也就是说在程序中可以建立多个哈希表。
2. 每个哈希表中在建立一个指针数组，指针数组中的每一项指向一个哈希表存放的元素。
3. 如果发生哈希冲突，将冲突项以链表的形式存放。
4. 哈希链表的实现代码：[goahead的哈希表](https://github.com/Cxd2014/DataStruct/tree/master/hash)
5. 下面是对几个主要的函数进行分析。

### 哈希表的创建

```c
WebsHash hashCreate(int size)
{
    WebsHash    sd;
    HashTable   *tp;

    if (size < 0) {
        size = WEBS_SMALL_HASH;
    }
    assert(size > 2);

    /*
        为新建的哈希表分配一个新的ID，根据这个ID识别是哪一个哈希表。
        这个ID就是全局数组**sym中存放这个哈希表的数组下标。
        wallocHandle函数就是在全局数组**sym中查找空缺位，然后返回该位置的数组下标
     */
    if ((sd = wallocHandle(&sym)) < 0) {
        return -1;
    }

    /*
        为哈希表分配一个存储空间，存放 struct HashTable 结构体
     */
    if ((tp = (HashTable*) walloc(sizeof(HashTable))) == NULL) {
        symMax = wfreeHandle(&sym, sd);
        return -1;
    }
    memset(tp, 0, sizeof(HashTable));
    if (sd >= symMax) {
        symMax = sd + 1;
    }
   

    assert(0 <= sd && sd < symMax);
    sym[sd] = tp;

    /*
        根据哈希表的大小分配空间来存放指针数组。
        将哈希表的hash_table域指向这个指针数组。
        指针数组用于存放元素
     */
    tp->size = calcPrime(size);
    printf("tp->size = %d\n", tp->size);

    if ((tp->hash_table = (WebsKey**) walloc(tp->size * sizeof(WebsKey*))) == 0) {
        wfreeHandle(&sym, sd);
        wfree(tp);
        return -1;
    }
    printf("sizeof(WebsKey*) = %d\n",sizeof(WebsKey*));
    assert(tp->hash_table);
    memset(tp->hash_table, 0, tp->size * sizeof(WebsKey*));
    return sd;
}
```

### 在哈希表中添加元素

```c
WebsKey *hashEnter(WebsHash sd, char *name, WebsValue v, int arg)
{
    HashTable   *tp;
    WebsKey     *sp, *last;
    char        *cp;
    int         hindex;


    assert(name);
    assert(0 <= sd && sd < symMax);
    tp = sym[sd];
    assert(tp);
   
    /*
        hashIndex函数根据传递进来的关键字 char *name 来计算
        该元素需要存放在哈希表中的位置hindex
     */
    last = NULL;
    hindex = hashIndex(tp, name);

    /* 如果计算出来的该位置已经有元素存放在这 */
    if ((sp = tp->hash_table[hindex]) != NULL) {
        /* 查找该位置是否已经有该关键字 */
        for (; sp; sp = sp->forw) {
            cp = sp->name.value.string;
            if (cp[0] == name[0] && strcmp(cp, name) == 0) {
                break;
            }
            last = sp;
        }
        if (sp) {
            /*
               找到了该关键字，更新该关键字对应的内容
             */
            if (sp->content.valid) {
                valueFree(&sp->content);
            }
            sp->content = v;
            sp->arg = arg;
            return sp;
        }
        /*
            没有找到该关键字，说明发生哈希冲突，分配一个新的空间，
            把新元素放在该位置的链表后面
         */
        if ((sp = (WebsKey*) walloc(sizeof(WebsKey))) == 0) {
            return NULL;
        }
        sp->name = valueString(name, VALUE_ALLOCATE);
        sp->content = v;
        sp->forw = (WebsKey*) NULL;
        sp->arg = arg;
        sp->bucket = hindex;
        last->forw = sp;

    } else {
        /*
            如果计算出来的该位置没有元素，创建一个新链表
         */
        if ((sp = (WebsKey*) walloc(sizeof(WebsKey))) == 0) {
            return NULL;
        }
        tp->hash_table[hindex] = sp;
        tp->hash_table[hashIndex(tp, name)] = sp;

        sp->forw = (WebsKey*) NULL;
        sp->content = v;
        sp->arg = arg;
        sp->name = valueString(name, VALUE_ALLOCATE);
        sp->bucket = hindex;
    }
    return sp;
}
```

### 哈希表的查找

```c
WebsKey *hashLookup(WebsHash sd, char *name)
{
    HashTable   *tp;
    WebsKey     *sp;
    char        *cp;

    assert(0 <= sd && sd < symMax);
    if (sd < 0 || (tp = sym[sd]) == NULL) {
        return NULL;
    }
    if (name == NULL || *name == '\0') {
        return NULL;
    }
    /*
        根据关键字计算出该元素在哈希表中的位置，因为每个位置存放的是一个链表
        然后在该链表中查找需要的元素
     */
    for (sp = hash(tp, name); sp; sp = sp->forw) {
        cp = sp->name.value.string;
        if (cp[0] == name[0] && strcmp(cp, name) == 0) {
            break;
        }
    }
    return sp;
}
```

### 哈希表的键值对计算函数

```c
static int hashIndex(HashTable *tp, char *name)
{
    uint        sum;
    int         i;

    assert(tp);
    /*
       根据传递的关键字，通过下面计算返回该关键字在哈希表中的位置
     */
    i = 0;
    sum = 0;
    while (*name) {
        sum += (((int) *name++) << i);
        i = (i + 7) % (BITS(int) - BITSPERBYTE);
    }

    return sum % tp->size;
}
```
