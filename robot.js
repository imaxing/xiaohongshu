const { ipcMain } = require("electron");
const robot = require("@jitsi/robotjs");

class RobotEventIpc {
  constructor(props) {}


  // 检测消息
  initRobtIpc = async () => {
    console.log("initRobtIpc");
    // 执行移动鼠标的操作
    ipcMain.handle("page-to-rebot-move-event", async (event, message) => {
      console.log("page-to-rebot-move-event", message);
      new Promise((resolve, reject) => {
        this.moveMouse(message);

        // 等待移动鼠标完成
        setTimeout(() => {
          resolve({});
        }, message.duration + 500);
      });
    });

    // 执行点击鼠标的操作
    ipcMain.handle("page-to-rebot-click-event", async (event, message) => {
      console.log("page-to-rebot-click-event", message);
      new Promise((resolve, reject) => {
        this.clickMouse(message);

        // 等待移动鼠标完成
        setTimeout(() => {
          resolve({});
        }, message.duration + 500);
      });
    });

    // 执行滚动鼠标的操作
    ipcMain.handle("page-to-rebot-scroll-event", async (event, message) => {
      console.log("page-to-rebot-scroll-event", message);
      new Promise((resolve, reject) => {
        this.scrollMouse(message);

        // 等待移动鼠标完成
        setTimeout(() => {
          resolve({});
        }, message.duration + 500);
      });
    });
  };

  // 移动鼠标
  moveMouse = (options) => {
    // 释放鼠标按钮
    robot.mouseToggle("up");

    console.log("robotevent=>moveMouse=>>", options);
    // options: { targetX: 100, targetY: 100, duration: 1000 }
    let { targetX, targetY, duration } = options;
    targetY = targetY + 67; // 增加顶部导航栏高度
    const currentPos = robot.getMousePos();
    const stepInterval = 10; // 每次移动间隔时间（毫秒）
    const totalSteps = duration / stepInterval; // 计算总步数
    const stepX = (targetX - currentPos.x) / totalSteps;
    const stepY = (targetY - currentPos.y) / totalSteps;

    for (let i = 0; i < totalSteps; i++) {
      setTimeout(() => {
        robot.moveMouse(currentPos.x + stepX * i, currentPos.y + stepY * i);
      }, i * stepInterval);
    }
    // 确保鼠标按钮处于释放状态
    setTimeout(() => {
      robot.mouseToggle("up");
    }, duration);
  };
  // 点击鼠标
  clickMouse = (options) => {
    console.log("robotevent=>clickMouse=>>", options);
    // options: { button: 'left', duration: 1000 }
    // button  'left' || 'right';
    let { button, duration } = options;

    robot.mouseToggle("up", button); // 释放
    setTimeout(() => {
      robot.mouseToggle("down", button); // 按下
      setTimeout(() => {
        robot.mouseToggle("up", button); // 释放
      }, duration);
    }, 1000);
  };

  // 滚动鼠标
  scrollMouse = (options) => {
    console.log("robotevent=>scrollMouse=>>", options);
    // options: { x: 0, y: 100, duration: 1000 }
    let { x, y, duration } = options;
    const steps = Math.abs(y) / 10; // 计算步数（每次滚动10个单位）
    const interval = duration / steps; // 每个滚动步骤之间的时间间隔

    for (let i = 0; i < steps; i++) {
      setTimeout(() => {
        robot.scrollMouse(x, y < 0 ? -10 : 10); // 向上或向下滚动
      }, i * interval);
    }
  };
}

exports.RobotEventIpc = RobotEventIpc;
