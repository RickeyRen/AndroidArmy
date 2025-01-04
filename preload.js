const { contextBridge, ipcRenderer } = require('electron');

// 添加调试日志函数
const debug = (message, ...args) => {
    console.log(`[Preload] ${message}`, ...args);
};

// 错误日志函数
const logError = (message, error) => {
    console.error(`[Preload] ${message}:`, error);
    console.error('Error stack:', error.stack);
};

// 创建安全的 IPC 调用包装器
const createSafeIPCCall = (channelName, ...args) => {
    debug(`Calling IPC channel: ${channelName}`, ...args);
    try {
        return ipcRenderer.invoke(channelName, ...args)
            .then(result => {
                debug(`IPC call result for ${channelName}:`, result);
                return result;
            })
            .catch(error => {
                logError(`IPC call failed for ${channelName}`, error);
                throw error;
            });
    } catch (error) {
        logError(`Failed to make IPC call to ${channelName}`, error);
        throw error;
    }
};

contextBridge.exposeInMainWorld('api', {
    // 窗口控制
    windowControl: {
        minimize: async () => {
            debug('Calling minimize');
            try {
                const result = await createSafeIPCCall('window-control', 'minimize');
                debug('Minimize result:', result);
                return result;
            } catch (error) {
                logError('Minimize failed', error);
                throw error;
            }
        },
        maximize: async () => {
            debug('Calling maximize');
            try {
                debug('Sending maximize command to main process');
                const result = await createSafeIPCCall('window-control', 'maximize');
                debug('Maximize command result:', result);
                return result;
            } catch (error) {
                logError('Maximize failed', error);
                throw new Error(`最大化窗口失败: ${error.message}`);
            }
        },
        close: async () => {
            debug('Calling close');
            try {
                const result = await createSafeIPCCall('window-control', 'close');
                debug('Close result:', result);
                return result;
            } catch (error) {
                logError('Close failed', error);
                throw error;
            }
        }
    },
    
    // 窗口状态监听
    onWindowStateChange: (callback) => {
        debug('Setting up window state change listener');
        try {
            if (!callback || typeof callback !== 'function') {
                throw new Error('Invalid callback provided for window state change');
            }
            ipcRenderer.on('window-state-change', (event, isMaximized) => {
                debug('Window state change event received:', isMaximized);
                try {
                    callback(event, isMaximized);
                } catch (error) {
                    logError('Error in window state change callback', error);
                }
            });
        } catch (error) {
            logError('Failed to set up window state change listener', error);
            throw error;
        }
    },
    
    // 设备管理
    getDevices: () => ipcRenderer.invoke('get-devices'),
    connectDevice: (deviceId) => ipcRenderer.invoke('connect-device', deviceId),
    disconnectDevice: (deviceId) => ipcRenderer.invoke('disconnect-device', deviceId),
    pairDevice: (ip, port, code) => ipcRenderer.invoke('pair-device', ip, port, code),
    startScrcpy: (deviceId) => ipcRenderer.invoke('start-scrcpy', deviceId),
    stopScrcpy: (deviceId) => ipcRenderer.invoke('stop-scrcpy', deviceId),
    updateDeviceName: (deviceId, newName) => ipcRenderer.invoke('update-device-name', deviceId, newName),
    
    // 设置管理
    getScrcpySettings: () => ipcRenderer.invoke('get-scrcpy-settings'),
    saveScrcpySettings: (settings) => ipcRenderer.invoke('saveScrcpySettings', settings),
    
    // 设备列表刷新设置
    getDeviceListSettings: () => ipcRenderer.invoke('get-device-list-settings'),
    updateDeviceListSettings: (settings) => ipcRenderer.invoke('update-device-list-settings', settings),
    refreshDeviceList: () => ipcRenderer.invoke('refresh-device-list'),
    
    // 命令和脚本
    executeCommand: (deviceId, command) => ipcRenderer.invoke('execute-command', deviceId, command),
    uploadScript: (name, content) => ipcRenderer.invoke('upload-script', name, content),
    getScripts: () => ipcRenderer.invoke('get-scripts'),
    executeScript: (scriptName, devices, options) => ipcRenderer.invoke('execute-script', scriptName, devices, options),
    
    // 通知
    showNotification: (message, type) => ipcRenderer.invoke('show-notification', message, type),
    
    // 事件监听
    onDevicesUpdated: (callback) => {
        ipcRenderer.on('devices-updated', (event, devices) => callback(devices));
    },
    
    // 设备名称管理
    getDeviceDisplayNames: () => ipcRenderer.invoke('get-device-display-names'),
    setDeviceDisplayName: (ipPort, displayName) => ipcRenderer.invoke('set-device-display-name', { ipPort, displayName }),
}); 