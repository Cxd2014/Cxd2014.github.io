---
layout: post
title:  "Leetcode刷题二"
date:   2019-07-16 10:20:10
categories: programming
tags: Leetcode
---

* content
{:toc}

### 前言

这里主要记录的是做不出来需要参考别人答案的题目。

### 分割回文串

给定一个字符串 s，将 s 分割成一些子串，使每个子串都是回文串。  
返回 s 所有可能的分割方案。  

示例:  
输入: "aab"  
输出:  
[  
  ["aa","b"],  
  ["a","a","b"]  
]  

```c++
/*  思路：递归回溯，先找出一个回文串，然后在剩下的字符串中递归查找回文串
*/
class Solution {
public:
    
    bool isPalindrome(string s, int start, int end) 
    {
        while (start < end) 
        {
            if (s[start] != s[end])
                return false;
            
            start++;
            end--;
        }
        return true;
    }
    
    void checker(vector<vector<string>> &res, vector<string> &temp, string s, int start)
    {
        if (start == s.length())
        {
            res.push_back(temp);    
        }
        
        for(int i = start; i < s.length(); i++)
        {
            if (isPalindrome(s, start, i))
            {
                temp.push_back(s.substr(start, (i + 1 - start)));
                checker(res, temp, s, i + 1);
                temp.pop_back();
            }
        }
    }
    
    vector<vector<string>> partition(string s) {
        vector<vector<string>> result;
        vector<string> temp;
        checker(result, temp, s, 0);
        return result;
    }
};
```

### 单词拆分II

给定一个非空字符串 s 和一个包含非空单词列表的字典 wordDict，在字符串中增加空格来构建一个句子，使得句子中所有的单词都在词典中。返回所有这些可能的句子。

说明：  
分隔时可以重复使用字典中的单词。  
你可以假设字典中没有重复的单词。  

示例 1：  
```
输入:
s = "catsanddog"
wordDict = ["cat", "cats", "and", "sand", "dog"]
输出:
[
  "cats and dog",
  "cat sand dog"
]
```

示例 2：  
```
输入:
s = "pineapplepenapple"
wordDict = ["apple", "pen", "applepen", "pine", "pineapple"]
输出:
[
  "pine apple pen apple",
  "pineapple pen apple",
  "pine applepen apple"
]
解释: 注意你可以重复使用字典中的单词。
```

示例 3：  
```
输入:
s = "catsandog"
wordDict = ["cats", "dog", "sand", "and", "cat"]
输出:
[]
```

解法一：这题也可以通过上面分割回文串的方法来解，只是把判断回文串改成判断字符串是不是在字典中，但是这种解法在一些特殊用例下LeetCode报超时了。

```c++
class Solution {
public:
    unordered_set<string> setStr;
    void checker(vector<string> &res, vector<string> &temp, string s, int start)
    {
        if (start == s.length())
        {
            string str;
            for(auto it : temp)
            {
                str = str + it + " ";
            }
            str[str.length() - 1] = '\0';
            res.push_back(str);
        }
        
        for(int i = start; i < s.length(); i++)
        {
            if (setStr.find(s.substr(start, (i + 1 - start))) != setStr.end())
            {
                temp.push_back(s.substr(start, (i + 1 - start)));
                checker(res, temp, s, i + 1);
                temp.pop_back();
            }
        }
    }
    
    vector<string> wordBreak(string s, vector<string>& wordDict) {
        
        for (auto iter : wordDict)
        {
            setStr.insert(iter);
        }
        
        vector<string> result;
        vector<string> temp;
        checker(result, temp, s, 0);
        return result;
    }
};
```
解法二：动态规划加回溯，相比将上面的解法改动点就是判断条件中多加了一个如果接下来的字符不能使结果增加则不再继续遍历
```c++
class Solution {
public:
    unordered_set<string> setStr;

    void checker(vector<string> &res, vector<string> &temp, string s, int start, vector<bool> &dp)
    {
        if (start == s.length())
        {
            string str;
            for(auto it : temp)
            {
                str = str + it + " ";
            }
            str[str.length() - 1] = '\0';
            res.push_back(str);
        }

        for(int i = start; i < s.length(); i++)
        {
            if (setStr.find(s.substr(start, (i + 1 - start))) != setStr.end() && dp[i + 1])
            {
                int oldSize = res.size();
                temp.push_back(s.substr(start, (i + 1 - start)));
                checker(res, temp, s, i + 1, dp);
                if (res.size() == oldSize) dp[i + 1] = false;
                temp.pop_back();
            }
        }
    }
    
    vector<string> wordBreak(string s, vector<string>& wordDict) {
        
        for (auto iter : wordDict)
        {
            setStr.insert(iter);
        }

        vector<bool> dp(s.size() + 1, true);

        vector<string> result;
        vector<string> temp;
        checker(result, temp, s, 0, dp);
        return result;
    }
};
```

### 单词拆分

给定一个非空字符串 s 和一个包含非空单词列表的字典 wordDict，判定 s 是否可以被空格拆分为一个或多个在字典中出现的单词。

说明：  
拆分时可以重复使用字典中的单词。  
你可以假设字典中没有重复的单词。  

```c++
/*  思路：动态规划
*/
class Solution {
public:
    bool wordBreak(string s, vector<string>& wordDict) {
        int n = s.size();
        vector<bool> dp(n + 1, false);

        unordered_set<string> setStr;
        for (auto &s : wordDict)
            setStr.insert(s);

        dp[0] = true;
        for (int i = 1; i <= n; i++)
        {
            for (int j = i; j > 0; j--)
            {
                if (dp[j - 1] == false)
                    continue;

                if (setStr.find(s.substr(j - 1, i - j + 1)) != setStr.end())
                {
                    dp[i] = true;
                    break;
                }
            }
        }
        return dp[n];
    }
};
```

### 乘积最大子序列

给定一个整数数组 nums ，找出一个序列中乘积最大的连续子序列（该序列至少包含一个数）。

示例 1:  
输入: [2,3,-2,4]  
输出: 6  
解释: 子数组 [2,3] 有最大乘积 6。  

```c++
/*  思路：动态规划，当前最大乘积等于前一个最大乘积乘以当前数，因为要有负数，所以要考虑最小值
*/
class Solution {
public:
    int maxProduct(vector<int>& nums) {
        int size = nums.size();
        int maxNum = nums[0];
        
        int max[size] = {0};
        int min[size] = {0};
        
        max[0] = nums[0];
        min[0] = nums[0];
        
        for (int i = 1; i < size; i++)
        {
            min[i] = fmin(fmin(min[i - 1] * nums[i], max[i - 1] * nums[i]), nums[i]);
            max[i] = fmax(fmax(max[i - 1] * nums[i], min[i - 1] * nums[i]), nums[i]);
            maxNum = fmax(maxNum, max[i]);
        }
        
        return maxNum;
    }
};
```

### 基本计算器 II

实现一个基本的计算器来计算一个简单的字符串表达式的值。  
字符串表达式仅包含非负整数，+， - ，*，/ 四种运算符和空格  。 整数除法仅保留整数部分。  

```c++
/*  思路：开一个栈专门存放数字，如果该数字之前的符号是加或减，那么把当前数字压入栈中，注意如果是减号，则加入当前数字的负数
    如果之前的符号是乘或除，那么从栈顶取出一个数字和当前数字进行乘或除的运算，再把结果压入栈中，最后遍历一遍栈的数据相加
*/
class Solution {
public:
    int calculate(string s) {
        
        long res = 0, d = 0;
        char sign = '+';
        stack<int> nums;
        for (int i = 0; i < s.size(); ++i) {
            if (s[i] >= '0') {
                d = d * 10 + s[i] - '0';
            }
            if ((s[i] < '0' && s[i] != ' ') || i == s.size() - 1) {
                if (sign == '+') nums.push(d);
                if (sign == '-') nums.push(-d);
                if (sign == '*' || sign == '/') {
                    int tmp = sign == '*' ? nums.top() * d : nums.top() / d;
                    nums.pop();
                    nums.push(tmp);
                }
                sign = s[i];
                d = 0;
            }
        }
        while (!nums.empty()) {
            res += nums.top();
            nums.pop();
        }
        return res;
    }
};
```
