const { ipcRenderer } = require("electron");

const state = {
  sections: [], // 所有卡片数据
  checked: [], // 处理过的卡片 data-index
  stoped: true, // 是否停止状态
  mask: null, // 全屏的提示蒙层
  start_button: null,
  window: { x: 0, y: 0, width: 0, height: 0 } // 应用窗口信息
}

// 手动停止任务状态
let lastX = 0;
let lastY = 0;
let lastTime = Date.now();
let shakeCount = 0;


// 监听窗口大小位置变动
ipcRenderer.on("window-info", (_, info) => {
  state.window = info;
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
function createSectionIndex() {
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

// 在卡片封面上创建一个位置标记测试鼠标移动的坐标准不准
function createCoverCenterInfo(position) {
  const span = document.createElement('span')
  span.style.position = 'fixed',
    span.style.left = position.x + 'px'
  span.style.top = position.y + 'px'
  span.style.background = '#f40f40'
  span.style.color = '#fff'
  span.style.borderRadius = 4
  span.style.zIndex = 1000000;
  return span
}

// 获取指定section的位置
function getElementPosition(selector) {
  const section = $(selector);
  if (!section) {
    throw new Error('未找到目标元素')
  }
  const rect = section.getBoundingClientRect();
  const x = rect.left + (rect.width / 2)
  const y = rect.top + (rect.height / 2)

  const point = createCoverCenterInfo({ x, y })
  point.innerText = `${x}/${y}`
  point.style.transform = 'translate(-50%, -50%)'
  document.body.appendChild(point)

  return { x, y };
}

// 创建悬浮按钮
function createFloatingButton(options) {
  const button = document.createElement('button');
  button.textContent = options.text;
  button.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: ${options.left};
    z-index: 99999999;
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

function createTaskStatusMask() {
  const mask = document.createElement('div');
  mask.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    z-index: 9999;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: #fff;
  `;
  mask.textContent = '处理中...';
  document.body.appendChild(mask);

  return mask;
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

    const position = getElementPosition(`#exploreFeeds > section[data-index="${section}"] a.cover`)

    position.x += state.window.x
    position.y -= state.window.y

    send({ type: "moveMouse", data: { targetX: position.x, targetY: position.y, duration: 100 } })
    await new Promise(resolve => setTimeout(resolve, 100))
    console.log('1. 移动到当前元素上')


    send({ type: "clickMouse", data: { button: 'left', duration: 100 } })
    await new Promise(resolve => setTimeout(resolve, 2100))
    console.log('2. 点击打开元素')



    const info = await getSectionInfo(section)
    console.log('3. 获取打开的信息', info)


    send({ type: "report", data: { index: section, value: info } })
    console.log('4. 上报成功, 准备关闭')



    await new Promise(resolve => setTimeout(resolve, 1500))
    send({ type: "moveMouse", data: { targetX: state.window.x + 10, targetY: window.innerHeight / 2, duration: 100 } })
    send({ type: "clickMouse", data: { button: 'left', duration: 100 } })
    // send({ type: "keyTap", data: 'escape' })
    await new Promise(resolve => setTimeout(resolve, 1500))
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
      // continue
    }


    // 是否在可视窗口, 不在则向下滚动300然后重新开始执行
    const el = $(`#exploreFeeds > section[data-index="${index}"]`)

    if (!isElementFullyVisible(el)) {
      send({ type: "scrollMouse", data: { x: 0, y: -300, duration: 100 } })
      await new Promise(resolve => setTimeout(resolve, 3000))
      start();
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

v3
增加全屏蒙层提示任务状态
拦截请求
*/
window.addEventListener('load', () => {


  state.start_button = createFloatingButton({ text: '开始', left: '100px' });
  state.start_button.addEventListener('click', () => {

    state.stoped = !state.stoped

  });



  createSectionIndex();




  // 监听任务状态
  watch(state, 'stoped', (v) => {
    state.start_button.innerText = v ? '开始' : '暂停'
    if (!v) {
      start();
      state.mask = createTaskStatusMask();
    } else {
      state.mask && state.mask.remove();
    }
  })


  // 监听窗口数据变化重新获取所有card信息
  watch(state, 'window', () => {
    state.sections = getSections();
  })





  // 快速移动鼠标停止机器人任务
  window.addEventListener('mousemove', (event) => {
    if (state.stoped) return
    const currentTime = Date.now();
    const deltaTime = currentTime - lastTime;
    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / deltaTime;

    if (velocity > 2) {
      shakeCount++;
      if (shakeCount >= 5) {
        state.stoped = true;
        shakeCount = 0;
      }
    } else {
      shakeCount = Math.max(0, shakeCount - 1);
    }

    lastX = event.clientX;
    lastY = event.clientY;
    lastTime = currentTime;
  });




  // 鼠标右键摁下停止任务
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!state.stoped) {
      state.stoped = true;
    }
  });

});
