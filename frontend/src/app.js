const { createApp } = Vue;

const app = createApp({
    data() {
        return {
            devices: [],
            connectedDevices: new Set(),
            selectedDevices: [],
            scripts: [],
            activeScripts: [],
            currentCommand: '',
            scriptFile: null,
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
            }
        };
    },
    async created() {
        // 在创建时就开始加载设置
        try {
            const settings = await window.api.getScrcpySettings();
            if (settings) {
                this.scrcpySettings = settings;
            }
            // 如果没有设置，使用默认值（已经在data中定义）
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    },
    methods: {
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

                const storedDevices = JSON.parse(localStorage.getItem('knownDevices') || '[]');
                const knownDevices = new Set(storedDevices);

                devices.forEach(device => {
                    this.connectedDevices.add(device.id);
                    knownDevices.add(device.id);
                });

                localStorage.setItem('knownDevices', JSON.stringify([...knownDevices]));

                const updatedDevices = [...knownDevices].map(deviceId => {
                    const onlineDevice = devices.find(d => d.id === deviceId);
                    const existingDevice = this.devices.find(d => d.id === deviceId);
                    
                    if (onlineDevice) {
                        return {
                            ...onlineDevice,
                            isEditing: existingDevice ? existingDevice.isEditing : false,
                            editingName: existingDevice ? existingDevice.editingName : onlineDevice.customName || '',
                            customName: existingDevice ? existingDevice.customName : onlineDevice.customName || '',
                            status: 'online',
                            _animated: true,
                            brand: onlineDevice.brand || existingDevice?.brand || '',
                            model: onlineDevice.model || existingDevice?.model || '',
                            android: onlineDevice.android || existingDevice?.android || ''
                        };
                    } else {
                        return {
                            id: deviceId,
                            customName: existingDevice ? existingDevice.customName : deviceId,
                            isEditing: existingDevice ? existingDevice.isEditing : false,
                            editingName: existingDevice ? existingDevice.editingName : '',
                            status: 'offline',
                            _animated: true,
                            brand: existingDevice?.brand || '',
                            model: existingDevice?.model || '',
                            android: existingDevice?.android || ''
                        };
                    }
                });
                
                console.log('处理后的设备列表:', updatedDevices);
                this.devices = updatedDevices;
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
            const index = this.selectedDevices.indexOf(device.id);
            if (index === -1) {
                this.selectedDevices.push(device.id);
            } else {
                this.selectedDevices.splice(index, 1);
            }
        },

        async startEditingName(device) {
            device.isEditing = true;
            device.editingName = device.name || device.id;
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
                        deviceId: device.id,
                        oldName: device.name,
                        newName: newName
                    });
                    
                    const result = await window.api.updateDeviceName(device.id, newName);
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

        async loadSettings() {
            try {
                console.log('开始加载设置...');
                const settings = await window.api.getScrcpySettings();
                console.log('从主进程获取的设置:', settings);

                if (settings) {
                    this.scrcpySettings = settings;
                }
                console.log('最终设置值:', this.scrcpySettings);
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
                console.log('开始保存设置...');
                // 创建一个纯对象副本
                const settingsToSave = {
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
                
                console.log('要保存的设置:', settingsToSave);
                
                await window.api.saveScrcpySettings(settingsToSave);
                console.log('设置保存成功');
                
                this.showNotification('设置保存成功', 'success');
                this.closeSettings();
            } catch (error) {
                console.error('保存设置失败:', error);
                this.showNotification('保存设置失败: ' + error.message, 'error');
            }
        },

        async resetSettings() {
            try {
                if (!confirm('确定要重置所有设置到默认值吗？')) {
                    return;
                }

                const defaultSettings = {
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

                // 创建一个纯对象副本
                const settingsToSave = { ...defaultSettings };
                await window.api.saveScrcpySettings(settingsToSave);
                
                // 更新本地状态
                this.scrcpySettings = { ...defaultSettings };
                this.showNotification('设置已重置为默认值', 'success');
            } catch (error) {
                console.error('重置设置失败:', error);
                this.showNotification('重置设置失败: ' + error.message, 'error');
            }
        },

        async pairDevice() {
            if (!this.validateIPAddress(this.pairForm.ip) || 
                !this.validatePort(this.pairForm.port)) {
                return;
            }

            if (!this.pairForm.code) {
                this.showNotification('请输入配对码', 'error');
                return;
            }

            this.pairForm.isPairing = true;
            try {
                const port = this.pairForm.port || '5555';
                await window.api.pairDevice(this.pairForm.ip, port, this.pairForm.code);
                this.showNotification('设备配对成功', 'success');
                this.pairForm.ip = '';
                this.pairForm.port = '';
                this.pairForm.code = '';
                await this.loadDevices();
            } catch (error) {
                this.showNotification('设备配对失败: ' + error.message, 'error');
            } finally {
                this.pairForm.isPairing = false;
            }
        },

        async connectDevice(deviceId) {
            // 如果传入了deviceId，说明是重新连接离线设备
            if (deviceId) {
                this.connectForm.isConnecting = true;
                try {
                    await window.api.connectDevice(deviceId);
                    this.showNotification('设备连接成功', 'success');
                    await this.loadDevices();
                } catch (error) {
                    this.showNotification('设备连接失败: ' + error.message, 'error');
                } finally {
                    this.connectForm.isConnecting = false;
                }
                return;
            }

            // 否则使用表单中的IP和端口
            if (!this.validateIPAddress(this.connectForm.ip) || 
                !this.validatePort(this.connectForm.port)) {
                return;
            }

            this.connectForm.isConnecting = true;
            try {
                const port = this.connectForm.port || '5555';
                const deviceId = `${this.connectForm.ip}:${port}`;
                
                await window.api.connectDevice(deviceId);
                
                const storedDevices = JSON.parse(localStorage.getItem('knownDevices') || '[]');
                if (!storedDevices.includes(deviceId)) {
                    storedDevices.push(deviceId);
                    localStorage.setItem('knownDevices', JSON.stringify(storedDevices));
                }
                
                this.showNotification('设备连接成功', 'success');
                this.connectForm.ip = '';
                this.connectForm.port = '';
                await this.loadDevices();
            } catch (error) {
                this.showNotification('设备连接失败: ' + error.message, 'error');
            } finally {
                this.connectForm.isConnecting = false;
            }
        },

        async disconnectDevice(deviceId) {
            try {
                await window.api.disconnectDevice(deviceId);
                await this.loadDevices();
                this.showNotification('设备已断开连接', 'success');
                const index = this.selectedDevices.indexOf(deviceId);
                if (index !== -1) {
                    this.selectedDevices.splice(index, 1);
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

        async stopScrcpy(deviceId) {
            try {
                console.log('停止投屏，设备ID:', deviceId);
                await window.api.stopScrcpy(deviceId);
                this.showNotification('投屏已停止', 'success');
            } catch (error) {
                console.error('停止投屏失败:', error);
                this.showNotification('停止投屏失败: ' + error.message, 'error');
            }
        },

        async executeCommand(deviceId) {
            if (!this.currentCommand) {
                alert('请输入要执行的命令');
                return;
            }
            try {
                const result = await window.api.executeCommand(deviceId, this.currentCommand);
                console.log('命令执行结果:', result);
                alert('命令执行成功');
            } catch (error) {
                console.error('执行命令失败:', error);
                alert('执行命令失败: ' + error.message);
            }
        },

        async executeCurrentCommand() {
            if (!this.currentCommand) {
                alert('请输入要执行的命令');
                return;
            }
            if (this.selectedDevices.length === 0) {
                alert('请选择要执行命令的设备');
                return;
            }
            try {
                for (const deviceId of this.selectedDevices) {
                    await this.executeCommand(deviceId);
                }
            } catch (error) {
                console.error('执行命令失败:', error);
                alert('执行命令失败: ' + error.message);
            }
        },

        async executeGroupCommand() {
            const command = prompt('请输入要执行的群控命令');
            if (!command) return;
            
            this.currentCommand = command;
            await this.executeCurrentCommand();
        },

        handleScriptUpload(event) {
            this.scriptFile = event.target.files[0];
        },

        async uploadScript() {
            if (!this.scriptFile) {
                alert('请选择要上传的脚本文件');
                return;
            }
            try {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const content = e.target.result;
                    await window.api.uploadScript(this.scriptFile.name, content);
                    this.loadScripts();
                    alert('脚本上传成功');
                };
                reader.readAsText(this.scriptFile);
            } catch (error) {
                console.error('上传脚本失败:', error);
                alert('上传脚本失败: ' + error.message);
            }
        },

        async loadScripts() {
            try {
                this.scripts = await window.api.getScripts();
            } catch (error) {
                console.error('加载脚本失败:', error);
            }
        },

        async executeScript(scriptName) {
            if (this.selectedDevices.length === 0) {
                alert('请选择要执行脚本的设备');
                return;
            }
            try {
                const result = await window.api.executeScript(
                    scriptName,
                    this.selectedDevices,
                    { delay: 1000 }
                );
                console.log('脚本执行结果:', result);
                alert('脚本执行成功');
            } catch (error) {
                console.error('执行脚本失败:', error);
                alert('执行脚本失败: ' + error.message);
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
        },

        closeNotification(id) {
            const index = this.notifications.findIndex(n => n.id === id);
            if (index !== -1) {
                this.notifications.splice(index, 1);
            }
        }
    },
    async mounted() {
        try {
            console.log('Vue应用开始挂载...');
            
            // 确保按顺序执行初始化
            await this.loadDevices();
            await this.loadScripts();
            
            // 设置自动刷新
            this.refreshInterval = setInterval(() => {
                if (!this.isEditing) {
                    this.loadDevices();
                }
            }, 5000);
            
            console.log('初始化完成');
        } catch (error) {
            console.error('初始化失败:', error);
            this.showNotification('初始化失败: ' + error.message, 'error');
        }
    },
    beforeUnmount() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
});

// 挂载Vue应用
app.mount('#app'); 