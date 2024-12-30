const { createApp } = Vue;

const app = createApp({
    data() {
        return {
            devices: [],
            connectedDevices: new Set(),
            selectedDevices: [],
            currentCommand: '',
            notifications: [],
            notificationId: 0,
            connectForm: {
                ip: '',
                port: '',
                isConnecting: false
            },
            pairForm: {
                ip: '',
                port: '',
                code: '',
                isPairing: false
            },
            showSettings: false,
            refreshInterval: null,
            isEditing: false,
            loadingDevices: false,
            scrcpySettings: {
                maxBitrate: 2000000,
                maxFps: 30,
                screenWidth: 800,
                screenHeight: 600,
                turnScreenOff: true,
                stayAwake: true,
                showTouches: false,
                fullscreen: false,
                borderless: true,
                alwaysOnTop: false,
                audioEnabled: false,
                videoBitrateKbps: 2000,
                maxSize: 0,
                lockVideoOrientation: -1,
                encoderName: '',
                powerOffOnClose: true,
                clipboardAutosync: true,
                shortcutKeysEnabled: true
            },
            deviceListSettings: {
                refreshMode: 'smart',
                refreshInterval: 5000,
                smartRefreshEvents: ['connect', 'disconnect', 'pair']
            }
        };
    },

    async created() {
        // 初始化设置
        await this.loadSettings();
        
        // 加载设备列表
        await this.loadDevices();
        
        // 设置自动刷新
        if (this.deviceListSettings.refreshMode !== 'manual') {
            this.refreshInterval = setInterval(() => {
                this.refreshDevices();
            }, this.deviceListSettings.refreshInterval);
        }
        
        // 监听设备更新事件
        window.api.onDevicesUpdated(async (devices) => {
            console.log('收到设备更新事件:', devices);
            await this.loadDevices();
        });
    },

    beforeDestroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    },

    methods: {
        async loadDevices() {
            if (this.loadingDevices) return;
            
            this.loadingDevices = true;
            try {
                console.log('开始加载设备列表...');
                const devices = await window.api.getDevices();
                console.log('获取到设备列表:', devices);
                
                if (!Array.isArray(devices)) {
                    console.error('设备列表格式错误:', devices);
                    this.showNotification('设备列表格式错误', 'error');
                    return;
                }

                // 清空当前设备列表
                this.devices = [];
                this.connectedDevices.clear();
                
                // 处理设备列表
                this.devices = devices.map(device => ({
                    ...device,
                    isEditing: false,
                    editingName: '',
                    name: device.display_name || device.ip_port
                }));
                
                // 更新已连接设备集合
                devices.forEach(device => {
                    if (device.status === 'online') {
                        this.connectedDevices.add(device.ip_port);
                    }
                });
                
                console.log('处理后的设备列表:', this.devices);
            } catch (error) {
                console.error('加载设备失败:', error);
                this.showNotification('加载设备失败: ' + error.message, 'error');
            } finally {
                setTimeout(() => {
                    this.loadingDevices = false;
                }, 500);
            }
        },

        refreshDevices() {
            if (!this.isEditing) {
                this.loadDevices();
            }
        },

        isDeviceSelected(deviceId) {
            return this.selectedDevices.includes(deviceId);
        },

        toggleDeviceSelection(device) {
            const index = this.selectedDevices.indexOf(device.ip_port);
            if (index === -1) {
                this.selectedDevices.push(device.ip_port);
            } else {
                this.selectedDevices.splice(index, 1);
            }
        },

        async startEditingName(device) {
            device.isEditing = true;
            device.editingName = device.name || device.ip_port;
            this.$nextTick(() => {
                const input = this.$refs.nameInput;
                if (input && input.length > 0) {
                    input[0].focus();
                    input[0].select();
                }
            });
        },

        async saveDeviceName(device) {
            if (!device.isEditing) return;
            
            try {
                const newName = device.editingName.trim();
                if (newName && newName !== device.name) {
                    console.log('正在更新设备名称:', {
                        deviceId: device.ip_port,
                        oldName: device.name,
                        newName: newName
                    });
                    
                    const result = await window.api.updateDeviceName(device.ip_port, newName);
                    console.log('设备名称更新结果:', result);
                    
                    if (result && result.success) {
                        device.name = newName;
                        this.showNotification('设备名称已更新', 'success');
                    } else {
                        throw new Error(result?.message || '更新失败');
                    }
                }
            } catch (error) {
                console.error('更新设备名称失败:', error);
                this.showNotification(`更新设备名称失败: ${error.message}`, 'error');
            } finally {
                device.isEditing = false;
                device.editingName = '';
            }
        },

        cancelEditingName(device) {
            device.isEditing = false;
            device.editingName = '';
        },

        validateIPAddress(ip) {
            const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
            if (!ipRegex.test(ip)) {
                this.showNotification('请输入有效的IP地址', 'error');
                return false;
            }
            const parts = ip.split('.');
            for (let part of parts) {
                const num = parseInt(part);
                if (num < 0 || num > 255) {
                    this.showNotification('IP地址的每个部分必须在0-255之间', 'error');
                    return false;
                }
            }
            return true;
        },

        validatePort(port) {
            if (!port) return true; // 允许空端口
            const portNum = parseInt(port);
            if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
                this.showNotification('端口号必须在1-65535之间', 'error');
                return false;
            }
            return true;
        },

        async connectDevice(deviceId) {
            try {
                this.connectForm.isConnecting = true;
                let ip, port;
                
                if (deviceId) {
                    // 如果传入了设备ID（ip_port格式），则解析它
                    const parts = deviceId.split(':');
                    ip = parts[0];
                    port = parts[1] || '5555';
                } else {
                    // 否则使用表单中的值
                    ip = this.connectForm.ip;
                    port = this.connectForm.port || '5555';
                }

                if (!ip || !this.validateIPAddress(ip)) {
                    this.showNotification('请输入有效的IP地址', 'error');
                    return;
                }

                if (!this.validatePort(port)) {
                    this.showNotification('请输入有效的端口号', 'error');
                    return;
                }

                console.log('正在连接设备:', { ip, port });
                await window.api.connectDevice(ip, port);
                this.showNotification('设备连接成功', 'success');
                this.connectForm.ip = '';
                this.connectForm.port = '';

                // 智能刷新：连接设备后刷新列表
                if (this.deviceListSettings.refreshMode === 'smart' && 
                    this.deviceListSettings.smartRefreshEvents.includes('connect')) {
                    await this.refreshDevices();
                }
            } catch (error) {
                console.error('连接设备失败:', error);
                this.showNotification('连接设备失败: ' + error.message, 'error');
            } finally {
                this.connectForm.isConnecting = false;
            }
        },

        async disconnectDevice(deviceId) {
            try {
                await window.api.disconnectDevice(deviceId);
                this.showNotification('设备已断开连接', 'success');

                // 智能刷新：断开设备后刷新列表
                if (this.deviceListSettings.refreshMode === 'smart' && 
                    this.deviceListSettings.smartRefreshEvents.includes('disconnect')) {
                    await this.refreshDevices();
                }
            } catch (error) {
                console.error('断开设备失败:', error);
                this.showNotification('断开设备失败: ' + error.message, 'error');
            }
        },

        async startScrcpy(deviceId) {
            try {
                console.log('开始启动投屏，设备ID:', deviceId);
                await window.api.startScrcpy(deviceId);
                this.showNotification('投屏已启动', 'success');
            } catch (error) {
                console.error('启动投屏失败:', error);
                this.showNotification('启动投屏失败: ' + error.message, 'error');
            }
        },

        showNotification(message, type = 'info') {
            const id = this.notificationId++;
            const existingNotification = this.notifications.find(n => n.message === message);
            if (existingNotification) {
                existingNotification.id = id;
                return;
            }

            const notification = {
                id,
                message,
                type
            };
            this.notifications.push(notification);

            // 3秒后自动关闭通知
            setTimeout(() => {
                this.closeNotification(id);
            }, 3000);
        },

        closeNotification(id) {
            const index = this.notifications.findIndex(n => n.id === id);
            if (index !== -1) {
                this.notifications.splice(index, 1);
            }
        },

        async loadSettings() {
            try {
                console.log('开始加载设置...');
                const [scrcpySettings, deviceListSettings] = await Promise.all([
                    window.api.getScrcpySettings(),
                    window.api.getDeviceListSettings()
                ]);

                if (scrcpySettings) {
                    this.scrcpySettings = scrcpySettings;
                }
                if (deviceListSettings) {
                    this.deviceListSettings = deviceListSettings;
                }
                console.log('最终设置值:', { scrcpySettings: this.scrcpySettings, deviceListSettings: this.deviceListSettings });
            } catch (error) {
                console.error('加载设置失败:', error);
                this.showNotification('加载设置失败: ' + error.message, 'error');
            }
        },

        openSettings() {
            console.log('打开设置窗口');
            this.showSettings = true;
        },

        closeSettings() {
            console.log('关闭设置窗口');
            this.showSettings = false;
        },

        async saveSettings() {
            try {
                console.log('保存设置...');
                
                // 创建纯对象副本，确保可以被序列化
                const scrcpySettingsToSave = {
                    maxBitrate: this.scrcpySettings.maxBitrate,
                    maxFps: this.scrcpySettings.maxFps,
                    screenWidth: this.scrcpySettings.screenWidth,
                    screenHeight: this.scrcpySettings.screenHeight,
                    turnScreenOff: this.scrcpySettings.turnScreenOff,
                    stayAwake: this.scrcpySettings.stayAwake,
                    showTouches: this.scrcpySettings.showTouches,
                    fullscreen: this.scrcpySettings.fullscreen,
                    borderless: this.scrcpySettings.borderless,
                    alwaysOnTop: this.scrcpySettings.alwaysOnTop,
                    audioEnabled: this.scrcpySettings.audioEnabled,
                    videoBitrateKbps: this.scrcpySettings.videoBitrateKbps,
                    maxSize: this.scrcpySettings.maxSize,
                    lockVideoOrientation: this.scrcpySettings.lockVideoOrientation,
                    encoderName: this.scrcpySettings.encoderName,
                    powerOffOnClose: this.scrcpySettings.powerOffOnClose,
                    clipboardAutosync: this.scrcpySettings.clipboardAutosync,
                    shortcutKeysEnabled: this.scrcpySettings.shortcutKeysEnabled
                };

                const deviceListSettingsToSave = {
                    refreshMode: this.deviceListSettings.refreshMode,
                    refreshInterval: this.deviceListSettings.refreshInterval,
                    smartRefreshEvents: [...this.deviceListSettings.smartRefreshEvents]
                };

                console.log('scrcpy设置:', scrcpySettingsToSave);
                console.log('设备列表设置:', deviceListSettingsToSave);

                // 分别保存设置，这样一个失败不会影响另一个
                try {
                    await window.api.saveScrcpySettings(scrcpySettingsToSave);
                    console.log('scrcpy设置保存成功');
                } catch (error) {
                    console.error('保存scrcpy设置失败:', error);
                    this.showNotification('保存scrcpy设置失败: ' + error.message, 'error');
                    throw error;
                }

                try {
                    await window.api.updateDeviceListSettings(deviceListSettingsToSave);
                    console.log('设备列表设置保存成功');
                } catch (error) {
                    console.error('保存设备列表设置失败:', error);
                    this.showNotification('保存设备列表设置失败: ' + error.message, 'error');
                    throw error;
                }

                this.showNotification('设置已保存', 'success');
                this.showSettings = false;

                // 重新设置设备列表刷新
                await this.setupDeviceListRefresh();
            } catch (error) {
                console.error('保存设置失败:', error);
                // 不关闭设置窗口，让用户可以重试
            }
        },

        async resetSettings() {
            try {
                // 创建纯对象的默认设置
                const defaultScrcpySettings = {
                    maxBitrate: 2000000,
                    maxFps: 30,
                    screenWidth: 800,
                    screenHeight: 600,
                    turnScreenOff: true,
                    stayAwake: true,
                    showTouches: false,
                    fullscreen: false,
                    borderless: true,
                    alwaysOnTop: false,
                    audioEnabled: false,
                    videoBitrateKbps: 2000,
                    maxSize: 0,
                    lockVideoOrientation: -1,
                    encoderName: '',
                    powerOffOnClose: true,
                    clipboardAutosync: true,
                    shortcutKeysEnabled: true
                };

                const defaultDeviceListSettings = {
                    refreshMode: 'smart',
                    refreshInterval: 5000,
                    smartRefreshEvents: ['connect', 'disconnect', 'pair']
                };

                // 先更新本地状态
                this.scrcpySettings = { ...defaultScrcpySettings };
                this.deviceListSettings = { ...defaultDeviceListSettings };

                // 分开保存设置，这样一个失败不会影响另一个
                try {
                    await window.api.saveScrcpySettings(defaultScrcpySettings);
                    console.log('scrcpy设置重置成功');
                } catch (error) {
                    console.error('重置scrcpy设置失败:', error);
                    throw error;
                }

                try {
                    await window.api.updateDeviceListSettings(defaultDeviceListSettings);
                    console.log('设备列表设置重置成功');
                } catch (error) {
                    console.error('重置设备列表设置失败:', error);
                    throw error;
                }

                this.showNotification('设置已重置为默认值', 'success');
            } catch (error) {
                console.error('重置设置失败:', error);
                this.showNotification('重置设置失败: ' + error.message, 'error');
            }
        },

        setupDeviceListRefresh() {
            // 清除现有的刷新定时器
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }

            // 根据刷新模式设置刷新
            switch (this.deviceListSettings.refreshMode) {
                case 'auto':
                    this.refreshInterval = setInterval(() => {
                        this.refreshDevices();
                    }, this.deviceListSettings.refreshInterval);
                    break;
                case 'smart':
                    // 智能刷新模式下，仍然保持一个较长的刷新间隔
                    this.refreshInterval = setInterval(() => {
                        this.refreshDevices();
                    }, Math.max(this.deviceListSettings.refreshInterval * 2, 10000));
                    break;
            }
        },

        onBitrateInput(event) {
            // 将 Mbps 转换为 Kbps
            this.scrcpySettings.videoBitrateKbps = Math.round(event.target.value * 1000);
        }
    }
});

// 挂载Vue应用
app.mount('#app');

// 添加标题栏按钮事件处理
document.addEventListener('DOMContentLoaded', () => {
    const closeButton = document.querySelector('.titlebar-button.close');
    const minimizeButton = document.querySelector('.titlebar-button.minimize');
    const maximizeButton = document.querySelector('.titlebar-button.maximize');

    closeButton.addEventListener('click', () => {
        window.api.closeWindow();
    });

    minimizeButton.addEventListener('click', () => {
        window.api.minimizeWindow();
    });

    maximizeButton.addEventListener('click', () => {
        window.api.maximizeWindow();
    });
}); 