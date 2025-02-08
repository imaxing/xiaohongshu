const { app, BrowserWindow, BrowserView, ipcMain } = require("electron");
const path = require("node:path");
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// 全局状态配置
const state = {
  target: 'https://www.xiaohongshu.com/explore',
  ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  mouse: {
    baseSpeed: 100,
    steps: 30,
    maxOffset: 10,
    highlightStyle: 'box-shadow: 0 0 0 2px red !important; border: 2px solid red !important; transition: all 0.1s ease-in-out;',
    highlightDuration: 1000
  },
  window: {
    width: 1500,
    height: 1200,
    minWidth: 800,
    minHeight: 600
  }
};

// 鼠标控制器
class MouseController {
  constructor(page) {
    this.page = page;
    this.currentX = 0;
    this.currentY = 0;
    // 初始化时注入样式
    this.initializeStyles();
  }

  async initializeStyles() {
    try {
      await this.page.evaluate(() => {
        // 如果已存在样式标签则移除
        const existingStyle = document.getElementById('mouse-tracker-style');
        if (existingStyle) {
          existingStyle.remove();
        }

        // 创建新的样式标签
        const style = document.createElement('style');
        style.id = 'mouse-tracker-style';
        style.textContent = `
          .mouse-highlight {
            box-shadow: 0 0 0 2px red !important;
            border: 2px solid red !important;
            transition: all 0.3s ease-in-out !important;
          }
          .mouse-tracker-point {
            position: absolute;
            width: 10px;
            height: 10px;
            background: rgba(255, 0, 0, 0.5);
            border-radius: 50%;
            pointer-events: none;
            z-index: 999999;
            transition: opacity 0.3s ease-out;
          }
        `;
        document.head.appendChild(style);
      });
    } catch (error) {
      console.error('初始化样式失败:', error);
    }
  }

  generateControlPoints(start, end) {
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const offsetX = (Math.random() - 0.5) * state.mouse.maxOffset * 2;
    const offsetY = (Math.random() - 0.5) * state.mouse.maxOffset * 2;
    return {
      x: midX + offsetX,
      y: midY + offsetY
    };
  }

  calculateBezierPoint(t, start, control, end) {
    const x = Math.pow(1 - t, 2) * start.x + 
             2 * (1 - t) * t * control.x + 
             Math.pow(t, 2) * end.x;
    const y = Math.pow(1 - t, 2) * start.y + 
             2 * (1 - t) * t * control.y + 
             Math.pow(t, 2) * end.y;
    return { x, y };
  }

  async highlightElement(x, y) {
    try {
      await this.page.evaluate(({ x, y, duration }) => {
        const element = document.elementFromPoint(x, y);
        if (element) {
          // 创建唯一标识
          const timestamp = Date.now();
          const highlightId = `highlight-${timestamp}`;
          
          // 添加高亮类
          element.classList.add('mouse-highlight');
          element.setAttribute('data-highlight-id', highlightId);
          
          // 创建轨迹点
          const feedback = document.createElement('div');
          feedback.id = `feedback-${timestamp}`;
          feedback.className = 'mouse-tracker-point';
          feedback.style.left = `${x - 5}px`;
          feedback.style.top = `${y - 5}px`;
          document.body.appendChild(feedback);
          
          // 延迟清理
          setTimeout(() => {
            // 清理高亮
            const targetElement = document.querySelector(`[data-highlight-id="${highlightId}"]`);
            if (targetElement) {
              targetElement.classList.remove('mouse-highlight');
              targetElement.removeAttribute('data-highlight-id');
            }
            
            // 清理轨迹点
            const feedbackElement = document.getElementById(`feedback-${timestamp}`);
            if (feedbackElement) {
              feedbackElement.style.opacity = '0';
              setTimeout(() => feedbackElement.remove(), 300);
            }
          }, duration);
        }
      }, { 
        x, 
        y, 
        duration: state.mouse.highlightDuration 
      });
    } catch (error) {
      console.error('高亮元素失败:', error);
    }
  }

  async moveMouseSmooth(targetX, targetY) {
    try {
      console.debug(`开始移动鼠标: 从 (${this.currentX}, ${this.currentY}) 到 (${targetX}, ${targetY})`);

      const start = { x: this.currentX, y: this.currentY };
      const end = { x: targetX, y: targetY };
      const control = this.generateControlPoints(start, end);

      for (let i = 0; i <= state.mouse.steps; i++) {
        const t = i / state.mouse.steps;
        const point = this.calculateBezierPoint(t, start, control, end);
        
        // 添加缓动效果
        const easing = Math.sin((t * Math.PI) / 2);
        const delay = state.mouse.baseSpeed * (1 - easing);
        
        // 移动鼠标
        const roundedX = Math.round(point.x);
        const roundedY = Math.round(point.y);
        await this.page.mouse.move(roundedX, roundedY);

        // 更新当前位置
        this.currentX = roundedX;
        this.currentY = roundedY;

        // 高亮经过的元素
        await this.highlightElement(roundedX, roundedY);

        // 等待延迟
        await new Promise(resolve => setTimeout(resolve, delay));
        
        console.debug(`移动进度: ${Math.round(t * 100)}%, 位置: (${roundedX}, ${roundedY})`);
      }

      console.debug('鼠标移动完成');
      return true;
    } catch (error) {
      console.error('移动鼠标失败:', error);
      return false;
    }
  }
}

// Puppeteer 控制器
class PuppeteerController {
  constructor() {
    this.browser = null;
    this.page = null;
    this.mouseController = null;
  }

  async initialize(browserView) {
    try {
      console.debug('开始初始化 Puppeteer...');
      
      // 等待 browserView 完全加载
      await browserView.webContents.loadURL(state.target);
      console.debug('页面加载完成');

      // 启用 debugger
      if (!browserView.webContents.debugger.isAttached()) {
        await browserView.webContents.debugger.attach('1.3');
      }

      // 连接到 browserView
      this.browser = await puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null,
      });

      console.debug('Puppeteer 连接成功');

      // 获取所有目标
      const targets = await this.browser.targets();
      console.debug('当前所有目标:', targets.map(t => ({
        type: t.type(),
        url: t.url(),
        id: t._targetId
      })));

      // 找到目标页面
      const target = targets.find(t => t.type() === 'page' && t.url().includes('xiaohongshu.com'));
      if (!target) {
        throw new Error('未找到目标页面');
      }
      console.debug('找到目标页面:', target.url());

      // 获取页面
      this.page = await target.page();
      if (!this.page) {
        throw new Error('未能获取页面实例');
      }
      console.debug('成功获取页面实例');

      // 设置用户代理
      await this.page.setUserAgent(state.ua);
      console.debug('用户代理设置完成');

      // 等待页面内容加载
      try {
        console.debug('等待页面内容加载...');
        await this.page.waitForSelector('#exploreFeeds', { 
          timeout: 10000,
          visible: true 
        });
        console.debug('页面内容已加载');
      } catch (error) {
        console.warn('等待页面内容超时:', error);
      }

      // 初始化鼠标控制器
      this.mouseController = new MouseController(this.page);
      console.debug('鼠标控制器初始化完成');

      // 执行测试
      console.debug('准备执行鼠标移动测试');
      await this.testMouseMovement();

      return true;
    } catch (error) {
      console.error('Puppeteer 初始化失败:', error);
      console.error('错误详情:', error.stack);
      return false;
    }
  }

  async testMouseMovement() {
    try {
      console.debug('开始测试鼠标移动...');

      // 先移动到固定坐标测试
      // console.debug('测试移动到固定坐标 (100, 100)');
      // await this.mouseController.moveMouseSmooth(100, 100);
      // await new Promise(resolve => setTimeout(resolve, 1000));

      // 然后尝试获取元素
      const selector = '#exploreFeeds > section[data-index="0"] a.cover';
      console.debug('等待目标元素:', selector);
      
      const element = await this.page.waitForSelector(selector, { 
        timeout: 10000,
        visible: true 
      });
      
      if (!element) {
        throw new Error('未找到目标元素');
      }

      const box = await element.boundingBox();
      console.debug('目标元素位置:', box);

      // 移动到元素中心点
      const targetX = box.x + box.width / 2;
      const targetY = box.y + box.height / 2;
      
      console.debug(`准备移动到元素中心: (${targetX}, ${targetY})`);
      await this.mouseController.moveMouseSmooth(targetX, targetY);
      console.debug('移动完成');

      return true;
    } catch (error) {
      console.error('鼠标移动测试失败:', error);
      console.error('错误详情:', error.stack);
      return false;
    }
  }
}

// 窗口控制器
class WindowController {
  constructor() {
    this.mainWindow = null;
    this.browserView = null;
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      ...state.window,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false,
      }
    });

    if (!app.isPackaged) {
      this.mainWindow.webContents.openDevTools();
    }
  }

  createBrowserView() {
    this.browserView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        devTools: true,
        enableRemoteModule: true,
        webviewTag: true
      }
    });

    this.mainWindow.setBrowserView(this.browserView);
    this.updateViewBounds();
  }

  updateViewBounds() {
    if (this.browserView) {
      const bounds = this.mainWindow.getBounds();
      this.browserView.setBounds({ 
        x: 0, 
        y: 0, 
        width: bounds.width, 
        height: bounds.height 
      });
    }
  }
}

// 主程序控制器
class MainController {
  constructor() {
    this.windowController = new WindowController();
    this.puppeteerController = new PuppeteerController();
  }

  async initialize() {
    try {
      console.debug('开始初始化主程序...');
      
      // 创建窗口
      this.windowController.createMainWindow();
      this.windowController.createBrowserView();

      // 等待一段时间确保窗口创建完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.debug('窗口创建完成');

      // 初始化 Puppeteer
      const puppeteerInitialized = await this.puppeteerController.initialize(
        this.windowController.browserView
      );
      
      if (!puppeteerInitialized) {
        throw new Error('Puppeteer 初始化失败');
      }

      console.debug('Puppeteer 初始化完成');

      // 监听窗口大小变化
      this.windowController.mainWindow.on('resize', () => {
        this.windowController.updateViewBounds();
      });

      // 设置 IPC 监听
      this.setupIPC();

      // 添加测试代码
      console.debug('开始执行鼠标移动测试');
      await this.puppeteerController.testMouseMovement();

      return true;
    } catch (error) {
      console.error('初始化失败:', error);
      return false;
    }
  }

  // 添加更多的测试命令
  setupIPC() {
    ipcMain.handle('test-mouse-move', async () => {
      return await this.puppeteerController.testMouseMovement();
    });

    // 添加移动到指定坐标的命令
    ipcMain.handle('move-to-coordinate', async (event, { x, y }) => {
      try {
        await this.puppeteerController.mouseController.moveMouseSmooth(x, y);
        return true;
      } catch (error) {
        console.error('移动到指定坐标失败:', error);
        return false;
      }
    });
  }
}

// 确保在应用最开始就设置调试端口
app.commandLine.appendSwitch('remote-debugging-port', '9222');

// 应用启动
app.whenReady().then(async () => {
  console.debug('应用准备就绪');
  const mainController = new MainController();
  await mainController.initialize();

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await mainController.initialize();
    }
  });
});