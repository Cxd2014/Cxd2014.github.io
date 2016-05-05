---

layout: post
title:  "Linux下的sublime安装教程"
date:   2015-10-23 09:16:10
categories: others
tags: sublime安装教程

---

* content
{:toc}



#### 安装Package Control

1. 打开sublime的命令终端`View->Show Console`
2. 粘贴以下代码到底部命令行并回车
    * `Sublime Text 3`代码
        
          import urllib.request,os; pf = 'Package Control.sublime-package'; ipp = sublime.installed_packages_path(); urllib.request.install_opener( urllib.request.build_opener( urllib.request.ProxyHandler()) ); open(os.path.join(ipp, pf), 'wb').write(urllib.request.urlopen( 'http://sublime.wbond.net/' + pf.replace(' ','%20')).read())

    * `Sublime Text 2`代码

          import urllib2,os; pf='Package Control.sublime-package'; ipp = sublime.installed_packages_path(); os.makedirs( ipp ) if not os.path.exists(ipp) else None; urllib2.install_opener( urllib2.build_opener( urllib2.ProxyHandler( ))); open( os.path.join( ipp, pf), 'wb' ).write( urllib2.urlopen( 'http://sublime.wbond.net/' +pf.replace( ' ','%20' )).read()); print( 'Please restart Sublime Text to finish installation')

3. 重启Sublime Text
4. 如果在Perferences中看到Package control这一项，则安装成功

#### 用Package Control安装Markdown插件

1. 打开 `Perferences->Package control`
2. 输入`install`调出`Install Package`选项并回车，然后在列表输入要安装的插件
3. 输入`markdown preview`回车,安装`markdown preview`插件(用于生成Html文件)
4. 输入`markdown Editing`回车,安装`markdown Editing`插件(用于编辑Markdown文章)
5. 重启Sublime Text

#### 解决Linux下中文输入问题

1. 安装依赖包(不然编译sublime_imfix.c文件会出错)

        apt-get install build-essential libgtk2.0-dev

2. 编译sublime_imfix.c文件，将编译后的文件放在sublime安装文件中
```c
       /* 
        sublime-imfix.c 
        Use LD_PRELOAD to interpose some function to fix sublime input method support for linux. 
        By Cjacker Huang <jianzhong.huang at i-soft.com.cn>  
        gcc -shared -o libsublime-imfix.so sublime_imfix.c  `pkg-config --libs --cflags gtk+-2.0` -fPIC 
        LD_PRELOAD=./libsublime-imfix.so sublime_text 
        */  

        #include <gtk/gtk.h>  
        #include <gdk/gdkx.h>  
        typedef GdkSegment GdkRegionBox;  
          
        struct _GdkRegion  
        {  
          long size;  
          long numRects;  
          GdkRegionBox *rects;  
          GdkRegionBox extents;  
        };  
          
        GtkIMContext *local_context;  
          
        void  
        gdk_region_get_clipbox (const GdkRegion *region,  
                    GdkRectangle    *rectangle)  
        {  
          g_return_if_fail (region != NULL);  
          g_return_if_fail (rectangle != NULL);  
          
          rectangle->x = region->extents.x1;  
          rectangle->y = region->extents.y1;  
          rectangle->width = region->extents.x2 - region->extents.x1;  
          rectangle->height = region->extents.y2 - region->extents.y1;  
          GdkRectangle rect;  
          rect.x = rectangle->x;  
          rect.y = rectangle->y;  
          rect.width = 0;  
          rect.height = rectangle->height;   
          //The caret width is 2;   
          //Maybe sometimes we will make a mistake, but for most of the time, it should be the caret.  
          if(rectangle->width == 2 && GTK_IS_IM_CONTEXT(local_context)) {  
                gtk_im_context_set_cursor_location(local_context, rectangle);  
          }  
        }  
          
        //this is needed, for example, if you input something in file dialog and return back the edit area  
        //context will lost, so here we set it again.  
          
        static GdkFilterReturn event_filter (GdkXEvent *xevent, GdkEvent *event, gpointer im_context)  
        {  
            XEvent *xev = (XEvent *)xevent;  
            if(xev->type == KeyRelease && GTK_IS_IM_CONTEXT(im_context)) {  
               GdkWindow * win = g_object_get_data(G_OBJECT(im_context),"window");  
               if(GDK_IS_WINDOW(win))  
                 gtk_im_context_set_client_window(im_context, win);  
            }  
            return GDK_FILTER_CONTINUE;  
        }  
          
        void gtk_im_context_set_client_window (GtkIMContext *context,  
                  GdkWindow    *window)  
        {  
          GtkIMContextClass *klass;   
          g_return_if_fail (GTK_IS_IM_CONTEXT (context));
          klass = GTK_IM_CONTEXT_GET_CLASS (context);  
          if (klass->set_client_window)  
            klass->set_client_window (context, window);  
          
          if(!GDK_IS_WINDOW (window))  
            return;  
          g_object_set_data(G_OBJECT(context),"window",window);  
          int width = gdk_window_get_width(window);  
          int height = gdk_window_get_height(window);  
          if(width != 0 && height !=0) {  
            gtk_im_context_focus_in(context);  
            local_context = context;  
          }  
          gdk_window_add_filter (window, event_filter, context);   
        }   
```

    编译命令:

        gcc -shared -o libsublime-imfix.so sublime_imfix.c  `pkg-config --libs --cflags gtk+-2.0` -fPIC

3. 修改`/usr/share/applications/sublime_text.desktop`文件

        Exec=/opt/sublime_text/sublime_text %F   //修改为
        Exec=bash -c 'LD_PRELOAD=/opt/sublime_text/libsublime-imfix.so /opt/sublime_text/sublime_text' %F

        Exec=/opt/sublime_text/sublime_text -n  //修改为
        Exec=bash -c 'LD_PRELOAD=/opt/sublime_text/libsublime-imfix.so /opt/sublime_text/sublime_text' -n
        
    这样就可以通过图表启动，并且可以输入中文了。

#### 更改字体

打开 `Perferences->Setting User`选项：

    {
        "font_size": 14, #字体大小
        "font_face": " Courier 10 Pitch", #字体名字
    }


[Sublime官网](http://www.sublimetext.com/)

