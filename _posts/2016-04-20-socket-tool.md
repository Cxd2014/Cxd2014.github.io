---
layout: post
title:  "网络编程中的各种格式转换函数"
date:   2016-04-20 19:40:10
categories: network
tags: socket 网络编程

---

* content
{:toc}

### 主机字节序和网络字节序之间的相互转换

```c
#include <arpa/inet.h>

uint32_t htonl(uint32_t hostlong);

uint16_t htons(uint16_t hostshort);

uint32_t ntohl(uint32_t netlong);

uint16_t ntohs(uint16_t netshort);
```

这些函数名字中，h代表`host`,n代表`network`,s代表`short`,l代表`long`。


例：`htonl`函数是将32位的无符号整型值从主机字节序转换为网络字节序；


### IPv4的点分十进制字符串和网络字节序二进制值之间的转换

```c
#include <arpa/inet.h>

int inet_aton(const char *cp, struct in_addr *inp);

char *inet_ntoa(struct in_addr in);
```

`inet_aton`将`cp`所指C字符串转换成一个32位的网络字节序二进制值，并通过指针`inp`来存储。成功则返回1，否则返回0。


`inet_ntoa`将一个32位的网络字节序二进制IPv4地址转换成相应的点分十进制数串。
    
使用示例：

```c    

struct sockaddr_in Sockaddr;
char *ip = NULL;

ip = "192.168.0.110";

if(inet_aton(ip,&Sockaddr.sin_addr) == 0)
    printf("inet_aton error\n");    
    
printf("sin_addr = %x\n",Sockaddr.sin_addr);

ip = inet_ntoa(Sockaddr.sin_addr);
printf("ip = %s\n",ip);

```
    
### IPv6和IPv4共用的转换函数

```c    
#include <arpa/inet.h>

int inet_pton(int af, const char *src, void *dst);

const char *inet_ntop(int af, const void *src, char *dst, socklen_t cnt);
``` 
函数中p代表`presentation`（表达）,n代表`numeric`（数值）。
    
这两个函数的`af`参数即可以是`AF_INET`，也可以是`AF_INET6`。如果以不被支持的地址族作为af参数，这两个函数会返回一个错误，并设置`errno`为`EAFNOSURRORT`。


`inet_pton`函数尝试转换由`src`指针所指的字符串，并通过`dst`指针存放二进制结果。若成功返回1，如果字符串不是有效的表达式则返回0。


`inet_ntop`进行相反的转换，从数值格式（`src`）转换到表达式格式（`dst`）。`len`参数是目标存储单元的大小，以免该函数溢出其调用者的缓冲区。失败返回`NULL`。


`len`的大小通常为：

```c
#include <netinet/in.h>
#define INET_ADDRSTRLEN 16     /* ipv4 */
#define INET6_ADDRSTRLEN 46    /* ipv6 */
```

使用示例：

```c

struct sockaddr_in addr;
char str[INET_ADDRSTRLEN]={0};
char *ip = NULL;
ip = "192.168.0.110";

if(inet_pton(AF_INET,ip,&addr.sin_addr) == 0)
    printf("inet_pton error\n");
    
printf("sin_addr = %x\n",addr.sin_addr);

if(inet_ntop(AF_INET,&addr.sin_addr,str,sizeof(str)) == NULL)
    printf("inet_ntop error\n");
    
printf("str = %s\n",str);

```