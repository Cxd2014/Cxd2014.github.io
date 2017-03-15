---

layout: post
title:  "Git常用命令"
date:   2015-08-10 09:16:10
categories: others
tags: git command

---

* content
{:toc}


### Git常用命令列表

命令|解释
---|---
git init                | 把当前的目录变成可以管理的git仓库，生成隐藏.git文件。  
git add XX              | 把xx文件添加到暂存区去。 
git reflog              | 查看历史记录的版本号id 
git rm XX               | 删除XX文件 
git commit –m “X”       | 提交文件 –m 后面的是注释。
git status              | 查看仓库状态  
git diff XX             | 查看XX文件修改了那些内容    
git log                 | 查看历史记录     
git merge dev           | 在当前的分支上合并dev分支  
git branch –d dev       | 删除dev分支  
git branch name         | 创建分支  
git stash               | 把当前的工作隐藏起来 等以后恢复现场后继续工作  
git stash list          | 查看所有被隐藏的文件列表  
git stash apply         | 恢复被隐藏的文件，但是内容不删除  
git stash drop          | 删除文件
git stash pop           | 恢复文件的同时 也删除文件
git remote              | 查看远程库的信息  
git remote –v           | 查看远程库的详细信息
git branch              | 查看当前所有的分支  
git push origin master  | 把master分支推送到远程库对应的分支上
git checkout -- XX      | 把XX文件在工作区的修改全部撤销。    
git rm xx --cached      | 撤出暂存区(不对该文件进行监控了)
git checkout master     | 切换回master分支  
git checkout –b dev     | 创建dev分支 并切换到dev分支上  > 
git reset --hard + 版本号| 回到删除的版本位置 
git reset --hard HEAD^  | 回退到上一个版本
git reset --hard HEAD~X | 回退到上X个版本
git pull origin master  | 将服务器上的代码同步到本地


    git remote add origin https://github.com/Cxd2014/Cxd2014.github.io 联一个远程库
    git clone https://github.com/Cxd2014/Cxd2014.github.io  从远程库中克隆  
