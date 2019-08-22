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

### 计算右侧小于当前元素的个数

给定一个整数数组 nums，按要求返回一个新数组 counts。数组 counts 有该性质： counts[i] 的值是  nums[i] 右侧小于 nums[i] 的元素的数量。

```c++
/*  思路：将数组倒序插入到二叉树中，记录每个节点左边的子节点数量。
*/
class Solution {
    struct Node {
        shared_ptr<Node> left;
        shared_ptr<Node> right;
        int val;
        int count = 0; // 左子树节点的个数
        Node(int val) : val(val) {}
    };
public:
    vector<int> countSmaller(vector<int>& nums) {
        shared_ptr<Node> root;
        vector<int> res(nums.size());
        for (int i = nums.size() - 1; i >= 0; --i) {
            root = insert(root, nums[i], &res, i);
        }
        return res;
    }
    
    shared_ptr<Node> insert(shared_ptr<Node> root, int val, vector<int>* res, int index) {
        if (!root) {
             return make_shared<Node>(val);
        }
        auto& r = *res;
        if (val <= root->val) {
            root->count++;
            root->left = insert(root->left, val, res, index);
        } else {
            r[index] += root->count + 1;
            root->right = insert(root->right, val, res, index);
        }
        return root;
    }
};
```

### 打家劫舍

你是一个专业的小偷，计划偷窃沿街的房屋。每间房内都藏有一定的现金，影响你偷窃的唯一制约因素就是相邻的房屋装有相互连通的防盗系统，如果两间相邻的房屋在同一晚上被小偷闯入，系统会自动报警。  
给定一个代表每个房屋存放金额的非负整数数组，计算你在不触动警报装置的情况下，能够偷窃到的最高金额。

```c++
/*
    动态规划方程：dp[i] = max(dp[i-2]+nums[i], dp[i-1])
*/
class Solution {
public:
    int rob(vector<int>& nums) {
        if(nums.size() <= 1){
            return nums.size() == 0 ? 0 : nums[0];
        }

        vector<int> dp(nums.size(), 0);
        dp[0] = nums[0];
        dp[1] = max(nums[0], nums[1]);
        for(int i = 2; i < nums.size(); i++){
            dp[i] = max(dp[i-2] + nums[i], dp[i-1]);
        }
        return dp[nums.size() - 1];
    }
};
```

### LRU缓存机制

运用你所掌握的数据结构，设计和实现一个  LRU (最近最少使用) 缓存机制。它应该支持以下操作： 获取数据 get 和 写入数据 put 。  
获取数据 get(key) - 如果密钥 (key) 存在于缓存中，则获取密钥的值（总是正数），否则返回 -1。  
写入数据 put(key, value) - 如果密钥不存在，则写入其数据值。当缓存容量达到上限时，它应该在写入新数据之前删除最近最少使用的数据值，从而为新的数据值留出空间。  

```c++
/*
    用一个双向链表存放KV，一个Map存放K对应V的位置，每次get将得到的KV重新放到链表的头部，
    每次put，如果超过最大缓存限制，则删除链表的最后一个KV，然后将入到头部。
*/
class LRUCache {
public:
    int cap;
    list<pair<int, int>> DoubleList;
    unordered_map<int, list<pair<int, int>>::iterator> hashMap;
        
    LRUCache(int capacity) {
        cap = capacity;
    }
    
    int get(int key) {
        auto iter = hashMap.find(key);
        if (iter != hashMap.end())
        {
            pair<int, int> kv = *hashMap[key];
            DoubleList.erase(hashMap[key]);
            DoubleList.push_front(kv);
            hashMap[key] = DoubleList.begin();
                
            return kv.second;
        }
        return -1;
    }
    
    void put(int key, int value) {
        
        auto iter = hashMap.find(key);
        if (iter == hashMap.end())
        {
            if (hashMap.size() >= cap)
            {
                auto lastPair = DoubleList.back();
                int lastKey = lastPair.first;
                hashMap.erase(lastKey);
                DoubleList.pop_back();
            }
            
            DoubleList.push_front(make_pair(key,value));
            hashMap[key] = DoubleList.begin();
        }
        else
        {
            DoubleList.erase(hashMap[key]);
            DoubleList.push_front(make_pair(key, value));
            hashMap[key] = DoubleList.begin();
        }
    }
};
```

### 岛屿数量

给定一个由 '1'（陆地）和 '0'（水）组成的的二维网格，计算岛屿的数量。一个岛被水包围，并且它是通过水平方向或垂直方向上相邻的陆地连接而成的。你可以假设网格的四个边均被水包围。

```c++
/*
    深度优先搜索，把所有相邻的1置为0。
*/
class Solution
{
    void dfs(vector<vector<char>> &grid, int r, int c)
    {
        int nr = grid.size();
        int nc = grid[0].size();
        
        grid[r][c] = '0';
        if (r - 1 >= 0 && grid[r - 1][c] == '1')
            dfs(grid, r - 1, c);
        if (r + 1 < nr && grid[r + 1][c] == '1')
            dfs(grid, r + 1, c);
        if (c - 1 >= 0 && grid[r][c - 1] == '1')
            dfs(grid, r, c - 1);
        if (c + 1 < nc && grid[r][c + 1] == '1')
            dfs(grid, r, c + 1);
    }

public:
    int numIslands(vector<vector<char>> &grid)
    {
        int nr = grid.size();
        if (!nr)
            return 0;
        int nc = grid[0].size();

        int num_islands = 0;
        for (int r = 0; r < nr; ++r)
        {
            for (int c = 0; c < nc; ++c)
            {
                if (grid[r][c] == '1')
                {
                    ++num_islands;
                    dfs(grid, r, c);
                }
            }
        }
        return num_islands;
    }
};
```

### 岛屿的最大面积

给定一个包含了一些 0 和 1的非空二维数组 grid , 一个 岛屿 是由四个方向 (水平或垂直) 的 1 (代表土地) 构成的组合。你可以假设二维矩阵的四个边缘都被水包围着。  
找到给定的二维数组中最大的岛屿面积。(如果没有岛屿，则返回面积为0。)

```c++
/* 在上题的计算岛屿数量中加一个面积计数，找出最大值 */
class Solution {
    void dfs(vector<vector<int>> &grid, int r, int c, int &count)
    {
        count ++;
        int nr = grid.size();
        int nc = grid[0].size();
        
        grid[r][c] = 0;
        if (r - 1 >= 0 && grid[r - 1][c] == 1)
            dfs(grid, r - 1, c, count);
        if (r + 1 < nr && grid[r + 1][c] == 1)
            dfs(grid, r + 1, c, count);
        if (c - 1 >= 0 && grid[r][c - 1] == 1)
            dfs(grid, r, c - 1, count);
        if (c + 1 < nc && grid[r][c + 1] == 1)
            dfs(grid, r, c + 1, count);
    }
    
public:
    int maxAreaOfIsland(vector<vector<int>>& grid) {
        int nr = grid.size();
        if (!nr)
            return 0;
        int nc = grid[0].size();

        int count = 0;
        int res = 0;
        for (int r = 0; r < nr; ++r)
        {
            for (int c = 0; c < nc; ++c)
            {
                if (grid[r][c] == 1)
                {
                    dfs(grid, r, c, count);
                    res = max(res, count);
                    count = 0;
                }
            }
        }
        return res;
    }
};
```

### 全 O(1) 的数据结构

实现一个数据结构支持以下操作：  
Inc(key) - 插入一个新的值为 1 的 key。或者使一个存在的 key 增加一，保证 key 不为空字符串。  
Dec(key) - 如果这个 key 的值是 1，那么把他从数据结构中移除掉。否者使一个存在的 key 值减一。如果这个 key 不存在，这个函数不做任何事情。key 保证不为空字符串。  
GetMaxKey() - 返回 key 中值最大的任意一个。如果没有元素存在，返回一个空字符串""。  
GetMinKey() - 返回 key 中值最小的任意一个。如果没有元素存在，返回一个空字符串""。  
挑战：以 O(1) 的时间复杂度实现所有操作。  

```c++
/*
思路关键是数据结构的设置，用双向链表存放数据，并且将值相同的key存放到同一个List节点下，用map索引List的节点位置
*/
class AllOne {
public:
    list<pair<int, set<string>>> DoubleList;
    unordered_map<string, list<pair<int, set<string>>>::iterator> hashMap;
    /** Initialize your data structure here. */
    AllOne() {
    }
    /** Inserts a new key <Key> with value 1. Or increments an existing key by 1. */
    void inc(string key) {
        auto iter = hashMap.find(key);
        if (iter != hashMap.end())
        {
            int count = iter->second->first + 1;
            iter->second->second.erase(key);
            auto ListIter = iter->second;
            iter->second++;
            if (iter->second != DoubleList.end() && iter->second->first == count)
            {
                iter->second->second.insert(key);
                hashMap[key] = iter->second;
            }
            else
            {
                set<string> setStr;
                setStr.insert(key);
                hashMap[key] = DoubleList.insert(iter->second, make_pair(count, setStr));
            }
            if (ListIter->second.size() == 0)
                DoubleList.erase(ListIter);
        }
        else
        {
            auto iter = DoubleList.begin();
            if (iter != DoubleList.end() && iter->first == 1)
            {
                iter->second.insert(key);   
                hashMap[key] = DoubleList.begin();
            }
            else
            {
                set<string> setStr;
                setStr.insert(key);
                DoubleList.push_front(make_pair(1, setStr));
                hashMap[key] = DoubleList.begin();
            }
        }
    }
    /** Decrements an existing key by 1. If Key's value is 1, remove it from the data structure. */
    void dec(string key) {
        auto iter = hashMap.find(key);
        if (iter != hashMap.end())
        {
            auto ListIter = iter->second;
            int count = iter->second->first - 1;
            if (iter->second == DoubleList.begin())
            {
                if (iter->second->first == 1)
                {
                    iter->second->second.erase(key);
                    hashMap.erase(key);
                }
                else
                {
                    set<string> setStr;
                    setStr.insert(key);
                    DoubleList.push_front(make_pair(count, setStr));
                    hashMap[key] = DoubleList.begin();
                }
            }
            else
            {
                iter->second->second.erase(key);
                iter->second--;
                if (iter->second->first == count)
                {
                    iter->second->second.insert(key);
                    hashMap[key] = iter->second;
                }
                else
                {
                    set<string> setStr;
                    setStr.insert(key);
                    hashMap[key] = DoubleList.insert(ListIter, make_pair(count, setStr));
                } 
            }
            if (ListIter->second.size() == 0)
                DoubleList.erase(ListIter);
        }
    }
    /** Returns one of the keys with maximal value. */
    string getMaxKey() {
        if (DoubleList.size() > 0)
            return *(DoubleList.back().second.begin());
        return "";
    }
    /** Returns one of the keys with Minimal value. */
    string getMinKey() {
        if (DoubleList.size() > 0)
            return *(DoubleList.begin()->second.begin());
        return "";
    }
};
```

### 买卖股票的最佳时机

给定一个数组，它的第 i 个元素是一支给定股票第 i 天的价格。  
如果你最多只允许完成一笔交易（即买入和卖出一支股票），设计一个算法来计算你所能获取的最大利润。  
注意你不能在买入股票前卖出股票。  

```c++
/* 动态规划问题，计算波峰到波谷的最大高度差 */
class Solution {
public:
    int maxProfit(vector<int>& prices) {
        int last = 0, profit = 0;
        for (int i = 0; i < prices.size() - 1; ++i) {
            last = max(0, last + prices[i+1] - prices[i]);
            profit = max(profit, last);
        }
        return profit;
    }
};
```

### 买卖股票的最佳时机 II

给定一个数组，它的第 i 个元素是一支给定股票第 i 天的价格。  
设计一个算法来计算你所能获取的最大利润。你可以尽可能地完成更多的交易（多次买卖一支股票）。  
注意：你不能同时参与多笔交易（你必须在再次购买前出售掉之前的股票）。  

```c++
/* 动态规划问题，只要是上升时期都加起来 */
class Solution {
public:
    int maxProfit(vector<int>& prices) {
        int res = 0;
        for (int i = 1; i < prices.size(); ++i) {
            if (prices[i] > prices[i - 1])
                res = res + (prices[i] - prices[i - 1]);
        }
        return res;
    }
};
```

### 最大子序和

给定一个整数数组 nums ，找到一个具有最大和的连续子数组（子数组最少包含一个元素），返回其最大和。

```c++
/* 动态规划问题，dp[i] = max(nums[i], dp[i - 1] + nums[i]) */
class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        int res = INT_MIN;
        int sum = -1;
        for(int i = 0; i < nums.size(); ++i)
        {
            sum = max(nums[i], sum + nums[i]);
            res = max(sum, res);
        }
        return res;
    }
};
```

### test
