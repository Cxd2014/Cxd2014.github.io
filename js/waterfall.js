/* jshint asi:true */
//先等图片都加载完成
//再执行布局函数

/**
 * 执行主函数
 * @param  {[type]} function( [description]
 * @return {[type]}           [description]
 */
(function() {

  /**
     * 内容JSON
     */
    var demoContent = [{
        demo_link: 'https://github.com/Cxd2014/LinuxDriversLearn',
        img_link: '/css/linux.jpg',
        //code_link: 'https://github.com/Cxd2014/LinuxDriversLearn',
        title: 'Linux驱动学习',
        core_tech: 'Linux驱动',
        description: '韦东山老师的教程写的Linux驱动'
    },{
        demo_link: 'https://www.gitbook.com/book/cxd2014/an_introduction_to_gcc/details',
        img_link: '/css/4566.jpg',
        //code_link: 'https://www.gitbook.com/book/cxd2014/an_introduction_to_gcc/details',
        title: 'An_introduction_to_GCC中文版',
        core_tech: 'GCC',
        description: 'An_introduction_to_GCC中文翻译版本'
    },{
        demo_link: 'https://github.com/Cxd2014/lua_epoll_server',
        img_link: '/css/54542.jpg',
        //code_link: 'https://www.gitbook.com/book/cxd2014/an_introduction_to_gcc/details',
        title: '基于Lua的HTTP服务器',
        core_tech: 'epoll lua HTTP服务器',
        description: '基于Lua的HTTP服务器'
    },{
        demo_link: 'https://github.com/Cxd2014/Qt-Application',
        img_link: '/css/4056.jpg',
        //code_link: 'https://github.com/Cxd2014/Qt-Application',
        title: 'Qt应用程序',
        core_tech: 'C++ Qt',
        description: '用Qt Designer写的小程序'
    },{
        demo_link: 'https://github.com/Cxd2014/DataStruct',
        img_link: '/css/1234.jpg',
        //code_link: 'https://github.com/Cxd2014/DataStruct',
        title: 'C语言版数据结构',
        core_tech: 'C 数据结构',
        description: 'C语言版数据结构'
    },{
        demo_link: 'https://www.bilibili.com/video/av23025246',
        img_link: '/css/1.png',
        //code_link: 'http://v.youku.com/v_show/id_XMTYyMDE2NDcwOA==.html',
        title: '毕业相册',
        core_tech: '毕业相册',
        description: '大学毕业电子相册'
    },{
        demo_link: 'http://v.youku.com/v_show/id_XNzk2MDc4NTEy.html',
        img_link: '/css/2.jpg',
        //code_link: 'http://v.youku.com/v_show/id_XNzk2MDc4NTEy.html',
        title: '穿墙术',
        core_tech: 'AE特效之穿墙',
        description: 'AE特效之穿墙'
    },{
        demo_link: 'http://v.youku.com/v_show/id_XOTE2OTM3NTc2.html',
        img_link: '/css/3.jpg',
        //code_link: 'http://v.youku.com/v_show/id_XOTE2OTM3NTc2.html',
        title: '分身术',
        core_tech: 'AE特效之分身术',
        description: 'AE特效之分身术'
    },{
      demo_link: 'https://www.bilibili.com/video/av23025158',
      img_link: '/css/20180506102058.jpg',
      //code_link: 'http://v.youku.com/v_show/id_XOTE2OTM3NTc2.html',
      title: '大范围移动延时摄影-深圳',
      core_tech: '延时摄影',
      description: '延时摄影'
    },{
      demo_link: 'https://www.bilibili.com/video/av25738447',
      img_link: '/css/20180708214641.jpg',
      //code_link: 'http://v.youku.com/v_show/id_XOTE2OTM3NTc2.html',
      title: '澳门Vlog',
      core_tech: 'vlog',
      description: '延时摄影'
    },{
      demo_link: 'https://www.bilibili.com/video/av33340092',
      img_link: '/css/20181008102926.jpg',
      //code_link: 'http://v.youku.com/v_show/id_XOTE2OTM3NTc2.html',
      title: '香港vlog',
      core_tech: 'vlog',
      description: '摄影'
    },{
      demo_link: 'https://www.bilibili.com/video/av52233417',
      img_link: '/css/20190512130816.jpg',
      //code_link: 'http://v.youku.com/v_show/id_XOTE2OTM3NTc2.html',
      title: '柬埔寨旅拍短片',
      core_tech: 'vlog',
      description: '旅拍'
    },{
      demo_link: 'https://www.bilibili.com/video/BV1cE411o772',
      img_link: '/css/20200525.jpg',
      //code_link: 'http://v.youku.com/v_show/id_XOTE2OTM3NTc2.html',
      title: '内蒙古旅拍短片',
      core_tech: 'vlog',
      description: '旅拍'
    }
  ];

  contentInit(demoContent) //内容初始化
  waitImgsLoad() //等待图片加载，并执行布局初始化
}());

/**
 * 内容初始化
 * @return {[type]} [description]
 */
function contentInit(content) {
  var htmlStr = ''
  for (var i = 0; i < content.length; i++) {
    htmlStr += '<div class="grid-item">' + '   <a class="a-img" href="' + content[i].demo_link + '">' + '       <img src="' + content[i].img_link + '">' + '   </a>' + '   <h3 class="demo-title">' + 
    '       <a href="' + content[i].demo_link + '">' + content[i].title + '</a>' + '   </h3>' + '   <p>主要技术：' + content[i].core_tech + '</p>' + '   <p>' + content[i].description + '   </p>' + '</div>'
  }
  var grid = document.querySelector('.grid')
  grid.insertAdjacentHTML('afterbegin', htmlStr)
}

/**
 * 等待图片加载
 * @return {[type]} [description]
 */
function waitImgsLoad() {
  var imgs = document.querySelectorAll('.grid img')
  var totalImgs = imgs.length
  var count = 0
  //console.log(imgs)
  for (var i = 0; i < totalImgs; i++) {
    if (imgs[i].complete) {
      //console.log('complete');
      count++
    } else {
      imgs[i].onload = function() {
        // alert('onload')
        count++
        //console.log('onload' + count)
        if (count == totalImgs) {
          //console.log('onload---bbbbbbbb')
          initGrid()
        }
      }
    }
  }
  if (count == totalImgs) {
    //console.log('---bbbbbbbb')
    initGrid()
  }
}

/**
 * 初始化栅格布局
 * @return {[type]} [description]
 */
function initGrid() {
  var msnry = new Masonry('.grid', {
    // options
    itemSelector: '.grid-item',
    columnWidth: 250,
    isFitWidth: true,
    gutter: 20
  })
}
