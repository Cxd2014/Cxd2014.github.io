---
layout: post
title:  "Qt中遇到的小问题总结"
date:   2015-08-11 17:10:10
categories: programming
tags: Qt
---

* content
{:toc}

#### 给Qt软件添加软件图标

* 找到一张图片.ico，名字改为myappico.ico
* 创建一个新的文本文档，内部添加 IDI_ICON1 ICON DISCARDABLE "myappico.ico"，并将文件重命名为myapp.rc
* 在myapp.pro文件最后加上RC_FILE = myapp.rc，重新生成之后，就修改成功了 //只适用与windows，Ubuntu这样用无效




#### Qt发布写好的应用程序--动态链接 

* 打开Qt命令行界面

>开始菜单->Qt 5.3.1->5.4-->MinGW 4.8 (32-bit)->Qt 5.4 for Desktop (MinGW 4.8 32 bit)

* 以Release方式编译写好的应用程序
* 进入编译生成cxd.exe文件的目录
* 将cxd.exe文件复制到一个新的目录下，进入此目录

>cd         //打开目录

>dir        //显示目录下的文件

* 执行`windeployqt`命令

>windeployqt cxd.exe

命令执行后cxd.exe程序需要的所有动态链接库都复制到此目录下了，只需要打包发布就可以了


---

#### QMessageBox函数弹出的对话框出现中文乱码

* 在main函数里面加上一句

>QTextCodec::setCodecForTr(QTextCodec::codecForName("gbk"));

* 加上头文件`#include <QTextCodec>`

* 把要显示的中文用tr包起来

---
