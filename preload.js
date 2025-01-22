const { ipcRenderer } = require("electron");

let sections = []
const checked = []

function send({ type, data }) {
  ipcRenderer.send("event", JSON.stringify({ type, data }));
}

function $(selector) {
  return document.querySelector(selector)
}


function showSectionIndex() {
  // 创建style标签显示section索引
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
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

// 获取当前所有的section
function getSections() {
  const sections = document.querySelectorAll("#exploreFeeds > section");
  return Array.from(sections).reduce(
    (sum, section) => [...sum, section.getAttribute('data-index')],
    []
  );
}



// 获取指定section的位置
function getSectionPosition(index) {
  const section = $(
    `#exploreFeeds > section[data-index="${index}"]`
  );
  const rect = section.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2 - 20,
  };
}


// 创建悬浮开始按钮
function createFloatingButton() {
  const button = document.createElement('button');
  button.textContent = '开始';
  button.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
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


function isElementFullyVisible(el) {

  const rect = el.getBoundingClientRect();

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  // 判断元素是否完全在视窗内
  const isFullyVisible =
    rect.top >= 0 && // 上边缘不在视窗上方
    rect.left >= 0 && // 左边缘不在视窗左侧
    rect.bottom <= viewportHeight && // 下边缘不在视窗下方
    rect.right <= viewportWidth; // 右边缘不在视窗右侧

  return isFullyVisible;
}


function getSectionInfo() {
  const title = $('.note-content #detail-title') || {}
  const desc = $('.note-content #detail-desc') || {}
  console.log(title, desc)
  return { title: title.innerText, desc: desc.innerText }
}


// 当前section的操作
async function runSectionAction(section) {
  try {

    const position = getSectionPosition(section)


    send({ type: "moveMouse", data: { targetX: position.x, targetY: position.y, duration: 300 } })
    await new Promise(resolve => setTimeout(resolve, 300))
    console.log('1. 移动到当前元素上')


    send({ type: "clickMouse", data: { button: 'left', duration: 100 } })
    await new Promise(resolve => setTimeout(resolve, 2100))
    console.log('2. 点击打开元素')


    const info = getSectionInfo(section)
    console.log('3. 获取打开的信息', info)


    send({ type: "report", data: { section: section, value: info } })
    console.log('4. 上报成功, 准备关闭')


    send({ type: "keyTap", data: 'escape' })
    await new Promise(resolve => setTimeout(resolve, 2000))
    console.log('5. 已关闭弹窗')


  } catch (error) {
  }
}

async function run() {
  sections = getSections();
  for (const index in sections) {
    if (checked.includes(index)) {
      continue
    }

    
    const el = $(`#exploreFeeds > section[data-index="${index}"]`)

    if (!isElementFullyVisible(el)) {
      send({ type: "scrollMouse", data: { x: 0, y: -300, duration: 1000 } })
      await new Promise(resolve => setTimeout(resolve, 4000))
      run();
      break;
    }


    await runSectionAction(index)
    await new Promise(resolve => setTimeout(resolve, 3000))
    checked.push(index)
  }
}

// 等待页面加载完成后创建按钮
window.addEventListener('load', () => {

  const button = createFloatingButton();
  button.addEventListener('click', run);

  showSectionIndex();

});
