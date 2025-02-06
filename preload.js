const { ipcRenderer } = require("electron");

const state = {
  sections: {}, // 所有卡片数据
  nextSections: {},
  checked: [], // 处理过的卡片 data-index
  stoped: true, // 是否停止状态
  mask: null, // 全屏的提示蒙层
  start_button: null,
  download_button: null,
  toasts: [],
  window_updating: false,
  window: { x: 0, y: 0, width: 0, height: 0 }, // 应用窗口信息
};

let t = null;
// 手动停止任务状态
let lastX = 0;
let lastY = 0;
let lastTime = Date.now();
let shakeCount = 0;

// 监听窗口大小位置变动
ipcRenderer.on("window-info", (_, info) => {
  // 防抖处理窗口更新状态
  console.log("窗口状态变化");
  state.window_updating = true;
  t && clearTimeout(t);
  t = setTimeout(() => {
    state.window_updating = false;
    console.log("窗口状态变化结束");
  }, 1000);

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
  return document.querySelector(selector);
}

// 创建提示信息
function createToast({ text = "", duration = 3000 } = {}) {
  // 维护当前显示的toast数组
  if (!state.toasts) {
    state.toasts = [];
  }

  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translate(-50%, ${state.toasts.length * 40}px);
    padding: 8px 16px;
    background: #E6994B;
    color: #fff;
    border-radius: 4px;
    font-size: 14px;
    line-height: 1.5;
    z-index: 99999999;
    transition: all 0.3s;
    box-shadow: 0 3px 6px -4px rgba(0, 0, 0, 0.12), 
                0 6px 16px 0 rgba(0, 0, 0, 0.08),
                0 9px 28px 8px rgba(0, 0, 0, 0.05);
  `;
  toast.textContent = text;
  document.body.appendChild(toast);

  // 添加到数组
  state.toasts.push(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => {
      document.body.removeChild(toast);
      // 从数组中移除
      const index = state.toasts.indexOf(toast);
      if (index > -1) {
        state.toasts.splice(index, 1);
      }
      // 更新剩余toast的位置
      state.toasts.forEach((t, i) => {
        t.style.transform = `translate(-50%, ${i * 40}px)`;
      });
    }, 300);
  }, duration);

  return toast;
}

// 创建覆盖的样式
function createResetStyles() {
  const style = document.createElement("style");
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

    #noteContainer, .note-detail-mask {
      transition: none !important;
    }

    
    
  `;
  /*
  .note-detail-mask {
      pointer-events: none;
    }
  */
  document.head.appendChild(style);
}

// 获取当前所有的section
function getSections() {
  const data = document.querySelectorAll("#exploreFeeds > section");
  return Array.from(data).reduce(
    (sum, section) => ({
      ...sum,
      [section.getAttribute("data-index")]: section,
    }),
    {}
  );
}

// 获取指定section的位置
function getElementPosition(selector) {
  const section = $(selector);
  if (!section) {
    throw new Error("未找到目标元素");
  }
  const rect = section.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  return { x, y };
}

// 创建悬浮按钮
function createFloatingButton(options) {
  const button = document.createElement("button");
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

  return button;
}

// 创建任务状态提示蒙层
function createTaskStatusMask() {
  const mask = document.createElement("div");
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
  mask.textContent = "处理中...";
  document.body.appendChild(mask);

  return mask;
}

// 判断当前卡片是否在可视窗口内
function isElementFullyVisible(el) {
  const rect = el.getBoundingClientRect();

  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;

  return (
    rect.top >= 0 && rect.left >= 0 && rect.bottom <= vh && rect.right <= vw
  );
}

// 获取打开后的信息内容
function getSectionInfo() {
  return new Promise((resolve) => {
    try {
      setTimeout(() => {
        const title = $(".note-content #detail-title") || {};
        const desc = $(".note-content #detail-desc") || {};
        const medias = $(".media-container")
          ? $(".media-container").querySelectorAll(
              ".swiper-slide .img-container img"
            )
          : [];
        resolve({
          title: title.innerText,
          desc: desc.innerText,
          covers: Array.from(medias)
            .map((d) => d.getAttribute("src"))
            .filter(Boolean),
        });
      }, 1000);
    } catch (error) {
      console.log(error);
    }
  });
}

// 任务详情
async function runSectionAction(section) {
  try {
    const position = getElementPosition(
      `#exploreFeeds > section[data-index="${section}"] a.cover`
    );

    position.x += state.window.x;
    position.y += state.window.y;

    send({
      type: "moveMouse",
      data: { targetX: position.x + 20, targetY: position.y, duration: 100 },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log("1. 移动到当前元素上");

    send({ type: "clickMouse", data: { button: "left", duration: 100 } });

    // 等待弹窗打开接口数据获取
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("2. 点击打开元素");

    const info = await getSectionInfo(section);
    send({ type: "report", data: { index: section, value: info } });
    console.log("3. 获取打开的信息上报", info);

    send({ type: "keyTap", data: "escape" });

    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error) {
    console.log(error, "出错了");
  }
}

// 开始任务
async function start() {
  state.sections = getSections();

  for (const index in state.sections) {
    // 如果窗口正在更新中,等待更新完成
    if (state.window_updating) {
      createToast({ text: "窗口更新中, 等待更新完成" });
      await new Promise((resolve) => {
        const checkUpdate = () =>
          !state.window_updating ? resolve() : setTimeout(checkUpdate, 100);
        checkUpdate();
      });
    }

    // 如果点停止了则结束循环
    if (state.stoped) break;

    // 如果是处理过的直接跳过
    if (state.checked.includes(index)) continue;

    // 是否在可视窗口, 不在则向下滚动300然后重新开始执行
    const el = $(`#exploreFeeds > section[data-index="${index}"]`);
    if (el && !isElementFullyVisible(el)) {
      send({ type: "scrollMouse", data: { x: 0, y: -250, duration: 2000 } });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      state.nextSections = getSections();
    }

    await runSectionAction(index);
    state.checked.push(index);
  }

  // 上次的任务执行完成后检查下nextSections有没有添加新的进来 有的话继续执行
  // 没有了就任务结束
  if (Object.keys(state.nextSections).length) {
    state.sections = { ...state.sections, ...state.nextSections };
    state.nextSections = {};
    createToast({ text: "有新的数据待处理" });
    start();
  } else {
    state.stoped = true;
  }
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
window.addEventListener("load", () => {
  createToast({ text: "初始化成功" });

  // 创建部分自定义样式
  createResetStyles();

  // 按钮触发任务
  state.start_button = createFloatingButton({ text: "开始", left: "120px" });
  state.start_button.addEventListener("click", () => {
    state.stoped = !state.stoped;
  });

  // 按钮下载数据
  state.download_button = createFloatingButton({ text: "下载数据", left: "20px" });
  state.download_button.addEventListener("click", () => {
    send({ type: "download_results", data: {} });
  });
});

// 监听任务状态
watch(state, "stoped", (v) => {
  state.start_button.innerText = v ? "开始" : "停止";
  if (!v) {
    start();
    state.mask = createTaskStatusMask();
  } else {
    state.mask && state.mask.remove();
  }
});

// 快速移动鼠标停止机器人任务
window.addEventListener("mousemove", (event) => {
  if (state.stoped) return;
  const currentTime = Date.now();
  const deltaTime = currentTime - lastTime;
  const deltaX = event.clientX - lastX;
  const deltaY = event.clientY - lastY;
  const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / deltaTime;

  if (velocity > 2) {
    shakeCount++;
    if (shakeCount >= 5) {
      createToast({ text: "检测到快速移动鼠标停止任务" });
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
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (!state.stoped) {
    createToast({ text: "检测到右键停止任务" });
    state.stoped = true;
  }
});
