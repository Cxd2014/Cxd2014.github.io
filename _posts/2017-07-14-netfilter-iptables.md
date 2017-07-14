---
layout: post
title:  "Netfilter/iptables简介"
date:   2017-07-14 10:20:10
categories: network
tags: Netfilter iptables
---

* content
{:toc}

### Netfilter的命令结构

Netfilter将规则分为表和链两种结构，不同的表对应着Netfilter的不同功能，不同的链对应着数据包不同的获取位置。目前Netfilter有四种表分别是：filter、nat、mangle和raw表。每个表对应着对数据包的不同操作：

* filter：filter是Netfilter中最重要的机制，其任务是执行数据包的过滤操作，也就是起到防火墙的作用。
* nat：nat(Network Address Translation，NAT)也就是网络地址转换，其任务是执行数据包的IP地址转换工作。
* mangle：mangle是一个很特殊的机制，其功能是可以修改数据包的内容。
* raw：负责加快数据包穿过防火墙机制的速度，由此提高防火墙的性能。

然后每个表中又分为不同的链，如图1不同表所支持的链：   
![1]({{"/css/pics/netfilter/1.png"}})  

目前Netfilter总共有5种链：PREROUTING、INPUT、FORWARD、OUTPUT、POSTROUTING。代表着可以从五个不同的地方获取数据包：

* PREROUTING类型：外部进来的包，刚被网卡接收，还没有做路由决策的数据包。
* INPUT类型：外部进来的包，路由决策之后，发往本机的数据包。
* FORWARD类型：外部进来的包，路由决策之后，需要前送的数据包。
* OUTPUT类型：本机产生需要向外发送的数据包。
* POSTROUTING类型：路由决策之后，向外发送的数据包。

![2]({{"/css/pics/netfilter/2.gif"}}) 

### Netfilter与iptables的关系

Netfilter所需要的规则是存放在内存中的，防火墙管理人员会需要一个规则编辑工具，通过这个工具来对内存中的规则执行添加、删除及修改等操作，这个工具就是iptables以及ip6tables，其中iptables是在IPV4网络环境中使用，而ip6tables是在IPV6网络环境中使用，因此Netfilter是防火墙的规则执行者，而iptables是规则编辑工具。

当我们将规则传给iptables工具时，iptables工具会先检查语法是否正确，如果不正确，则iptables工具会显示语法错误警告信息；反之，iptables就会把这些规则写入到规则数据库中，然后加载Netfilter中执行此规则所需要的内核模块。

### iptables命令参数

* iptables的命令结构
    ```
    iptables -t TABLE -操作方式 规则条件
    ```

![3]({{"/css/pics/netfilter/3.png"}}) 

### 示例命令

1. 将进入到本机的ICMP报文全部丢弃，禁ping
    ```
    iptables -t filter -A INPUT -p icmp -j DROP
    ```

2. 在INPUT链中第二条规则位置插入一条规则
    ```
    iptables -t filter -I INPUT 2 -p tcp -j ACCEPT
    ```

3. 删除INPUT链中的第二条规则
    ```
    iptables -t filter -D INPUT 2
    ```

4. 将192.168.0.200进入本机的icmp协议包都丢弃
    ```
    iptables -A INPUT -p icmp -s 192.168.0.200 -j DROP
    ``` 

5. 不允许192.168.0.200主机通过本机的DNS服务来执行域名解析
    ```
    iptables -A INPUT -p udp -s 192.168.0.200 --dport 53 -j REJECT
    ```

6.  允许192.168.1.0/24网段的主机向本机192.168.0.1提出任何服务请求
    ```
    iptables -A INPUT -p all -s 192.168.1.0/24 -d 192.168.0.1 -j ACCEPT
    ```

7. 允许客户端主机从eth1这个接口访问本机的SSH服务
    ```
    iptables -A INPUT -p tcp -i eth1 --dport 22 -j ACCEPT
    ```

8.  不允许本机的应用程序从eth0接口发送数据包去访问edu.uuu.com.tw以外的网站
    ```
    iptables -A OUTPUT -o eth0 -p tcp -d ! edu.uuu.com.tw --dport 80 -j REJECT
    ```

9. 不允许本企业内部的主机访问企业以外的任何网站
    ```
    iptables -A FORWARD -i eth1 -o eth0 -p tcp --dport 80 -j DROP
    ```

10. 将FORWARD链的默认策略设置为DROP
    ```
    iptables -t filter -P FORWARD DROP
    ```
    