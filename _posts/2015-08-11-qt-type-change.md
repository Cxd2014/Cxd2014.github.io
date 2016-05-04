---
layout: post
title:  "Qt中各种数据类型之间的相互转换"
date:   2015-08-11 16:40:10
categories: Qt
tags: Qt 类型转换
---

* content
{:toc}


#### QString 转 int
    QString str = "12";  
    bool ok;  
    int hex = str.toInt(&ok, 16);       // 以16进制的形式转换 hex = 18  
    int dec = str.toInt(&ok, 10);       // 以10进制的形式转换 dec = 12  

#### QString 转 Double
    QString str = "1234.56";  
    double val = str.toDouble();   // val == 1234.56 

#### QString 转 Float
    QString str1 = "1234.56";  
    str1.toFloat();             // returns 1234.56  

#### 将数字转化为QString
    long a = 63;  
    QString s = QString::number(a, 16);               // s == "3f"  
    QString t = QString::number(a, 16).toUpper();     // t == "3F"  

#### Double、float、int 转 QString 
    QString mon = QString("%1").arg(temp); //将temp转化字符串

#### QString 中取出字符串 
    QString x = "Nine pineapples";  
    QString y = x.mid(5, 4);            // y == "pine"  
    QString z = x.mid(5);               // z == "pineapples"  

#### 将字符串放到另一个字符串中间
    QString i;           // current file's number  
    QString total;       // number of files to process  
    QString fileName;    // current file's name  
      
    QString status = QString("Processing file %1 of %2: %3").arg(i).arg(total).arg(fileName);  
    //First, arg(i) replaces %1. Then arg(total) replaces %2. Finally, arg(fileName) replaces %3.  

#### 求字符串的长度
    QString str = "cxd";  
    int i = str.legth(); // i =3 

#### 清空字符串
    str.clear(); 

#### 字符串结合 
    QString x = "free";  
    QString y = "dom";  
    x.append(y);   //x == "freedom"  

#### 替换字符串 
    QString str = "colour behaviour flavour neighbour";  
    str.replace(QString("ou"), QString("o"));  
    // str == "color behavior flavor neighbor" 

#### QByteArray转QString 
    QByteArray Data;
    QString S = QString::fromAscii(Data.data());

#### QByteArray转int
    QByteArray Data;                       //Data = ONP00001
    QString Qnum = QString(Data.mid(5,3)); //Qnum = "001"
    int Inum = Qnum.toInt();               //Inum = 1


