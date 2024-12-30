# AndroidArmy

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16-brightgreen)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/electron-28.0.0-blue)](https://www.electronjs.org/)

强大的 Android 设备群控系统，让您如同指挥军队般轻松管理 100+ 台设备。基于 Electron 开发，是设备测试、应用自动化和群控场景的理想解决方案。

![项目预览](docs/images/preview.png)

## ✨ 核心特性

- 🚀 支持同时连接和控制 100+ 台 Android 设备
- 📱 集成 scrcpy 实现超低延迟设备画面显示和控制
- 🎮 直观的设备管理界面，支持拖拽操作
- 📢 强大的群控命令广播系统
- 🤖 灵活的自动化脚本引擎
- 📊 实时设备状态监控和数据统计
- 🔄 高性能视频流处理
- 🛠 可扩展的插件系统

## 系统要求

- Node.js 16+
- ADB工具
- scrcpy
- Android设备（已启用开发者选项和USB调试）

## 安装

1. 安装依赖：
```bash
npm install
```

2. 安装ADB工具（如果尚未安装）：
```bash
# macOS
brew install android-platform-tools

# Linux
sudo apt-get install android-tools-adb

# Windows
# 下载Android SDK并添加platform-tools到系统PATH
```

3. 安装scrcpy：
```bash
# macOS
brew install scrcpy

# Linux
sudo apt install scrcpy

# Windows
# 从GitHub下载scrcpy发布版本
```

## 使用方法

1. 启动应用：
```bash
npm start
```

2. 连接设备：
- 通过USB连接Android设备
- 确保设备已启用USB调试
- 在应用中会自动检测并显示已连接的设备

3. 设备控制：
- 点击设备缩略图可以放大查看
- 使用鼠标和键盘可以直接控制设备
- 支持文件传输和剪贴板同步

4. 群控功能：
- 选择多个设备
- 使用广播功能发送命令
- 支持同步执行操作

5. 脚本执行：
- 在scripts目录下创建.js脚本文件
- 通过UI加载和执行脚本
- 支持定时任务和条件触发

## 脚本示例

```javascript
// example.js
// 打开应用
adb shell am start -n com.example.app/.MainActivity

// 等待2秒
sleep 2000

// 点击坐标
input tap 500 500

// 返回键
input keyevent 4
```

## 开发

1. 启动开发模式：
```bash
npm run dev
```

2. 构建应用：
```bash
npm run build
```

## 注意事项

- 确保设备USB调试已启用
- 大量设备同时连接时注意USB带宽限制
- 建议使用USB 3.0及以上接口
- 注意系统资源占用情况

## 故障排除

1. 设备未识别：
- 检查USB连接
- 确认设备USB调试已启用
- 重新插拔USB线缆

2. 画面延迟：
- 降低视频码率
- 调整帧率
- 检查USB带宽使用情况

3. 命令执行失败：
- 检查ADB连接状态
- 确认设备权限设置
- 查看错误日志

## 贡献

欢迎提交Issue和Pull Request来改进这个项目。

## 许可证

MIT License 

## 🎯 应用场景

- 移动应用测试和调试
- 游戏外挂开发和测试
- 自动化运营和管理
- 设备性能监控
- 批量应用部署

## 🔧 技术栈

- Electron
- Vue 3
- Socket.IO
- SQLite
- scrcpy
- ADB

## 📸 界面预览

<table>
  <tr>
    <td><img src="docs/images/devices.png" alt="设备管理" /></td>
    <td><img src="docs/images/scripts.png" alt="脚本管理" /></td>
  </tr>
  <tr>
    <td><img src="docs/images/monitor.png" alt="状态监控" /></td>
    <td><img src="docs/images/settings.png" alt="系统设置" /></td>
  </tr>
</table>

## 🤝 参与贡献

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

## 📄 开源协议

本项目采用 MIT 协议开源，详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- [scrcpy](https://github.com/Genymobile/scrcpy) - 提供了优秀的设备显示方案
- [Electron](https://www.electronjs.org/) - 提供了跨平台的桌面应用开发框架
- [Vue.js](https://vuejs.org/) - 提供了响应式的用户界面框架 