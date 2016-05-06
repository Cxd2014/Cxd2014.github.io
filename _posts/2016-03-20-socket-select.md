---
layout: post
title:  "socket编程中的select函数使用方法"
date:   2016-03-20 21:40:10
categories: network
tags: socket select

---

* content
{:toc}

### select函数

1. 函数原型

        int select(int nfds, fd_set *readfds, fd_set *writefds,
                            fd_set *exceptfds, struct timeval *timeout);

2. 该函数可以同时监听多个套接字，如果其中一个有数据到来就返回，并且可以设置超时时间，如果超时时间到了也返回。

3. 第一个参数nfds的值是待测试的描述符中最大描述符加`1`。

4. 中间的三个参数readfds、writefds、exceptfds指定要让内核测试读、写和异常条件的描述。

5. 最后一个参数timeout指定超时时间

        struct timeval
        {
            time_t tv_sec; /* Seconds. */
            suseconds_t tv_usec; /* Microseconds. */
        };

该参数有以下三种可能：

* 永远等待下去：仅在有一个描述符准备好`I/O`时才返回。为此，我们把该参数设置为空指针。

* 等待一段固定时间：在有一个描述符准备好`I/O`时才返回，但是不超过由该参数设置的时间。

* 根本不等待：检查描述符后立即返回，这称为轮询，为此，该参数必须为`0`。


### 示例程序

```c 
#include <stdio.h>
#include <sys/time.h>
#include <sys/types.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <arpa/inet.h>

int init_socket(int port)
{
    int sockfd;
    struct sockaddr_in Sockaddr;

    memset(&Sockaddr, 0x0, sizeof(Sockaddr));
    Sockaddr.sin_family = AF_INET;
    Sockaddr.sin_addr.s_addr = htonl(INADDR_ANY);
    Sockaddr.sin_port = htons(port);
    
    sockfd = socket(AF_INET,SOCK_DGRAM,0);
    if(sockfd == -1){
        perror("socket error\n");
        return -1;
    }

    if(bind(sockfd,(struct sockaddr *)&Sockaddr,sizeof(Sockaddr)) == -1){
        perror("bind error\n");
        return -1;
    }

    return sockfd;
}

int main()
{
    struct timeval tv;
    fd_set rd_fd;

    int socket_one = 0;
    int socket_two = 0;
    
    char buffer[100] = {0};
    
    int ret = 0;
    int maxfd = 0;

    socket_one = init_socket(1111);
    socket_two = init_socket(2222);
    
    while(1){
        
        /* 设置超时时间为2秒 */
        tv.tv_sec = 2;  /* 秒 */
        tv.tv_usec = 0; /* 毫秒 */

        memset(buffer, 0x0, 100);

        /* 将sock描述符注册到rd_fd中 */
        FD_ZERO(&rd_fd);
        FD_SET(socket_one, &rd_fd);
        FD_SET(socket_two, &rd_fd);
        
        /* 得到描述符中最大的那个值 */
        maxfd = socket_one > socket_two ? socket_one : socket_two;
        
        
        ret = select(maxfd + 1, &rd_fd, NULL, NULL, &tv);
        
        if(ret == -1){
            perror("select error\n");
            
        }else if(ret == 0){
            printf("selcet timeout\n");
            
        }else{
                
            if(FD_ISSET(socket_one, &rd_fd))
            {
                /* socket_one有数据可以接受 */
                 if (recvfrom(socket_one,buffer,sizeof(buffer),0,NULL,0) < 0) {
                    perror("recvform error");
                 }
                 
                 printf("socket_one buffer = %s\n",buffer);
            }
            
            if (FD_ISSET(socket_two, &rd_fd))
            {
                /* socket_two有数据可以接受 */
                if (recvfrom(socket_two,buffer,sizeof(buffer),0,NULL,0) < 0) {
                    perror("recvform error");
                 }
                 
                 printf("socket_two buffer = %s\n",buffer);
            }
        }
    }
}
```


### 测试程序

```c
/*
+ 运行程序例如：
+   ./hello 192.168.0.100 2222
+   ./hello 192.168.0.100 1111
*/

#include <stdio.h>
#include <stdlib.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <unistd.h>
#include <sys/un.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <netdb.h>

int main(int argc, char const *argv[])
{   
    if(argc < 3){
        printf("please input the host name and port\n");
        exit(1);
    }

    struct hostent *hostname;
    hostname = gethostbyname(argv[1]); //得到　hostname 
    if(hostname == NULL){
        printf("get hostname error\n");
        exit(-1);
    }

    int server_fd;
    int port;
    port = atoi(argv[2]);

    struct sockaddr_in serveraddr;
    serveraddr.sin_family = AF_INET;
    /* inet_addr 将字符串转换为int型数据 */
    serveraddr.sin_addr = *((struct in_addr *)hostname->h_addr);
    serveraddr.sin_port = htons(port);

    //建立socket
    server_fd = socket(AF_INET,SOCK_DGRAM,0);
    if(server_fd == -1){
        perror("socket error");
        exit(-1);
    }

    sendto(server_fd,"hello world",12,0,(struct sockaddr *)&serveraddr,sizeof(serveraddr));
    close(server_fd);
    
    return 0;
}
``` 