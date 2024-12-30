# Android设备群控系统

这是一个基于Electron和Node.js的Android设备群控系统，支持同时控制100台以上的Android设备，集成了scrcpy进行设备显示和控制，并支持ADB命令和自动化脚本执行。

## 功能特点

- 支持同时连接和控制100+台Android设备
- 集成scrcpy实现设备画面显示和控制
- 支持群控命令广播
- 支持自定义脚本执行
- 实时设备状态监控
- 高性能视频流处理
- 可扩展的脚本引擎

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