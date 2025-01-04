const { createApp } = Vue;

// 创建一个全局变量来存储 Vue 实例
let vueApp;

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
            isMaximized: false,
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
            },
            showDeviceModal: false,
            selectedDevice: null,
            encoderDisplayNames: {
                'h264': 'H.264',
                'h265': 'H.265 (HEVC)',
                'OMX.qcom.video.encoder.avc': '高通 H.264',
                'OMX.qcom.video.encoder.hevc': '高通 H.265',
                'OMX.MTK.VIDEO.ENCODER.AVC': '联发科 H.264',
                'OMX.MTK.VIDEO.ENCODER.HEVC': '联发科 H.265',
                'c2.android.avc.encoder': 'Android H.264',
                'c2.android.hevc.encoder': 'Android H.265'
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
                const result = await window.api.connectDevice(ip, port);
                
                if (result.success) {
                    this.showNotification('设备连接成功', 'success');
                    this.connectForm.ip = '';
                    this.connectForm.port = '';

                    // 智能刷新：连接设备后刷新列表
                    if (this.deviceListSettings.refreshMode === 'smart' && 
                        this.deviceListSettings.smartRefreshEvents.includes('connect')) {
                        await this.refreshDevices();
                    }
                } else {
                    // 检查是否是未配对导致的连接失败
                    if (result.message.includes('由于目标计算机积极拒绝') || 
                        result.message.includes('10061')) {
                        this.showNotification('设备未配对，请先在设备的开发者选项中启用"无线调试"，查看配对端口号并完成配对', 'warning', 10000);
                        // 只自动填充IP地址，不填充端口号
                        this.pairForm.ip = ip;
                    } else {
                        throw new Error(result.message);
                    }
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
                // 获取设备特定的编码器设置
                const device = this.devices.find(d => d.ip_port === deviceId);
                if (device && device.encoder_name) {
                    // 临时覆盖全局编码器设置
                    const originalEncoder = this.scrcpySettings.encoderName;
                    this.scrcpySettings.encoderName = device.encoder_name;
                    
                    await window.api.startScrcpy(deviceId);
                    
                    // 恢复全局设置
                    this.scrcpySettings.encoderName = originalEncoder;
                } else {
                    await window.api.startScrcpy(deviceId);
                }
            } catch (error) {
                console.error('启动scrcpy失败:', error);
                this.showNotification('启动scrcpy失败: ' + error.message, 'error');
            }
        },

        showNotification(message, type = 'info', duration = 3000) {
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

            // 使用传入的duration参数作为显示时间
            setTimeout(() => {
                this.closeNotification(id);
            }, duration);
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
            const mbps = parseFloat(event.target.value);
            if (!isNaN(mbps)) {
                // 将 Mbps 转换为 Kbps
                this.scrcpySettings.videoBitrateKbps = Math.round(mbps * 1000);
            }
        },

        showDeviceDetails(device) {
            this.selectedDevice = { ...device };
            this.showDeviceModal = true;
        },

        closeDeviceModal() {
            this.showDeviceModal = false;
            this.selectedDevice = null;
        },

        getEncoderDisplayName(encoderName) {
            return this.encoderDisplayNames[encoderName] || encoderName;
        },

        async saveDeviceSettings() {
            try {
                if (!this.selectedDevice) return;

                const deviceSettings = {
                    encoder_name: this.selectedDevice.encoder_name,
                    // 可以在这里添加更多设备特定设置
                };

                await window.api.updateDeviceSettings(this.selectedDevice.ip_port, deviceSettings);
                
                // 更新本地设备列表中的设置
                const deviceIndex = this.devices.findIndex(d => d.ip_port === this.selectedDevice.ip_port);
                if (deviceIndex !== -1) {
                    this.devices[deviceIndex] = {
                        ...this.devices[deviceIndex],
                        encoder_name: this.selectedDevice.encoder_name
                    };
                }

                this.showNotification('设备设置已保存', 'success');
                this.closeDeviceModal();
            } catch (error) {
                console.error('保存设备设置失败:', error);
                this.showNotification('保存设备设置失败: ' + error.message, 'error');
            }
        },

        async executeGroupCommand() {
            if (!this.selectedDevices.length || !this.currentCommand.trim()) {
                this.showNotification('请选择设备并输入命令', 'error');
                return;
            }

            try {
                const results = await Promise.all(
                    this.selectedDevices.map(deviceId =>
                        window.api.executeCommand(deviceId, this.currentCommand.trim())
                    )
                );

                const successCount = results.filter(r => r.success).length;
                const failCount = results.length - successCount;

                if (failCount === 0) {
                    this.showNotification(`命令已在 ${successCount} 个设备上执行成功`, 'success');
                } else {
                    this.showNotification(`命令执行完成: ${successCount} 成功, ${failCount} 失败`, 'warning');
                }

                this.currentCommand = ''; // 清空命令输入
            } catch (error) {
                console.error('执行群控命令失败:', error);
                this.showNotification(`执行群控命令失败: ${error.message}`, 'error');
            }
        },

        async pairDevice() {
            if (!this.pairForm.ip || !this.pairForm.code) {
                this.showNotification('请输入设备IP地址和配对码', 'error');
                return;
            }

            if (!this.validateIPAddress(this.pairForm.ip)) {
                return;
            }

            if (this.pairForm.port && !this.validatePort(this.pairForm.port)) {
                return;
            }

            this.pairForm.isPairing = true;

            try {
                const result = await window.api.pairDevice(
                    this.pairForm.ip,
                    this.pairForm.port || '5555',
                    this.pairForm.code
                );

                if (result.success) {
                    this.showNotification('设备配对成功', 'success');
                    // 清空表单
                    this.pairForm.ip = '';
                    this.pairForm.port = '';
                    this.pairForm.code = '';
                    // 刷新设备列表
                    await this.loadDevices();
                } else {
                    throw new Error(result.message || '配对失败');
                }
            } catch (error) {
                console.error('设备配对失败:', error);
                this.showNotification(`设备配对失败: ${error.message}`, 'error');
            } finally {
                this.pairForm.isPairing = false;
            }
        },

        updateMaximizeButton() {
            console.log('[Frontend] Updating maximize button, isMaximized:', this.isMaximized);
            const maximizeButton = document.querySelector('.window-control-button.maximize i');
            if (maximizeButton) {
                const newClassName = this.isMaximized ? 'mdi mdi-window-restore' : 'mdi mdi-window-maximize';
                console.log('[Frontend] Setting button class to:', newClassName);
                maximizeButton.className = newClassName;
            } else {
                console.error('[Frontend] Maximize button not found');
            }
        },

        async toggleMaximize() {
            try {
                console.log('[Frontend] Attempting to toggle maximize');
                if (!window.api || !window.api.windowControl) {
                    console.error('[Frontend] Window control API not available');
                    this.showNotification('窗口控制接口不可用', 'error');
                    return;
                }
                console.log('[Frontend] Calling window control maximize');
                const result = await window.api.windowControl.maximize();
                console.log('[Frontend] Toggle maximize result:', result);
                if (!result) {
                    throw new Error('窗口控制失败');
                }
            } catch (error) {
                console.error('[Frontend] 切换窗口最大化状态失败:', error);
                this.showNotification('窗口控制失败: ' + error.message, 'error');
            }
        }
    }
});

// 修改挂载代码，保存 Vue 实例
vueApp = app.mount('#app');

// 添加标题栏按钮事件处理
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Frontend] DOM Content Loaded');
    const closeButton = document.querySelector('.window-control-button.close');
    const minimizeButton = document.querySelector('.window-control-button.minimize');
    const maximizeButton = document.querySelector('.window-control-button.maximize');

    if (closeButton) {
        closeButton.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('[Frontend] Close button clicked');
            try {
                await window.api.windowControl.close();
            } catch (error) {
                console.error('[Frontend] Close failed:', error);
            }
        });
    }

    if (minimizeButton) {
        minimizeButton.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('[Frontend] Minimize button clicked');
            try {
                await window.api.windowControl.minimize();
            } catch (error) {
                console.error('[Frontend] Minimize failed:', error);
            }
        });
    }

    if (maximizeButton) {
        maximizeButton.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('[Frontend] Maximize button clicked');
            try {
                if (!vueApp) {
                    console.error('[Frontend] Vue app instance not found');
                    return;
                }
                await vueApp.toggleMaximize();
            } catch (error) {
                console.error('[Frontend] Maximize failed:', error);
            }
        });
    }

    // 监听窗口状态变化
    if (window.api && window.api.onWindowStateChange) {
        window.api.onWindowStateChange((event, isMaximized) => {
            console.log('[Frontend] Window state changed:', isMaximized);
            if (!vueApp) {
                console.error('[Frontend] Vue app instance not found when handling window state change');
                return;
            }
            vueApp.isMaximized = isMaximized;
            vueApp.updateMaximizeButton();
        });
    } else {
        console.error('[Frontend] Window state change API not available');
    }
});

// 导出 Vue 实例以供其他模块使用
window.vueApp = vueApp; 