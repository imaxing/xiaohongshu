const { ipcRenderer } = require("electron");

const state = {
  sections: [],
  checked: [],
  stoped: true,
  window: { x: 0, y: 0, width: 0, height: 0 }
}


// 监听窗口大小位置变动
ipcRenderer.on("window-info", (_, info) => {
  state.window = info
});


// 监听对象变化
function watch(obj, key, callback) {
  let cv = obj[key];
  Object.defineProperty(obj, key, {
    get: () => cv,
    set(v) {
      if (v !== cv) {
        cv = v;
        callback(v);
      }
    },
  });
}

// 发送消息到主进程
function send({ type, data }) {
  ipcRenderer.send("event", JSON.stringify({ type, data }));
}

// 选择器
function $(selector) {
  return document.querySelector(selector)
}

// 创建覆盖的样式
function showSectionIndex() {
  const style = document.createElement('style');
  style.textContent = `
    #exploreFeeds > section::after {
      content: attr(data-index);
      position: absolute;
      top: 0;
      left: 0;
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 2px 6px;
      font-size: 12px;
      z-index: 999;
    }
    #exploreFeeds > section.active::after {
      background: red;
      color: #fff;
    }

    #noteContainer {
      transition: none !important;
    }
    .note-detail-mask {
      z-index: -1;
    }
  `;
  document.head.appendChild(style);
}

// 获取当前所有的section
function getSections() {
  const data = document.querySelectorAll("#exploreFeeds > section");
  return Array.from(data).reduce(
    (sum, section) => [...sum, section.getAttribute('data-index')],
    []
  );
}

function createCoverCenterInfo(position) {
  const span = document.createElement('span')
  span.style.position = 'fixed',
    span.style.left = position.x + 'px'
  span.style.top = position.y + 'px'
  // span.style.width = '4px'
  // span.style.height = '4px'
  span.style.background = '#f40f40'
  span.style.color = '#fff'
  span.style.borderRadius = 4
  span.style.zIndex = 1000000;
  return span
}

// 获取指定section的位置
function getSectionPosition(index) {
  const section = $(
    `#exploreFeeds > section[data-index="${index}"] a.cover`
  );
  const rect = section.getBoundingClientRect();
  const x = rect.left + (rect.width / 2)
  const y = rect.top + (rect.height / 2)
  return { x, y };
}

// 创建悬浮按钮
function createFloatingButton(options) {
  const button = document.createElement('button');
  button.textContent = options.text;
  button.style.cssText = `
    position: fixed;
    bottom: 40px;
    right: ${options.right};
    z-index: 9999;
    padding: 8px 16px;
    background: #1890ff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;

  document.body.appendChild(button);

  return button
}

// 判断当前卡片是否在可视窗口内
function isElementFullyVisible(el) {

  const rect = el.getBoundingClientRect();

  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;

  return rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= vh &&
    rect.right <= vw;

}

// 解析内容的图片信息
function getBackgroundUrl(dom) {
  const background = dom.style.background;
  const urlMatch = background.match(/url\((['"]?)(.*?)\1\)/);
  return urlMatch ? urlMatch[2] : null;
}

// 获取打开后的信息内容
function getSectionInfo() {
  return new Promise(resolve => {
    try {
      setTimeout(() => {
        const title = $('.note-content #detail-title') || {}
        const desc = $('.note-content #detail-desc') || {}
        const medias = $('.media-container') ? $('.media-container').querySelectorAll('.swiper-slide .img-container img') : []
        console.log($('.media-container'), '====medias')
        resolve({
          title: title.innerText,
          desc: desc.innerText,
          covers: Array.from(medias).map(d => d.getAttribute('src')).filter(Boolean)
        })
      }, 2000)

    } catch (error) {
      console.log(error)
    }
  })

}



// 任务详情
async function runSectionAction(section) {
  try {

    const position = getSectionPosition(section)
    const point = createCoverCenterInfo(position)
    point.innerText = `${position.x}/${position.y}`
    document.body.appendChild(point)
    position.x += state.window.x
    position.y -= state.window.y


    send({ type: "moveMouse", data: { targetX: position.x, targetY: position.y, duration: 100 } })
    await new Promise(resolve => setTimeout(resolve, 100))
    console.log('1. 移动到当前元素上')


    send({ type: "clickMouse", data: { button: 'left', duration: 100 } })
    await new Promise(resolve => setTimeout(resolve, 2100))
    console.log('2. 点击打开元素')
    point.remove();


    const info = await getSectionInfo(section)
    console.log('3. 获取打开的信息', info)


    send({ type: "report", data: { index: section, value: info } })
    console.log('4. 上报成功, 准备关闭')
    


    send({ type: "keyTap", data: 'escape' })
    await new Promise(resolve => setTimeout(resolve, 2000))
    console.log('5. 已关闭弹窗')


  } catch (error) {
    console.log(error, '出错了')
  }
}


// 开始任务
async function start() {
  state.sections = getSections();
  for (const index in state.sections) {
    // 如果点停止了则结束循环
    if (state.stoped) {
      console.log('停止任务')
      break
    };

    // 滚动后会重新获取所有的卡片, 如果是处理过的直接跳过
    if (state.checked.includes(index)) {
      console.log('处理过了')
      continue
    }


    // 是否在可视窗口, 不在则向下滚动300然后重新开始执行
    const el = $(`#exploreFeeds > section[data-index="${index}"]`)

    if (!isElementFullyVisible(el)) {
      send({ type: "scrollMouse", data: { x: 0, y: -300, duration: 100 } })
      await new Promise(resolve => setTimeout(resolve, 3000))
      run();
      break;
    }


    await runSectionAction(index)
    await new Promise(resolve => setTimeout(resolve, 3000))
    state.checked.push(index)
  }
  state.stoped = true
}


/*
v1
加载小红书网页版
robotjs自动化一个一个的点进去, 抓标题, 描述, tag
不能dom click
加按钮触发


v2
加手动暂停
用户移动鼠标取消自动化
x,y要加上窗口位置判断
鼠标速度移动快一些
图片也要抓一下
*/
window.addEventListener('load', () => {


  const startButton = createFloatingButton({ text: '开始', right: '100px' });
  startButton.addEventListener('click', () => {

    state.stoped = !state.stoped

  });



  showSectionIndex();


  // 监听任务状态
  watch(state, 'stoped', (v) => {
    startButton.innerText = v ? '开始' : '暂停'
    !v && start();
  })


  // 监听窗口数据变化重新获取所有card信息
  watch(state, 'window', () => {
    state.sections = getSections();
  })


});
