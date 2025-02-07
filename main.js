// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const _robot = require("@jitsi/robotjs");
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { RobotEventIpc } = require("./robot");
const robot = new RobotEventIpc();
robot.initRobtIpc();
puppeteer.use(StealthPlugin());


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
  },
  download_results() {
    dialog.showSaveDialog({
      title: '保存数据',
      defaultPath: path.join(app.getPath('downloads'), 'data.json'),
      filters: [{ name: 'JSON文件', extensions: ['json'] }]
    }).then(result => {
      if (!result.canceled) {
        try {
          const fs = require('node:fs');
          fs.writeFileSync(result.filePath, JSON.stringify(results, null, 2));
          console.log('数据已保存到:', result.filePath);
        } catch (err) {
          console.error('保存数据失败:', err);
        }
      }
    });
  }
};

// function createWindow() {
//   const mainWindow = new BrowserWindow({
//     width: 1500,
//     height: 1200,
//     webPreferences: {
//       sandbox: true,
//       nodeIntegration: false,
//       contextIsolation: true,
//       preload: path.join(__dirname, "preload.js"),
//     },
//   });


//   mainWindow.webContents.setUserAgent(
//     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36"
//   );

//   mainWindow.loadURL(`https://www.xiaohongshu.com/explore`);


//   !app.isPackaged && mainWindow.webContents.openDevTools();



//   // 获取初始窗口位置
//   const [x, y] = mainWindow.getPosition();
//   const [width, height] = mainWindow.getSize();
//   mainWindow.webContents.send('window-info', {x, y, width, height});

//   // 监听窗口移动事件
//   mainWindow.on('move', () => {
//     const [x, y] = mainWindow.getPosition();
//     const [width, height] = mainWindow.getSize();
//     mainWindow.webContents.send('window-info', {x, y, width, height});
//   });

//   // 监听窗口大小变化事件
//   mainWindow.on('resize', () => {
//     const [x, y] = mainWindow.getPosition();
//     const [width, height] = mainWindow.getSize();
//     mainWindow.webContents.send('window-info', {x, y, width, height});
//   });

// }

// app.whenReady().then(async () => {
//   createWindow();
//   app.on("activate", function () {
//     if (BrowserWindow.getAllWindows().length === 0) createWindow();
//   });
// });




  ipcMain.on("event", (_, d) => {
    const { type, data } = JSON.parse(d);
    console.log('收到事件:', type, '数据:', data);
    robot[type] && robot[type](data);
    events[type] && events[type](data);
  });


app.whenReady().then(async () => {

  // 启动浏览器
  const browser = await puppeteer.launch({ 
    headless: false,
    slowMo: 100,
   });
  const page = await browser.newPage();
  page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36")

  // 导航到目标页面
  await page.goto('https://xiaohongshu.com/explore');

  // `#exploreFeeds > section[data-index="1"] a.cover`
  // 等待元素加载
  await page.waitForSelector('#exploreFeeds > section[data-index="0"] a.cover');

  // 获取元素位置信息
  const element = await page.$('#exploreFeeds > section[data-index="0"] a.cover');
  const box = await element.boundingBox();

  // 移动鼠标到元素中心点
  await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
  
  // 点击元素
  await page.mouse.click(box.x + box.width/2, box.y + box.height/2);

})


app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});