const { contextBridge, ipcRenderer } = require('electron');

// 暴露给渲染进程的API
contextBridge.exposeInMainWorld('api', {
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

    // 获取设置
    getSettings: async () => {
        try {
            return await ipcRenderer.invoke('get-settings');
        } catch (error) {
            console.error('获取设置失败:', error);
            throw error;
        }
    },

    // 更新设置
    updateSettings: async (settings) => {
        try {
            return await ipcRenderer.invoke('update-settings', settings);
        } catch (error) {
            console.error('更新设置失败:', error);
            throw error;
        }
    }
}); 