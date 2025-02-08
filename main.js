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
    highlightStyle: 'box-shadow: 0 0 0 1px red',
    highlightDuration: 2000
  },
  window: {
    width: 1500,
    height: 1200,
    minWidth: 800,
    minHeight: 600
  }
};

// 鼠标移动控制器
class MouseController {
  constructor(page) {
    this.page = page;
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
    await this.page.evaluate(({ x, y, style, duration }) => {
      const element = document.elementFromPoint(x, y);
      if (element) {
        const originalStyle = element.style.boxShadow;
        element.style.boxShadow = style;
        setTimeout(() => {
          element.style.boxShadow = originalStyle;
        }, duration);
      }
    }, { 
      x, 
      y, 
      style: state.mouse.highlightStyle, 
      duration: state.mouse.highlightDuration 
    });
  }

  async moveMouseSmooth(targetX, targetY) {
    const start = await this.page.mouse.position();
    const end = { x: targetX, y: targetY };
    const control = this.generateControlPoints(start, end);
    
    console.debug(`开始移动鼠标: 从 (${start.x}, ${start.y}) 到 (${end.x}, ${end.y})`);

    for (let i = 0; i <= state.mouse.steps; i++) {
      const t = i / state.mouse.steps;
      const point = this.calculateBezierPoint(t, start, control, end);
      
      const easing = Math.sin((t * Math.PI) / 2);
      const delay = state.mouse.baseSpeed * (1 - easing);
      
      await this.page.mouse.move(point.x, point.y);
      await this.highlightElement(point.x, point.y);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      console.debug(`移动进度: ${Math.round(t * 100)}%, 位置: (${Math.round(point.x)}, ${Math.round(point.y)})`);
    }

    console.debug('鼠标移动完成');
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

      // 等待并获取页面
      let retries = 0;
      while (retries < 5) {
        const pages = await this.browser.pages();
        console.debug(`尝试获取页面 (${retries + 1}/5), 当前页面数: ${pages.length}`);
        
        if (pages.length > 0) {
          this.page = pages[0];
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        retries++;
      }

      if (!this.page) {
        throw new Error('未能获取页面实例');
      }

      // 等待页面加载完成
      await this.page.waitForNavigation({ 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });
      
      console.debug('成功获取并确认页面实例');

      // 设置用户代理
      await this.page.setUserAgent(state.ua);

      // 初始化鼠标控制器
      this.mouseController = new MouseController(this.page);

      return true;
    } catch (error) {
      console.error('Puppeteer 初始化失败:', error);
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

      return true;
    } catch (error) {
      console.error('初始化失败:', error);
      return false;
    }
  }

  setupIPC() {
    ipcMain.handle('move-mouse', async (event, { x, y }) => {
      try {
        await this.puppeteerController.mouseController.moveMouseSmooth(x, y);
        return true;
      } catch (error) {
        console.error('鼠标移动失败:', error);
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