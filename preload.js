const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
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
    saveScrcpySettings: (settings) => ipcRenderer.invoke('update-scrcpy-settings', settings),
    
    // 命令和脚本
    executeCommand: (deviceId, command) => ipcRenderer.invoke('execute-command', deviceId, command),
    uploadScript: (name, content) => ipcRenderer.invoke('upload-script', name, content),
    getScripts: () => ipcRenderer.invoke('get-scripts'),
    executeScript: (scriptName, devices, options) => ipcRenderer.invoke('execute-script', scriptName, devices, options),
    
    // 通知
    showNotification: (message, type) => ipcRenderer.invoke('show-notification', message, type)
}); 