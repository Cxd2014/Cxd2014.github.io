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
        code_link: 'https://github.com/Cxd2014/LinuxDriversLearn',
        title: 'Linux驱动学习',
        core_tech: 'Linux驱动',
        description: '韦东山老师的教程写的Linux驱动'
    },{
        demo_link: 'http://pan.baidu.com/s/1skcRIVj',
        img_link: '/css/4566.jpg',
        code_link: 'https://www.gitbook.com/book/cxd2014/an_introduction_to_gcc/details',
        title: 'An_introduction_to_GCC中文版',
        core_tech: 'GCC',
        description: 'An_introduction_to_GCC中文翻译版本'
    },{
        demo_link: 'https://github.com/Cxd2014/Qt-Application',
        img_link: '/css/4056.jpg',
        code_link: 'https://github.com/Cxd2014/Qt-Application',
        title: 'Qt应用程序',
        core_tech: 'C++ Qt',
        description: '用Qt Designer写的小程序'
    },{
        demo_link: 'https://github.com/Cxd2014/DataStruct',
        img_link: '/css/1234.jpg',
        code_link: 'https://github.com/Cxd2014/DataStruct',
        title: 'C语言版数据结构',
        core_tech: 'C 数据结构',
        description: 'C语言版数据结构'
    }];

    contentInit(demoContent) //内容初始化
    waitImgsLoad() //等待图片加载，并执行布局初始化
}());



/**
 * 内容初始化
 * @return {[type]} [description]
 */
function contentInit(content) {
    var htmlArr = [];
    for (var i = 0; i < content.length; i++) {
        htmlArr.push('<div class="grid-item">')
        htmlArr.push('<a class="a-img" href="'+content[i].demo_link+'">')
        htmlArr.push('<img src="'+content[i].img_link+'">')
        htmlArr.push('</a>')
        htmlArr.push('<h3 class="demo-title">')
        htmlArr.push('<a href="'+content[i].demo_link+'">'+content[i].title+'</a>')
        htmlArr.push('</h3>')
        htmlArr.push('<p>主要技术：'+content[i].core_tech+'</p>')
        htmlArr.push('<p>'+content[i].description)
        htmlArr.push('<a href="'+content[i].code_link+'">源代码 <i class="fa fa-code" aria-hidden="true"></i></a>')
        htmlArr.push('</p>')
        htmlArr.push('</div>')
    }
    var htmlStr = htmlArr.join('')
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
        gutter: 20,
    })
}
