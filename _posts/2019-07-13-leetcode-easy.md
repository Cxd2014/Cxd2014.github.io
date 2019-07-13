---
layout: post
title:  "Leetcode刷题"
date:   2019-07-13 10:20:10
categories: programming
tags: Leetcode
---

* content
{:toc}

### 前言

以前从来没有刷过LeetCode，这段时间想刷一些题目锻炼一下算法能力，我会将题目分为四类：  

* 看完题目之后就有思路能直接写出来的
* 看了别人的思路之后然后自己再写出来的
* 参考别人的代码才能写出来的
* 看了别人的代码花了很长时间才能理解的  

这篇文章主要记录前两类题目，以及大概的解题思路，另外两类还没开始做，以后会做一些比较典型的题目然后记录下来。

### 只出现一次的数字

```text
给定一个非空整数数组，除了某个元素只出现一次以外，其余每个元素均出现两次。找出那个只出现了一次的元素。

说明：

你的算法应该具有线性时间复杂度。 你可以不使用额外空间来实现吗？

示例 1:

输入: [2,2,1]
输出: 1
示例 2:

输入: [4,1,2,1,2]
输出: 4
```

```c++
class Solution {
public:
    int singleNumber(vector<int>& nums) {
        int n = 0;
        for(vector<int>::iterator iter = nums.begin(); iter != nums.end(); iter++)
        {
            n = n^(*iter);
        }
        return n;
    }
};
```

