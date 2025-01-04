const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// 设置应用程序编码
app.commandLine.appendSwitch('lang', 'zh-CN');
app.commandLine.appendSwitch('force-chinese-ime', 'true');

// 设置进程编码
if (process.platform === 'win32') {
    process.env.LANG = 'zh_CN.UTF-8';
    process.env.ELECTRON_FORCE_CHINESE_IME = 'true';
}

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

// 调试日志函数
function debug(message, ...args) {
    console.log(`[Main] ${message}`, ...args);
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
        const devicesWithDisplayNames = await Promise.all(devices.map(async device => ({
            ...device,
            displayName: await settingsManager.getDeviceCustomName(device.ip_port)
        })));
        
        if (mainWindow) {
            mainWindow.webContents.send('devices-updated', devicesWithDisplayNames);
        }
        
        lastRefreshTime = now;
        return devicesWithDisplayNames;
    } catch (error) {
        console.error('刷新设备列表失败:', error);
        throw error;
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
        await setupDeviceListRefresh().catch(e => logError('设置设备列表刷新失败:', e));
    }
}).catch(error => {
    logError('应用程序启动失败:', error);
    app.quit();
});

// 设备列表设置相关 IPC 处理
ipcMain.handle('get-device-list-settings', async () => {
    try {
        await settingsManager.waitForInit();
        const settings = await settingsManager.getDeviceListSettings();
        if (!settings) {
            throw new Error('无法获取设备列表设置');
        }
        return settings;
    } catch (error) {
        logError('获取设备列表设置失败:', error);
        return settingsManager.defaultSettings.deviceList;
    }
});

ipcMain.handle('update-device-list-settings', async (event, settings) => {
    try {
        await settingsManager.waitForInit();
        if (!settings) {
            throw new Error('设置不能为空');
        }
        const result = await settingsManager.updateDeviceListSettings(settings);
        return result;
    } catch (error) {
        logError('更新设备列表设置失败:', error);
        return settingsManager.defaultSettings.deviceList;
    }
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
        const devicesWithDisplayNames = await Promise.all(devices.map(async device => ({
            ...device,
            displayName: await settingsManager.getDeviceCustomName(device.ip_port)
        })));
        return devicesWithDisplayNames;
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

// 设备连接
ipcMain.handle('connect-device', async (event, ip, port) => {
    try {
        console.log('正在连接设备:', { ip, port });
        const result = await deviceManager.connectDevice(ip, port);
        console.log('设备连接结果:', result);
        return result;
    } catch (error) {
        console.error('连接设备失败:', error);
        throw error;
    }
});

// 设备断开连接
ipcMain.handle('disconnect-device', async (event, deviceId) => {
    try {
        console.log('正在断开设备:', deviceId);
        const result = await deviceManager.disconnectDevice(deviceId);
        console.log('设备断开结果:', result);
        return result;
    } catch (error) {
        console.error('断开设备失败:', error);
        throw error;
    }
});

function createWindow() {
    const windowOptions = {
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    };

    // macOS 特定配置
    if (process.platform === 'darwin') {
        Object.assign(windowOptions, {
            titleBarStyle: 'hiddenInset',
            trafficLightPosition: { x: 20, y: 20 },
            vibrancy: 'menu',
            visualEffectState: 'active',
            backgroundColor: '#00000000',
            transparent: true
        });
    } 
    // Windows 特定配置
    else if (process.platform === 'win32') {
        Object.assign(windowOptions, {
            transparent: true,
            frame: false,
            webPreferences: {
                ...windowOptions.webPreferences,
                backgroundThrottling: false
            },
            autoHideMenuBar: true,
            darkTheme: true,
            thickFrame: true, // 启用窗口阴影和调整大小
            hasShadow: true,
            resizable: true, // 确保窗口可以调整大小
            maximizable: true // 确保窗口可以最大化
        });
    }

    mainWindow = new BrowserWindow(windowOptions);
    
    // Windows 平台启用特效
    if (process.platform === 'win32') {
        mainWindow.setBackgroundColor('#00000000');

        // 监听窗口最大化状态变化
        mainWindow.on('maximize', () => {
            console.log('[Main] Window maximized event');
            mainWindow.webContents.send('window-state-change', true);
        });

        mainWindow.on('unmaximize', () => {
            console.log('[Main] Window restored event');
            mainWindow.webContents.send('window-state-change', false);
        });

        // 初始化时发送窗口状态
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('[Main] Window loaded, sending initial state');
            mainWindow.webContents.send('window-state-change', mainWindow.isMaximized());
        });
    }

    // 开发环境下打开开发者工具
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.loadFile('frontend/index.html');
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
        const settings = await settingsManager.getScrcpySettings();
        if (!settings) {
            throw new Error('无法获取 scrcpy 设置');
        }
        return settings;
    } catch (error) {
        logError('获取 scrcpy 设置失败:', error);
        return settingsManager.defaultSettings.scrcpy;
    }
});

ipcMain.handle('saveScrcpySettings', async (event, settings) => {
    try {
        await settingsManager.saveScrcpySettings(settings);
        return { success: true };
    } catch (error) {
        logError('更新 scrcpy 设置失败:', error);
        throw error;
    }
});

// 设备名称相关 IPC 处理
ipcMain.handle('get-device-display-names', async () => {
    return settingsManager.getAllDeviceDisplayNames();
});

ipcMain.handle('set-device-display-name', async (event, { ipPort, displayName }) => {
    return await settingsManager.setDeviceDisplayName(ipPort, displayName);
});

// Scrcpy 相关 IPC 处理
ipcMain.handle('start-scrcpy', async (event, deviceId) => {
    try {
        // 获取设备特定设置
        const deviceSettings = await settingsManager.getDeviceSettings(deviceId);
        
        // 如果设备有特定的编码器设置，使用它
        if (deviceSettings.encoder_name) {
            const scrcpySettings = await settingsManager.getScrcpySettings();
            scrcpySettings.encoderName = deviceSettings.encoder_name;
            await settingsManager.saveScrcpySettings(scrcpySettings);
        }
        
        return await scrcpyManager.startSession(deviceId);
    } catch (error) {
        logError('启动scrcpy失败:', error);
        throw error;
    }
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

// 统一的窗口控制处理程序
ipcMain.handle('window-control', async (event, command) => {
    console.log('[Main] Received window control command:', command);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
        console.error('[Main] Window not found');
        return false;
    }

    try {
        switch (command) {
            case 'minimize':
                console.log('[Main] Minimizing window');
                window.minimize();
                return true;
            case 'maximize':
                console.log('[Main] Current maximize state:', window.isMaximized());
                if (window.isMaximized()) {
                    window.unmaximize();
                    console.log('[Main] Window restored');
                    window.webContents.send('window-state-change', false);
                } else {
                    window.maximize();
                    console.log('[Main] Window maximized');
                    window.webContents.send('window-state-change', true);
                }
                return true;
            case 'close':
                console.log('[Main] Closing window');
                window.close();
                return true;
            default:
                console.error('[Main] Unknown window control command:', command);
                return false;
        }
    } catch (error) {
        console.error('[Main] Error executing window control command:', error);
        return false;
    }
});

// 设备设置相关 IPC 处理
ipcMain.handle('get-device-settings', async (event, deviceId) => {
    try {
        await settingsManager.waitForInit();
        return await settingsManager.getDeviceSettings(deviceId);
    } catch (error) {
        logError('获取设备设置失败:', error);
        throw error;
    }
});

ipcMain.handle('update-device-settings', async (event, deviceId, settings) => {
    try {
        await settingsManager.waitForInit();
        return await settingsManager.updateDeviceSettings(deviceId, settings);
    } catch (error) {
        logError('更新设备设置失败:', error);
        throw error;
    }
}); 