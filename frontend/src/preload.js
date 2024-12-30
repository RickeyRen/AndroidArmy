// 设备连接
connectDevice: async (ip, port) => {
    try {
        return await ipcRenderer.invoke('connect-device', ip, port);
    } catch (error) {
        console.error('连接设备失败:', error);
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