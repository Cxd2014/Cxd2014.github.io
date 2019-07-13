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

这篇文章主要记录前两类题目，以及大概的解题思路，当然有些题目不是最优解，只是我觉得最容易想到和理解的解，但是肯定是通过了LeetCode所有测试用例的。  

### 只出现一次的数字

给定一个非空整数数组，除了某个元素只出现一次以外，其余每个元素均出现两次。找出那个只出现了一次的元素。

说明：
你的算法应该具有线性时间复杂度。 你可以不使用额外空间来实现吗？

示例 1:
输入: [2,2,1]
输出: 1

示例 2:
输入: [4,1,2,1,2]
输出: 4

```c++
/*  思路：利用异或运算，两个相同的数异或之后为0，0与一个数异或还是它自己，
    所以只需要将数组中的所有异或一次，最后得到的数就是那个只出现一次的数
*/
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

### 求众数

给定一个大小为 n 的数组，找到其中的众数。众数是指在数组中出现次数大于 ⌊ n/2 ⌋ 的元素。  
你可以假设数组是非空的，并且给定的数组总是存在众数。

示例 1:  
输入: [3,2,3]  
输出: 3  

示例 2:  
输入: [2,2,1,1,1,2,2]  
输出: 2

```c++
/*  思路：遍历一遍数组放到map中计数，然后遍历map，找到众数，复杂度为O(n)
*/
class Solution {
public:
    int majorityElement(vector<int>& nums) {
        map<int,int> mapCount;
        for(vector<int>::iterator iter = nums.begin(); iter != nums.end(); iter++)
        {
            map<int,int>::iterator iMap = mapCount.find(*iter);
            if (iMap == mapCount.end())
            {
                mapCount[*iter] = 1;
            }
            else
            {
                iMap->second++;
            }
        }
        
        for (map<int,int>::iterator iter = mapCount.begin(); iter != mapCount.end(); iter++)
        {
            if (iter->second > nums.size()/2)
                return iter->first;
        }
        return 0;
    }
};
```

### 搜索二维矩阵 II

编写一个高效的算法来搜索 m x n 矩阵 matrix 中的一个目标值 target。该矩阵具有以下特性：  
每行的元素从左到右升序排列。  
每列的元素从上到下升序排列。  

示例:  
现有矩阵 matrix 如下：

```text
[
  [1,   4,  7, 11, 15],
  [2,   5,  8, 12, 19],
  [3,   6,  9, 16, 22],
  [10, 13, 14, 17, 24],
  [18, 21, 23, 26, 30]
]
```

给定 target = 5，返回 true。  
给定 target = 20，返回 false。

```c++
/*  思路：倒序遍历每一行，找到前一个数大于target，后一个数小于target的位置，
    然后从这个位置开始在倒序遍历下一行，直到找到target。
*/
class Solution {
public:
    bool searchMatrix(vector<vector<int>>& matrix, int target) {
        
         if (matrix.size() == 0)
            return false;
        
        vector<int> *pArray = &matrix[0];
        int high = matrix.size();
        int len = pArray->size();
        
        if (len == 0)
            return false;
        
        int index = len - 1;
        for (int i = 0; i < high; i++)
        {
            int j = index;
            for (; j > 0; j--)
            {
                if(matrix[i][j] > target && matrix[i][j - 1] < target)
                {
                    index = j - 1;
                    break;
                }
                if(matrix[i][j] == target)
                    return true;
            }
            
            if(matrix[i][j] == target)
                return true;
        }
        
        return false;
    }
};
```

### 合并两个有序数组

给定两个有序整数数组 nums1 和 nums2，将 nums2 合并到 nums1 中，使得 num1 成为一个有序数组。

说明:  
初始化 nums1 和 nums2 的元素数量分别为 m 和 n。  
你可以假设 nums1 有足够的空间（空间大小大于或等于 m + n）来保存 nums2 中的元素。

示例:  
输入:
nums1 = [1,2,3,0,0,0], m = 3
nums2 = [2,5,6],       n = 3  
输出: [1,2,2,3,5,6]

```c++
class Solution {
public:
    void merge(vector<int>& nums1, int m, vector<int>& nums2, int n) {
        
        vector<int> vecTemp = nums1;
        
        int i = 0, j = 0, k = 0, z = 0;
        z = m + n; 
            
        while(k < z)
        {
            if (j >= n || (i < m && vecTemp[i] < nums2[j]))
            {
                nums1[k] = vecTemp[i];
                i++;
            }
            else
            {
                nums1[k] = nums2[j];
                j++;
            }
            k++;
        }
        
    }
};
```

### 验证回文串

给定一个字符串，验证它是否是回文串，只考虑字母和数字字符，可以忽略字母的大小写。  
说明：本题中，我们将空字符串定义为有效的回文串。

示例 1:  
输入: "A man, a plan, a canal: Panama"  
输出: true  

示例 2:  
输入: "race a car"  
输出: false

```c++
/*  思路：先过滤无用字符并将所有小写字符转为大写，然后在判断回文串
*/
class Solution {
public:
    bool isPalindrome(string s) {
        string str2;
        for (int i = 0; i < s.size(); i++)
        {
            if ((s[i] >= 'a' && s[i] <= 'z') || (s[i] >= 'A' && s[i] <= 'Z') || (s[i] >= '0' && s[i] <= '9'))
            {
                if (s[i] >= 'a' && s[i] <= 'z')
                {
                    s[i] = s[i] + ('A' - 'a');
                }
                str2.append(&s[i], 1);
            }
        }
        
        for (int i = 0; i < str2.size()/2; i++)
        {
            if (str2[i] != str2[str2.size() - 1 - i])
            {
                return false;
            }
        }
        return true;
    }
};
```

### 有效的字母异位词

给定两个字符串 s 和 t ，编写一个函数来判断 t 是否是 s 的字母异位词。

示例 1:  
输入: s = "anagram", t = "nagaram"  
输出: true  

示例 2:  
输入: s = "rat", t = "car"  
输出: false  

说明:  
你可以假设字符串只包含小写字母。

进阶:  
如果输入字符串包含 unicode 字符怎么办？你能否调整你的解法来应对这种情况？

```c++
/*  思路：将两个字符串分别遍历放到两个map中，然后遍历其中一个map，在另一个map中找有没有这个元素
*/
class Solution {
public:
    bool isAnagram(string s, string t) {
        
        if (s.size() != t.size())
            return false;
        
        map<char,int> mapS, mapT;
        for(int i = 0; i < s.size(); i++)
        {
            mapS[s[i]]++;
            mapT[t[i]]++;
        }
        
        if (mapS.size() != mapT.size())
            return false;
        
        for(auto iter = mapS.begin(); iter != mapS.end(); iter++)
        {
            auto iterT = mapT.find(iter->first);
            if (iterT == mapT.end())
                return false;
            if (iterT->second != iter->second)
                return false;
        }
        return true;
    }
};
```

### 字符串中的第一个唯一字符

给定一个字符串，找到它的第一个不重复的字符，并返回它的索引。如果不存在，则返回 -1。

案例:  
s = "leetcode"  
返回 0.  

s = "loveleetcode",  
返回 2.
 
注意事项：您可以假定该字符串只包含小写字母。

```c++
class Solution {
public:
    int firstUniqChar(string s) {
        
        unordered_map<char,int> mapCount;
        for (int i = 0; i < s.size(); i++)
        {
            mapCount[s[i]]++;
        }
        
        for (int i = 0; i < s.size(); i++)
        {
            unordered_map<char,int>::iterator iter = mapCount.find(s[i]);
            if (iter->second == 1)
            {
                return i;
            }
        }
        return -1;
    }
};
```

### 反转字符串

编写一个函数，其作用是将输入的字符串反转过来。输入字符串以字符数组 char[] 的形式给出。

不要给另外的数组分配额外的空间，你必须原地修改输入数组、使用 O(1) 的额外空间解决这一问题。

你可以假设数组中的所有字符都是 ASCII 码表中的可打印字符。

示例 1：  
输入：["h","e","l","l","o"]  
输出：["o","l","l","e","h"]  

示例 2：  
输入：["H","a","n","n","a","h"]  
输出：["h","a","n","n","a","H"]  

```c++
class Solution {
public:
    void reverseString(vector<char>& s) {
        
        int len = s.size();
        for (int i = 0; i < len/2; i++)
        {
            char c = s[i];
            s[i] = s[len - 1 - i];
            s[len - 1 - i] = c;
        }
    }
};
```

### 旋转数组

给定一个数组，将数组中的元素向右移动 k 个位置，其中 k 是非负数。

```
示例 1:
输入: [1,2,3,4,5,6,7] 和 k = 3
输出: [5,6,7,1,2,3,4]
解释:
向右旋转 1 步: [7,1,2,3,4,5,6]
向右旋转 2 步: [6,7,1,2,3,4,5]
向右旋转 3 步: [5,6,7,1,2,3,4]

示例 2:
输入: [-1,-100,3,99] 和 k = 2
输出: [3,99,-1,-100]
解释: 
向右旋转 1 步: [99,-1,-100,3]
向右旋转 2 步: [3,99,-1,-100]
```
说明:   
尽可能想出更多的解决方案，至少有三种不同的方法可以解决这个问题。
要求使用空间复杂度为 O(1) 的 原地 算法。

```c++
/*  思路：将K前面的所有元素反转，在将K后面的元素反转，然后反转这个数组
*/
class Solution {
public:
    void rotate(vector<int>& nums, int k) {
        
        int len = nums.size();
        if (len < 2 || k < 1 || k % len == 0) {
            return;
        }
        
        if (k > len) {
            k = k % len;
        }

        reverse(nums, len - k, len);
        reverse(nums, 0, len - k);
        reverse(nums, 0, len);
    }
    
    void reverse(vector<int>& s, int start, int end) {
        for (int i = 0; i < (end - start)/2; i++)
        {
            int c = s[i + start];
            s[i + start] = s[end - 1 - i];
            s[end - 1 - i] = c;
        }
    }
};
```

### 存在重复元素

给定一个整数数组，判断是否存在重复元素。

如果任何值在数组中出现至少两次，函数返回 true。如果数组中每个元素都不相同，则返回 false。

示例 1:  
输入: [1,2,3,1]  
输出: true  

示例 2:  
输入: [1,2,3,4]  
输出: false  

示例 3:  
输入: [1,1,1,3,3,4,3,2,4,2]  
输出: true

```c++
class Solution {
public:
    bool containsDuplicate(vector<int>& nums) {
        
        set<int> setI;
        for (int i = 0; i < nums.size(); i++)
        {
            auto iter = setI.find(nums[i]);
            if(iter == setI.end())
            {
                setI.insert(nums[i]);
            }
            else
            {
                return true;
            }
        }
        return false;
    }
};
```

### 移动零

给定一个数组 nums，编写一个函数将所有 0 移动到数组的末尾，同时保持非零元素的相对顺序。

示例:  
输入: [0,1,0,3,12]  
输出: [1,3,12,0,0]  

说明:  
必须在原数组上操作，不能拷贝额外的数组。  
尽量减少操作次数。

```c++
/*  思路：将所有非0元素移到前面来，然后将后面的元素都置为0
*/
class Solution {
public:
    void moveZeroes(vector<int>& nums) {
        
        int j = 0;
        for(int i = 0; i < nums.size(); i++)
        {
            if (nums[i] != 0)
            {
                nums[j] = nums[i];
                j++;
            }
        }

        for(int i = j; i < nums.size(); i++)
        {
            nums[i] = 0;
        }
    }
};
```

###  两个数组的交集 II

给定两个数组，编写一个函数来计算它们的交集。

示例 1:  
输入: nums1 = [1,2,2,1], nums2 = [2,2]  
输出: [2,2]  

示例 2:  
输入: nums1 = [4,9,5], nums2 = [9,4,9,8,4]  
输出: [4,9]  

说明：  
输出结果中每个元素出现的次数，应与元素在两个数组中出现的次数一致。  
我们可以不考虑输出结果的顺序。

```c++
class Solution {
public:
    vector<int> intersect(vector<int>& nums1, vector<int>& nums2) {
        
        vector<int> result;
        map<int,int> mapC;
        for(int i = 0; i < nums1.size(); i++)
        {
            mapC[nums1[i]]++;
        }
        
        for(int i = 0; i < nums2.size(); i++)
        {
            auto iter = mapC.find(nums2[i]);
            if(iter != mapC.end())
            {
                if (iter->second > 0)
                {
                    result.push_back(nums2[i]);
                    iter->second--;
                }
            }
        }
        return result;
    }
};
```

### 数组中的第K个最大元素

在未排序的数组中找到第 k 个最大的元素。请注意，你需要找的是数组排序后的第 k 个最大的元素，而不是第 k 个不同的元素。

示例 1:  
输入: [3,2,1,5,6,4] 和 k = 2  
输出: 5  

示例 2:  
输入: [3,2,3,1,2,4,5,5,6] 和 k = 4  
输出: 4  

说明:  
你可以假设 k 总是有效的，且 1 ≤ k ≤ 数组的长度。

```c++
class Solution {
public:
    int findKthLargest(vector<int>& nums, int k) {
        sort(nums.begin(), nums.end());
        return nums[nums.size() - k];
    }
};
```

### 数据流的中位数

中位数是有序列表中间的数。如果列表长度是偶数，中位数则是中间两个数的平均值。

例如：  
[2,3,4] 的中位数是 3   
[2,3] 的中位数是 (2 + 3) / 2 = 2.5

设计一个支持以下两种操作的数据结构：

void addNum(int num) - 从数据流中添加一个整数到数据结构中。  
double findMedian() - 返回目前所有元素的中位数。  

```text
示例：
addNum(1)
addNum(2)
findMedian() -> 1.5
addNum(3) 
findMedian() -> 2
```

```c++
/*  思路：使用两个堆，一个大顶堆，一个小顶堆，保证大顶堆中的数据都小于小顶堆，并且两个堆中的数据量最多相差一个。
*/
class MedianFinder {
public:
    /** initialize your data structure here. */
    std::priority_queue<int, std::vector<int>, std::greater<int> > minHeap;
    std::priority_queue<int, std::vector<int>, std::less<int> > maxHeap;
    
    MedianFinder() {
        
    }
    
    void addNum(int num) {
        if(maxHeap.empty() || num <= maxHeap.top())
        {
            maxHeap.push(num);
        }
        else 
        {
            minHeap.push(num);
        }
        
        if (maxHeap.size() - minHeap.size() == 2)
        {
            minHeap.push(maxHeap.top());
            maxHeap.pop();
        }
        
        if (minHeap.size() - maxHeap.size() == 2)
        {
            maxHeap.push(minHeap.top());
            minHeap.pop();
        }
    }
    
    double findMedian() {
        if (minHeap.size() == maxHeap.size())
        {
            return (minHeap.top() + maxHeap.top())/2.0;
        }
        
        if (minHeap.size() > maxHeap.size())
        {
            return minHeap.top();
        }
        else
        {
            return maxHeap.top();
        }
    }
};
```

### 环形链表

给定一个链表，判断链表中是否有环。

为了表示给定链表中的环，我们使用整数 pos 来表示链表尾连接到链表中的位置（索引从 0 开始）。 如果 pos 是 -1，则在该链表中没有环。

```c++
/*  思路：快慢指针，如果两个再次相遇说明有环
*/
/**
 * Definition for singly-linked list.
 * struct ListNode {
 *     int val;
 *     ListNode *next;
 *     ListNode(int x) : val(x), next(NULL) {}
 * };
 */
class Solution {
public:
    bool hasCycle(ListNode *head) {
        
        if (head == NULL)
            return false;
        
        ListNode *slow = head, *fast = head->next;
        while(fast && fast->next)
        {
            if (slow == fast)
                return true;
            
            slow = slow->next;
            fast = fast->next->next;
        }
        return false;
    }
};
```

### 相交链表

编写一个程序，找到两个单链表相交的起始节点。

```c++
/*  思路：先计算两个链表的长度，将长链表先移动到和短链表一样长的位置，然后开始同时遍历两个链表，
    如果两个节点相等，则找到相交节点
*/
/**
 * Definition for singly-linked list.
 * struct ListNode {
 *     int val;
 *     ListNode *next;
 *     ListNode(int x) : val(x), next(NULL) {}
 * };
 */
class Solution {
public:
    ListNode *getIntersectionNode(ListNode *headA, ListNode *headB) {
        
        int lenA = 1, lenB = 1, step = 0;
        ListNode *nodeA = headA, *nodeB = headB;
        
        while(nodeA)
        {
            nodeA = nodeA->next;
            lenA++;
        }
        
        while(nodeB)
        {
            nodeB = nodeB->next;
            lenB++;
        }
        
        nodeA = headA;
        nodeB = headB;
        
        if (lenA > lenB)
        {
            step = lenA - lenB;
            
            while(step)
            {
                nodeA = nodeA->next;
                step--;
            }
        }
        else
        {
            step = lenB - lenA;
            
            while(step)
            {
                nodeB = nodeB->next;
                step--;
            }
        }
        
        while(nodeA != NULL && nodeB != NULL)
        {
            if (nodeA == nodeB)
                return nodeA;
            
            nodeA = nodeA->next;
            nodeB = nodeB->next;
        }
        
        return NULL;
    }
};
```

### 反转链表

```c++
/**
 * Definition for singly-linked list.
 * struct ListNode {
 *     int val;
 *     ListNode *next;
 *     ListNode(int x) : val(x), next(NULL) {}
 * };
 */
class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        
        if (head == NULL || head->next == NULL)
            return head;
        
        ListNode *first = head;
        ListNode *second = head->next;
        
        head->next = NULL;
        
        while (second != NULL)
        {
            ListNode *third = second->next;
            second->next = first;
            first = second;
            second = third;
        }
        return first;
    }
};
```

### 删除链表中的节点

请编写一个函数，使其可以删除某个链表中给定的（非末尾）节点，你将只被给定要求被删除的节点。

现有一个链表 -- head = [4,5,1,9]，它可以表示为:

示例 1:  
输入: head = [4,5,1,9], node = 5  
输出: [4,1,9]  
解释: 给定你链表中值为 5 的第二个节点，那么在调用了你的函数之后，该链表应变为 4 -> 1 -> 9.  

示例 2:  
输入: head = [4,5,1,9], node = 1  
输出: [4,5,9]  
解释: 给定你链表中值为 1 的第三个节点，那么在调用了你的函数之后，该链表应变为 4 -> 5 -> 9.  

```c++
/*  思路：将当前节点的下一个节点赋值给当前节点，然后删除下一个节点
*/
/**
 * Definition for singly-linked list.
 * struct ListNode {
 *     int val;
 *     ListNode *next;
 *     ListNode(int x) : val(x), next(NULL) {}
 * };
 */
class Solution {
public:
    void deleteNode(ListNode* node) {
        node->val = node->next->val;
        
        ListNode *temp = node->next->next;
        node->next = temp;
    }
};
```

### Excel表列序号

给定一个Excel表格中的列名称，返回其相应的列序号。
示例 1:  
输入: "A"  
输出: 1  

示例 2:  
输入: "AB"  
输出: 28  

示例 3:  
输入: "ZY"  
输出: 701  

```c++
/*  思路：就是将26进制转换为10进制
*/
class Solution {
public:
    int titleToNumber(string s) {
        
        int ret = 0, j = 0;
        for(int i = s.size() - 1; i >= 0; i--)
        {
            ret = ret + (s[i] - 'A' + 1) * pow(26, j);
            j++;
        }
        return ret;
    }
};
```

### 常数时间插入、删除和获取随机元素

设计一个支持在平均 时间复杂度 O(1) 下，执行以下操作的数据结构。

insert(val)：当元素 val 不存在时，向集合中插入该项。  
remove(val)：元素 val 存在时，从集合中移除该项。  
getRandom：随机返回现有集合中的一项。每个元素应该有相同的概率被返回。  

```c++
/*  思路：一个map，一个数组，map中存放对应数字在数组中的位置
*/
class RandomizedSet {
public:
    /** Initialize your data structure here. */
    map<int, int> mapInt;
    vector<int> verInt;
    RandomizedSet() {
        
    }
    
    /** Inserts a value to the set. Returns true if the set did not already contain the specified element. */
    bool insert(int val) {
        auto iter = mapInt.find(val);
        if (iter == mapInt.end())
        {
            verInt.push_back(val);
            mapInt[val] = verInt.size() - 1;
            return true;
        }
        return false;
    }
    
    /** Removes a value from the set. Returns true if the set contained the specified element. */
    bool remove(int val) {
        auto iter = mapInt.find(val);
        if (iter == mapInt.end())
        {
            return false;
        }
        
        int a = verInt[verInt.size() - 1];
        verInt[verInt.size() - 1] = verInt[iter->second];
        verInt[iter->second] = a;
        mapInt[a] = iter->second;
        
        verInt.pop_back();
        mapInt.erase(val);
        return true;
    }
    
    /** Get a random element from the set. */
    int getRandom() {
        return verInt[random()%verInt.size()];
    }
};
```

### 寻找峰值

峰值元素是指其值大于左右相邻值的元素。

给定一个输入数组 nums，其中 nums[i] ≠ nums[i+1]，找到峰值元素并返回其索引。

数组可能包含多个峰值，在这种情况下，返回任何一个峰值所在位置即可。

你可以假设 nums[-1] = nums[n] = -∞。

```c++
class Solution {
public:
    int findPeakElement(vector<int>& nums) {
        
        nums.push_back(INT_MIN);
        for (int i = 1; i < nums.size(); i++)
        {
            if (nums[i-1] < nums[i] && nums[i] > nums[i+1])
            {
                return i;
            }
        }
        
        return 0;
    }
};
```

### 颠倒二进制位

颠倒给定的 32 位无符号整数的二进制位。

```c++
class Solution {
public:
    uint32_t reverseBits(uint32_t n) {
        
        uint32_t ret = 0;
        for (int i = 0; i < 32; i++)
        {
            if (n & (1 << i))
                ret = ret + (1 << (31 - i));
        }
        return ret;
    }
};
```

### 位1的个数

编写一个函数，输入是一个无符号整数，返回其二进制表达式中数字位数为 ‘1’ 的个数（也被称为汉明重量）。

```c++
class Solution {
public:
    int hammingWeight(uint32_t n) {
        int count = 0;
        for (int i = 0; i < 32; i++)
        {
            if (n & (1 << i))
                count++;
        }
        return count;
    }
};
```

### 缺失数字

给定一个包含 0, 1, 2, ..., n 中 n 个数的序列，找出 0 .. n 中没有出现在序列中的那个数。

```c++
/*  思路：先计算n个数的和，然后减去数组中的所有数，剩下的就是缺失数
*/
class Solution {
public:
    int missingNumber(vector<int>& nums) {
        int sum = 0, i = 0, n = nums.size();
        
        sum = (n * (n+1))/2;
        while(i < n)
        {
            sum = sum - nums[i];
            i++;
        }
        
        return sum;
    }
};
```

### 3的幂

给定一个整数，写一个函数来判断它是否是 3 的幂次方。

```c++
class Solution {
public:
    bool isPowerOfThree(int n) {
        double i = n;
        if (i <= 0)
            return false;
        
        while(i != 1)
        {
            i = i/3.0;
            if (i < 1 && i > 0)
                return false;
        }
        return true;
    }
};
```

### 最小栈

设计一个支持 push，pop，top 操作，并能在常数时间内检索到最小元素的栈。

push(x) -- 将元素 x 推入栈中。  
pop() -- 删除栈顶的元素。  
top() -- 获取栈顶元素。  
getMin() -- 检索栈中的最小元素。  

```c++
/*  思路：开一个正常的栈，一个存放当前最小值的栈
*/
class MinStack {
public:
    /** initialize your data structure here. */
    stack<int> StackInt;
    stack<int> minStack;
    
    MinStack() {
        minStack.push(INT_MAX);
    }
    
    void push(int x) {
        StackInt.push(x);
        
        if (x <= minStack.top())
        {
            minStack.push(x);
        }
       
    }
    
    void pop() {
        
        if (StackInt.top() == minStack.top())
        {
            minStack.pop();
        }
        
        StackInt.pop();
    }
    
    int top() {
        return StackInt.top();
    }
    
    int getMin() {
        return minStack.top();
    }
};
```
