const { contextBridge, ipcRenderer } = require('electron');

// 添加调试日志
console.log('preload: 开始初始化 API');

// 定义 API 对象
const api = {
    // 删除设备
    deleteDevice: async (deviceId) => {
        try {
            console.log('preload: 正在删除设备:', deviceId);
            if (!deviceId) {
                throw new Error('设备ID不能为空');
            }
            const result = await ipcRenderer.invoke('delete-device', deviceId);
            console.log('preload: 删除设备结果:', result);
            return result;
        } catch (error) {
            console.error('preload: 删除设备失败:', error);
            throw error;
        }
    },

    // 设备连接
    connectDevice: async (params) => {
        try {
            console.log('preload: 正在连接设备:', params);
            const { ip, port } = params;
            if (!ip || !port) {
                throw new Error('IP地址和端口号都不能为空');
            }
            const result = await ipcRenderer.invoke('connect-device', params);
            console.log('preload: 连接设备结果:', result);
            return result;
        } catch (error) {
            console.error('preload: 连接设备失败:', error);
            throw error;
        }
    },

    // 设备断开连接
    disconnectDevice: async (deviceId) => {
        try {
            return await ipcRenderer.invoke('disconnect-device', deviceId);
        } catch (error) {
            console.error('断开设备失败:', error);
            throw error;
        }
    },

    // 获取设备列表
    getDevices: async () => {
        try {
            return await ipcRenderer.invoke('get-devices');
        } catch (error) {
            console.error('获取设备列表失败:', error);
            throw error;
        }
    },

    // 设备配对
    pairDevice: async (ip, port, code) => {
        try {
            return await ipcRenderer.invoke('pair-device', ip, port, code);
        } catch (error) {
            console.error('配对设备失败:', error);
            throw error;
        }
    },

    // 启动scrcpy
    startScrcpy: async (deviceId) => {
        try {
            return await ipcRenderer.invoke('start-scrcpy', deviceId);
        } catch (error) {
            console.error('启动scrcpy失败:', error);
            throw error;
        }
    },

    // 更新设备名称
    updateDeviceName: async (deviceId, displayName) => {
        try {
            return await ipcRenderer.invoke('update-device-name', deviceId, displayName);
        } catch (error) {
            console.error('更新设备名称失败:', error);
            throw error;
        }
    },

    // 获取scrcpy设置
    getScrcpySettings: async () => {
        try {
            return await ipcRenderer.invoke('get-scrcpy-settings');
        } catch (error) {
            console.error('获取scrcpy设置失败:', error);
            throw error;
        }
    },

    // 保存scrcpy设置
    saveScrcpySettings: async (settings) => {
        try {
            return await ipcRenderer.invoke('save-scrcpy-settings', settings);
        } catch (error) {
            console.error('保存scrcpy设置失败:', error);
            throw error;
        }
    },

    // 获取设备列表设置
    getDeviceListSettings: async () => {
        try {
            return await ipcRenderer.invoke('get-device-list-settings');
        } catch (error) {
            console.error('获取设备列表设置失败:', error);
            throw error;
        }
    },

    // 更新设备列表设置
    updateDeviceListSettings: async (settings) => {
        try {
            return await ipcRenderer.invoke('update-device-list-settings', settings);
        } catch (error) {
            console.error('更新设备列表设置失败:', error);
            throw error;
        }
    },

    // 监听设备更新事件
    onDevicesUpdated: (callback) => {
        ipcRenderer.on('devices-updated', (event, devices) => {
            callback(devices);
        });
    },

    // 窗口控制
    windowControl: {
        minimize: async () => {
            return await ipcRenderer.invoke('window-control', 'minimize');
        },
        maximize: async () => {
            return await ipcRenderer.invoke('window-control', 'maximize');
        },
        close: async () => {
            return await ipcRenderer.invoke('window-control', 'close');
        }
    },

    // 监听窗口状态变化
    onWindowStateChange: (callback) => {
        ipcRenderer.on('window-state-changed', callback);
    }
};

// 添加调试日志
console.log('preload: API 对象已定义，可用方法:', Object.keys(api));
console.log('preload: deleteDevice 方法类型:', typeof api.deleteDevice);

// 导出 API
contextBridge.exposeInMainWorld('api', api);

// 添加调试日志
console.log('preload: API 已导出'); 