---
layout: post
title:  "portal认证的几种实现方式"
date:   2017-05-21 10:20:10
categories: network
tags: portal
---

* content
{:toc}

### 前言

最近一直在做portal认证相关的功能，今天想把我所了解的几种portal认证方式总结一下。首先申明本文中提到的portal认证的几种实现方式的名字都是我取的并非官方命名。当然除了我介绍的几种方式以外还有其他的方式，我这里只介绍我所了解的。

### 什么是portal认证

首先介绍一下什么是portal认证？我们经常在公共场所或者餐馆连接免费wifi时，通常在你第一次通过浏览器访问任意网页时会弹出一个页面，要求你通过微信或者短信等认证方式，认证之后才能访问外网，有时候手机连接公共wifi后会自动弹出认证页面。这个认证过程就叫做portal认证。

### 浏览器访问网页时做了哪些事

在介绍portal认证实现原理之前需要了解一下当我们在浏览器中输入一个网址的时候经过了哪些步骤才最终访问到网页的。
* DNS解析，当我们输入一个网址时，浏览器首先会发送一个DNS包来解析这个网址所在服务器的IP地址
* 得到IP地址之后，浏览器通过这个IP地址与网站的服务器建立一个TCP链接
* 最后通过这个TCP链接向服务器发送HTTP请求，服务器收到HTTP请求之后返回给浏览器指定的页面

portal认证就是基于上面的步骤，通过不同的方法来实现让用户访问任何页面都可以强制跳转到portal认证页面，认证之后才能正常上网。

### DNS欺骗

在portal认证设备（以下简称portal）上通常通过用户的IP地址和MAC地址来唯一标记一个用户。当用户设备访问外网发送数据包时，portal首先检查该数据包的用户是否经过认证，如果是没有认证的用户会进一步解析该数据包是什么类型的？除了DNS包之外的其他数据包全部会被丢弃。如果是DNS包，portal也不会让他通过，而是自己构造一个DNS回复包发送给用户，而这个回复包中包含的服务器IP地址是portal设备自己的IP地址。这样无论用户访问什么网页，都会和portal建立TCP连接，当用户在这个TCP连接上发送HTTP请求时，portal总是返回认证页面给用户。这样就实现了portal认证功能。

这种方式有个很大的缺点就是一般浏览器都会有DNS缓存和DNS预缓存机制，DNS缓存很好理解就是当浏览器访问一个不久前已经访问过的页面时，浏览器这次访问可能不会发送DNS来解析服务器的IP地址，而是直接使用之前缓存的IP地址，这就会导致用户访问这个页面时弹不出来portal认证页面。   
DNS预缓存机制就是浏览器为了用户访问网页速度更快，浏览器会自动发送DNS解析当前网页中所有链接对应的IP地址，当用户点击当前页面上的链接时就可以直接找到对应服务器的IP地址而省去了NDS解析这个时间。DNS预缓存这种机制也会对DNS欺骗这种portal认证方法带来很多问题，我这里就不细说了。这是我的老东家所采用的方法。

### HTTP请求302重定向

当用户访问网页时，portal会解析所有数据包，如果是DNS数据包直接放过，这样用户就可以得到正确的服务器IP地址，然后用户通过这个IP地址去和服务器建立TCP连接，portal也会放过TCP的握手包，这样用户就和服务器建立了正确的TCP链接，当用户发送HTTP请求时，portal捕获到是HTTP请求则不会直接放过或者丢弃这个数据包而是给用户返回一个302重定向请求，这个重定向的链接就是portal认证页面的链接。这样就实现了portal认证功能。

这种实现方式还有另一种稍微不一样的实现方法：就是当用户得到IP地址后和服务器建立TCP链接时，portal识别到这个TCP握手包时，将这个链接DNAT到portal自己的http服务器上，这样用户实际上是和portal建立了TCP链接，当用户发送HTTP请求还是发送302重定向请求，让用户去访问认证页面。

我觉得将链接DNAT到portal自己的http服务器这种实现方式更好，因为如果外网环境不好的话，用户与外网服务器建立TCP链接的过程可能非常缓慢甚至根本建立不起来，导致弹出portal页面很慢。但是我们公司是使用的第一种方式，我不知道是当时设计的时候没有考虑到第二种方式，还是出于其他的原因使用第一种方式。

### 手机自动弹出portal认证页面原理

我以前一直不知道手机是怎样自动弹出portal认证页面的，它怎么知道它连接的wifi是需要认证才能上网的。原来是因为手机在成功连接到一个wifi信号后会自动发送一个http请求给服务器，这个http请求的作用就是专门用来探测它连接的wifi是否可以访问外网的，portal捕获到该请求也会做相同的操作，所以当手机收到这个http请求的回复是一个302重定向的时候就自动弹出页面到认证页面。还有些手机当探测到这个http请求不能用并且也没有回复重定向请求时会自动切换其他wifi来连接。不得不说现在的智能手机做的太人性化了。

### 小科普

我们都知道网站分为两种类型的HTTP和HTTPS，HTTP使用的是80端口而HTTPS使用的是443，那么问题来了当我们在浏览器上输入一个网址的时候，
浏览器怎么知道它是HTTP还是HTTPS的，也就是说它怎么知道在哪个端口上建立TCP连接的？以前一直没想明白这个问题，
最近在做HTTP重定向的时候又想起来这个问题，然后做实验验证了一下。原来如果在浏览器中输入网址的时候如果没有明确指定使用HTTPS协议的时候，
浏览器默认为HTTP协议，但是当这个网站使用的是HTTPS的时候，网站服务器也会监听80端口，当收到HTTP请求的时候会直接返回一个重定向请求。
让浏览器在重新使用HTTPS去请求网站。
