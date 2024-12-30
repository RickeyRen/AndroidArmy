const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const DeviceManager = require('./backend/device_manager/DeviceManager');
const ScrcpyManager = require('./backend/scrcpy_wrapper/ScrcpyManager');
const ScriptEngine = require('./backend/script_engine/ScriptEngine');
const SettingsManager = require('./backend/settings/SettingsManager');

// 设置全局错误处理
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
});

// 创建日志函数
function log(...args) {
    console.log(new Date().toISOString(), ...args);
}

function logError(...args) {
    console.error(new Date().toISOString(), ...args);
}

let mainWindow;
const settingsManager = new SettingsManager();
const deviceManager = new DeviceManager();
const scrcpyManager = new ScrcpyManager(settingsManager);
const scriptEngine = new ScriptEngine(deviceManager);

// 确保脚本目录存在
const scriptsDir = path.join(__dirname, 'scripts');
fs.mkdir(scriptsDir, { recursive: true }).catch(console.error);

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('frontend/index.html');
    
    // 开发环境下打开开发者工具
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// 设置相关 IPC 处理
ipcMain.handle('get-scrcpy-settings', async () => {
    try {
        log('收到获取scrcpy设置请求');
        const settings = await settingsManager.getScrcpySettings();
        log('返回的设置:', JSON.stringify(settings, null, 2));
        return settings;
    } catch (error) {
        logError('获取scrcpy设置失败:', error);
        throw error;
    }
});

ipcMain.handle('update-scrcpy-settings', async (event, settings) => {
    try {
        log('收到更新scrcpy设置请求');
        log('新设置:', JSON.stringify(settings, null, 2));
        
        // 确保settings是可序列化的纯对象
        const cleanSettings = JSON.parse(JSON.stringify(settings));
        
        const updatedSettings = await settingsManager.updateScrcpySettings(cleanSettings);
        log('设置更新成功');
        return updatedSettings;
    } catch (error) {
        logError('更新scrcpy设置失败:', error);
        throw error;
    }
});

// 设备名称相关 IPC 处理
ipcMain.handle('get-device-custom-names', async () => {
    return settingsManager.getAllDeviceCustomNames();
});

ipcMain.handle('set-device-custom-name', async (event, { deviceId, customName }) => {
    return await settingsManager.setDeviceCustomName(deviceId, customName);
});

// 设备相关 IPC 处理
ipcMain.handle('get-devices', async () => {
    try {
        console.log('收到获取设备列表请求');
        const devices = await deviceManager.getDevices();
        console.log('当前设备列表:', devices);
        
        // 添加自定义名称到设备信息中
        const devicesWithCustomNames = await Promise.all(devices.map(async device => ({
            ...device,
            customName: await settingsManager.getDeviceCustomName(device.id)
        })));
        
        return devicesWithCustomNames;
    } catch (error) {
        console.error('获取设备列表失败:', error);
        throw error;
    }
});

// 新增：设备配对处理
ipcMain.handle('pair-device', async (event, { ip, port, code }) => {
    return await deviceManager.pairDevice(ip, port, code);
});

// 新增：设备连接处理
ipcMain.handle('connect-device', async (event, { ip, port }) => {
    return await deviceManager.connectDevice(ip, port);
});

// 新增：断开设备连接处理
ipcMain.handle('disconnect-device', async (event, deviceId) => {
    return await deviceManager.disconnectDevice(deviceId);
});

// Scrcpy 相关 IPC 处理
ipcMain.handle('start-scrcpy', async (event, deviceId) => {
    return await scrcpyManager.startSession(deviceId);
});

ipcMain.handle('stop-scrcpy', async (event, deviceId) => {
    return await scrcpyManager.stopSession(deviceId);
});

// 命令执行相关 IPC 处理
ipcMain.handle('execute-command', async (event, deviceId, command) => {
    return await deviceManager.executeCommand(deviceId, command);
});

// 脚本相关 IPC 处理
ipcMain.handle('get-scripts', async () => {
    try {
        const files = await fs.readdir(scriptsDir);
        return files.filter(file => file.endsWith('.js')).map(file => ({
            name: file,
            path: path.join(scriptsDir, file)
        }));
    } catch (error) {
        console.error('获取脚本列表失败:', error);
        return [];
    }
});

ipcMain.handle('upload-script', async (event, name, content) => {
    try {
        const scriptPath = path.join(scriptsDir, name);
        await fs.writeFile(scriptPath, content);
        return { success: true };
    } catch (error) {
        console.error('上传脚本失败:', error);
        throw error;
    }
});

ipcMain.handle('execute-script', async (event, scriptName, deviceIds, options) => {
    try {
        const scriptPath = path.join(scriptsDir, scriptName);
        await scriptEngine.loadScript(scriptPath);
        return await scriptEngine.executeScript(scriptName, deviceIds, options);
    } catch (error) {
        console.error('执行脚本失败:', error);
        throw error;
    }
});

// 设备名称更新
ipcMain.handle('update-device-name', async (event, deviceId, newName) => {
    try {
        const result = await deviceManager.updateDeviceName(deviceId, newName);
        return { success: true, data: result };
    } catch (error) {
        console.error('更新设备名称失败:', error);
        return { success: false, message: error.message };
    }
}); 