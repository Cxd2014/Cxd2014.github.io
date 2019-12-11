---
layout: post
title:  "工作中常用的命令"
date:   2016-10-12 10:20:10
categories: others
tags: svn grep vi 命令
---

* content
{:toc}

### svn命令


命令|解释
---|---
svn co serverUrl | 到serverUrl服务器上下载代码
svn commit -m "log" filename | 将文件filename上传到服务器，"log"为修改日志
svn up -r versionNum | 回到指定版本号versionNum
svn revert filename | 恢复被删除的文件
svn diff filename | 查看文件的修改内容
svn log -r versionNum | 查看versionNum版本号下的修改日志记录
svn log -v . -r versionNum | 查看versionNum版本号下修改了哪些文件和日志记录
svn log --username name | 查看name用户所有上传的日志记录
svn info | 查看svn的版本号、服务器地址等信息

### vi编辑器常用命令

命令|解释
---|---
i | 进入编辑模式
Esc键 | 退出编辑模式，
k | 光标上移一行
j | 光标下移一行 
h | 左移一个字符
l | 右移一个字符
x或X | 删除一个字符，x删除光标后的，X删除光标前的 
dd | 删除光标所在的行
dw | 删除光标后的一个单词
yy | 复制光标所在行
p | 粘贴
Ctrl+u | 向文件首翻半屏 
Ctrl+d | 向文件尾翻半屏 
/text + Enter键 | 查找'text'字符串
n | 查找下一个'text'字符串
N | 查找上一个'text'字符串
Shift键 + : | 进入尾行模式（在命令行模式下）
:wq | 保存并退出
:q! | 不保存并退出
set enc=utf8 | 设置编码为utf8


### grep命令

1. 在Makefile文件中查找"MAKEFLAGS"字符串

    ```
        grep -n "MAKEFLAGS" Makefile
    ```

2. 在当前目录下的所有文件中查找"LUN_FAILED"字符串

    ```
	   grep -rn "LUN_FAILED" ./
    ```

3. 在当前目录下的.c和.h文件中查找"LUN_FAILED"字符串

    ```
	   grep -rn "LUN_FAILED" ./ --include *.[c,h]
    ```

4. 在当前目录下的所有文件（但排除.h文件）中查找"CONFIG_TIMERFD"字符串

    ```
        grep -rn "CONFIG_TIMERFD" ./ --exclude *.h
    ```

5. 排除ac_cloud目录

    ```
        grep -rn "main" ./ --exclude-dir ac_cloud
    ```

6. 将所有文件中的"LOGDEBUG"字符串替换为"LOGDEBUG_CXD"

    ```
    sed -i s/LOGDEBUG/LOGDEBUG_CXD/g `grep LOGDEBUG -rl --include="*.cpp" ./`
    ```

7. 批量将文件后缀为".cc"修改为".cpp"

    ```
    rename 's/\.cc/\.cpp/' * `find . -name "*.cc"`
    ```

8. 查找文本文件并显示命中字符的上一行和下一行

    ```
    grep -rnI 'main' ./ -C 1
    ```

### tcpdump命令

命令|解释
---|---
`tcpdump -i eth3` | 抓取指定网卡的数据包
`tcpdump -i eth3 host 192.168.42.1` | 抓取指定IP地址的数据包
`tcpdump -i eth3 port 1111` | 抓取指定端口号的数据包
`tcpdump -i eth3 host 192.168.42.1 and port 1111` | 抓取地址IP地址和端口号的数据包
`tcpdump -i eth3 udp`  | 抓取UDP/TCP协议的数据包
`tcpdump -i eth3 udp port 1111` | 抓取UDP协议并指定端口号
`tcpdump -i eth3 udp -c 10` | 抓取10个UDP协议的数据包
`tcpdump -i eth3 udp -w ./data.cap` | 抓取UDP协议数据并输出为Wireshark格式的文件  
`tcpdump -nn -i eth1 -Xps0 udp and host 10.100.73.38` | 显示包的所有数据
`tcpreplay -i eth1 -l 100 -p 1 huifang.pcap` | 回放包

注：按`ctrl + c`结束抓取数据包，并保存数据

### ifconfig命令

命令|解释
---|---
ifconfig eth3 up   | 启动eth3网卡
ifconfig eth3 down | 关闭eth3网卡
ifconfig eth3 192.168.1.123 | 修改IP地址
ifconfig eth3 192.168.1.123 netmask 255.255.255.0 | 修改IP地址和子网掩码
ifconfig eth3 hw ether 00:AA:BB:CC:dd:EE | 修改MAC地址

### 常用

命令|解释
---|---
du -ah --max-depth=1 \| sort -rn   | 查看目录占有空间并排序
df -h | 查看磁盘使用情况
ps -p 3201 -o lstart,etime | 查看指定进程启动时间和运行时间
lsof -p 27432 | 查看进程打开的描述符
losf -a fielname | 查看文件fielname被哪些进程打开 
losf -i udp | 查看所有打开的UDP套接字
lsof -i :49873 | 查看哪个进程在使用端口号49873
nm -lC main | 查看符号并显示该符号在文件中的位置
ar -t libcomm_oi.a | 查看静态库中包含的文件
ldd main | 查看程序需要的共享库
split -l 5 main.cpp -d -a 2 sp_ | 按行分割文件并按数字顺序命名
