---
layout: post
title:  "负载均衡中的加权轮询算法"
date:   2019-08-29 10:20:10
categories: programming
tags: weighted round robin
---

* content
{:toc}

### 加权轮询算法的步骤

1. 当前权重初始化为0。
2. 每个节点，用它们的当前权重值加上它们自己的权重。
3. 选择当前权重值最大的节点为选中节点，并把它的当前权重值减去所有节点的权重总和。

下面是用C++实现的加权轮询算法：

```c++
#include <iostream>
#include <vector>
#include <string>
using namespace std;

struct IpWeight
{
    string ip;
    int current;// 当前权重
    int weight; // 设置的权重
};

int getIp(vector<struct IpWeight> &vecIpWeight)
{
    int max = 0;
    int totalWeight = 0;
    int index = 0;

    for (int i = 0; i < vecIpWeight.size(); i++)
    {
        totalWeight = totalWeight + vecIpWeight[i].weight; // 计算总权重

        /* 当前权重 = 当前权重 + 设置的权重 */
        vecIpWeight[i].current = vecIpWeight[i].current + vecIpWeight[i].weight;

        /* 找到当前权重最大的节点 */
        if (vecIpWeight[i].current > max)
        {
            max = vecIpWeight[i].current;
            index= i;
        }
    }

    /* 将选中节点的当前权重减去总权重 */
    vecIpWeight[index].current = vecIpWeight[index].current - totalWeight;
    return index;
}

int main()
{
    vector<struct IpWeight> vecIpWeight(5);
    for (int i = 0; i < vecIpWeight.size(); i++)
    {
        vecIpWeight[i].ip = 'a' + i;
        vecIpWeight[i].weight = i + 1;
        cout << vecIpWeight[i].ip << ":" << vecIpWeight[i].weight << ":" << vecIpWeight[i].current << endl;
    }

    for (int i = 0; i < 15; i++)
    {
        int index = getIp(vecIpWeight);
        cout << vecIpWeight[index].ip << " ";
    }
    cout << endl;
    return 0;
}
/*
权重分配：
    a:1:0
    b:2:0
    c:3:0
    d:4:0
    e:5:0

输出结果:  
    d c b e d a e c d e b c d e
*/
```

负载均衡组件中使用这种算法的原因是使机器调度更加均匀、平滑，可以看到最后的计算结果是按照权重均匀分布的。  
每次查找节点的算法复杂度为O(n)，并且节点的出现顺序是按照一个固定的顺序循环出现的。  
实际的负载均衡组件中应该是计算出这个最小循环数组，然后不停的反复遍历就行，这样获取节点的复杂度为O(1)。

### 参考

更详细的的算法解释参考：  
[nginx平滑的基于权重轮询算法分析](https://tenfy.cn/2018/11/12/smooth-weighted-round-robin/)
