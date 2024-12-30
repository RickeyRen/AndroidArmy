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

let deviceListRefreshInterval = null;
let lastRefreshTime = 0;
const MINIMUM_REFRESH_INTERVAL = 1000; // 最小刷新间隔（1秒）

// 确保脚本目录存在
const scriptsDir = path.join(__dirname, 'scripts');
fs.mkdir(scriptsDir, { recursive: true }).catch(console.error);

// 刷新设备列表并发送到渲染进程
async function refreshDeviceList(force = false) {
    try {
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTime;
        
        // 如果距离上次刷新时间太短，且不是强制刷新，则跳过
        if (!force && timeSinceLastRefresh < MINIMUM_REFRESH_INTERVAL) {
            return;
        }

        const devices = await deviceManager.getDevices();
        const devicesWithCustomNames = await Promise.all(devices.map(async device => ({
            ...device,
            customName: await settingsManager.getDeviceCustomName(device.id)
        })));
        
        if (mainWindow) {
            mainWindow.webContents.send('devices-updated', devicesWithCustomNames);
        }
        
        lastRefreshTime = now;
        return devicesWithCustomNames; // 返回处理后的设备列表
    } catch (error) {
        console.error('刷新设备列表失败:', error);
        throw error; // 抛出错误以便上层处理
    }
}

// 设置设备列表刷新定时器
async function setupDeviceListRefresh() {
    // 清除现有的定时器
    if (deviceListRefreshInterval) {
        clearInterval(deviceListRefreshInterval);
        deviceListRefreshInterval = null;
    }

    // 获取设备列表刷新设置
    const settings = await settingsManager.getDeviceListSettings();
    if (!settings) return;

    // 根据刷新模式设置刷新
    switch (settings.refreshMode) {
        case 'auto':
            // 自动刷新模式
            deviceListRefreshInterval = setInterval(() => {
                refreshDeviceList();
            }, Math.max(settings.refreshInterval, MINIMUM_REFRESH_INTERVAL));
            break;
        case 'smart':
            // 智能刷新模式，设置一个较长的基础刷新间隔
            deviceListRefreshInterval = setInterval(() => {
                refreshDeviceList();
            }, Math.max(settings.refreshInterval * 2, 10000));
            break;
        case 'manual':
            // 手动刷新模式，不设置定时器
            break;
    }
}

// 初始化时设置刷新
app.whenReady().then(async () => {
    try {
        // 等待设置管理器初始化
        await settingsManager.waitForInit();
        
        // 验证设置
        log('验证应用程序设置...');
        const scrcpySettings = await settingsManager.getScrcpySettings();
        const deviceListSettings = await settingsManager.getDeviceListSettings();
        
        log('当前scrcpy设置:', JSON.stringify(scrcpySettings, null, 2));
        log('当前设备列表设置:', JSON.stringify(deviceListSettings, null, 2));
        
        if (!scrcpySettings || !deviceListSettings) {
            logError('设置验证失败：部分设置缺失');
        }
        
        createWindow();
        await setupDeviceListRefresh();
    } catch (error) {
        logError('应用程序启动时验证设置失败:', error);
        // 继续启动应用，但记录错误
        createWindow();
        await setupDeviceListRefresh();
    }
});

// 设备列表设置相关 IPC 处理
ipcMain.handle('get-device-list-settings', async () => {
    await settingsManager.waitForInit();
    return await settingsManager.getDeviceListSettings();
});

ipcMain.handle('update-device-list-settings', async (event, settings) => {
    await settingsManager.waitForInit();
    const updatedSettings = await settingsManager.updateDeviceListSettings(settings);
    await setupDeviceListRefresh(); // 更新设置后重新设置刷新定时器
    return updatedSettings;
});

// 手动刷新设备列表
ipcMain.handle('refresh-device-list', async () => {
    await refreshDeviceList(true);
    return true;
});

// 修改现有的设备相关处理函数，添加智能刷新支持
ipcMain.handle('get-devices', async () => {
    try {
        const devices = await deviceManager.getDevices();
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

ipcMain.handle('pair-device', async (event, { ip, port, code }) => {
    const result = await deviceManager.pairDevice(ip, port, code);
    
    // 智能刷新：配对后刷新
    const settings = await settingsManager.getDeviceListSettings();
    if (settings.refreshMode === 'smart' && settings.smartRefreshEvents.includes('pair')) {
        await refreshDeviceList(true);
    }
    
    return result;
});

ipcMain.handle('connect-device', async (event, { ip, port }) => {
    const result = await deviceManager.connectDevice(ip, port);
    
    // 智能刷新：连接后刷新
    const settings = await settingsManager.getDeviceListSettings();
    if (settings.refreshMode === 'smart' && settings.smartRefreshEvents.includes('connect')) {
        await refreshDeviceList(true);
    }
    
    return result;
});

ipcMain.handle('disconnect-device', async (event, deviceId) => {
    const result = await deviceManager.disconnectDevice(deviceId);
    
    // 智能刷新：断开连接后刷新
    const settings = await settingsManager.getDeviceListSettings();
    if (settings.refreshMode === 'smart' && settings.smartRefreshEvents.includes('disconnect')) {
        await refreshDeviceList(true);
    }
    
    return result;
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        titleBarStyle: 'hiddenInset',
        vibrancy: 'under-window',
        visualEffectState: 'active',
        backgroundColor: '#00ffffff',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // 设置窗口背景为透明
    mainWindow.setBackgroundColor('#00000000');

    mainWindow.loadFile('frontend/index.html');
    
    // 开发环境下打开开发者工具
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', async (event) => {
    try {
        event.preventDefault(); // 阻止退出，直到数据库安全关闭
        
        // 等待设置管理器初始化
        await settingsManager.waitForInit();
        
        // 关闭数据库连接
        await settingsManager.close();
        
        // 现在可以安全退出了
        app.exit(0);
    } catch (error) {
        logError('应用程序退出时出错:', error);
        app.exit(1); // 如果出错，使用错误代码退出
    }
});

app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        try {
            // 等待设置管理器初始化
            await settingsManager.waitForInit();
            
            createWindow();
            await setupDeviceListRefresh();
        } catch (error) {
            logError('重新创建窗口时出错:', error);
        }
    }
});

// 设置相关 IPC 处理
ipcMain.handle('get-scrcpy-settings', async () => {
    try {
        await settingsManager.waitForInit();
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
        await settingsManager.waitForInit();
        log('收到更新scrcpy设置请求');
        log('原始设置:', JSON.stringify(settings, null, 2));
        
        // 移除任何不可序列化的属性
        const cleanSettings = {};
        for (const [key, value] of Object.entries(settings)) {
            if (value !== undefined && value !== null && typeof value !== 'function') {
                cleanSettings[key] = value;
            }
        }
        
        log('清理后的设置:', JSON.stringify(cleanSettings, null, 2));
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