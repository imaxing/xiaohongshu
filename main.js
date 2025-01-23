// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const _robot = require("@jitsi/robotjs");
const { RobotEventIpc } = require("./robot");
const robot = new RobotEventIpc();
robot.initRobtIpc();


const results = {}

const events = {
  keyTap: (key) => _robot.keyTap(key),
  moveMouse: (d) => robot.moveMouse(d),
  scrollMouse: (d) => robot.scrollMouse(d),
  clickMouse: (d) => robot.clickMouse(d),
  report: (d) => {
    results[d.index] = d.value
    console.log('results:')
    console.log(results)
  }
};

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1500,
    height: 1200,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });


  mainWindow.webContents.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36"
  );

  mainWindow.loadURL(`https://www.xiaohongshu.com/explore`);


  !app.isPackaged && mainWindow.webContents.openDevTools();

  ipcMain.on("event", (_, d) => {
    const { type, data } = JSON.parse(d);
    console.log('收到事件:', type, '数据:', data);
    robot[type] && robot[type](data);
    events[type] && events[type](data);
  });


  // 获取初始窗口位置
  const [x, y] = mainWindow.getPosition();
  const [width, height] = mainWindow.getSize();
  mainWindow.webContents.send('window-info', {x, y, width, height});

  // 监听窗口移动事件
  mainWindow.on('move', () => {
    const [x, y] = mainWindow.getPosition();
    const [width, height] = mainWindow.getSize();
    mainWindow.webContents.send('window-info', {x, y, width, height});
  });

  // 监听窗口大小变化事件
  mainWindow.on('resize', () => {
    const [x, y] = mainWindow.getPosition();
    const [width, height] = mainWindow.getSize();
    mainWindow.webContents.send('window-info', {x, y, width, height});
  });

}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});


