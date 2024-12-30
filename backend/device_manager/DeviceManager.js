const EventEmitter = require('events');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

class DeviceManager extends EventEmitter {
    constructor() {
        super();
        this.devices = [];
        this.init();
        
        // 确保数据库目录存在
        const dbDir = path.join(__dirname, '../../database');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        // 初始化数据库
        const dbPath = path.join(dbDir, 'devices.db');
        this.db = new sqlite3.Database(dbPath);
        this.initDatabase();
    }

    async init() {
        try {
            // 启动设备监听
            this.startDeviceMonitor();
        } catch (error) {
            console.error('设备管理初始化失败:', error);
        }
    }

    startDeviceMonitor() {
        // 使用 adb track-devices 监听设备变化
        const tracker = spawn('adb', ['track-devices']);
        
        tracker.stdout.on('data', (data) => {
            this.updateDevices();
        });

        tracker.stderr.on('data', (data) => {
            console.error(`设备监听错误: ${data}`);
        });

        // 定期刷新设备列表
        setInterval(() => this.updateDevices(), 5000);
    }

    async updateDevices() {
        try {
            // 清空当前设备列表
            this.devices = [];
            const currentDevices = [];
            
            // 获取 adb 设备列表
            const { stdout } = await execAsync('adb devices -l');
            const lines = stdout.split('\n').filter(line => line.trim());
            lines.shift(); // 移除第一行 "List of devices attached"
            
            // 记录在线设备
            const connectedDevices = new Set();
            
            // 处理在线设备
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const ipPort = parts[0];
                    const status = parts[1];
                    
                    if (status === 'device') {
                        try {
                            const { stdout: model } = await execAsync(`adb -s ${ipPort} shell getprop ro.product.model`);
                            const { stdout: brand } = await execAsync(`adb -s ${ipPort} shell getprop ro.product.brand`);
                            const { stdout: version } = await execAsync(`adb -s ${ipPort} shell getprop ro.build.version.release`);
                            
                            // 获取更多设备信息
                            const { stdout: resolution } = await execAsync(`adb -s ${ipPort} shell wm size`);
                            const { stdout: density } = await execAsync(`adb -s ${ipPort} shell wm density`);
                            
                            // 解析分辨率
                            const resMatch = resolution.match(/Physical size: (\d+x\d+)/);
                            const densityMatch = density.match(/Physical density: (\d+)/);
                            
                            // 尝试获取编码器信息
                            let encoderList = [];
                            try {
                                const { stdout: encoders } = await execAsync(`adb -s ${ipPort} shell "dumpsys media.codec | grep -A 1 'encoder: video'"`);
                                encoderList = encoders.split('\n')
                                    .filter(line => line.includes('encoder:'))
                                    .map(line => {
                                        const match = line.match(/name=([^,]+)/);
                                        return match ? match[1].trim() : null;
                                    })
                                    .filter(Boolean);
                            } catch (error) {
                                console.log(`获取设备 ${ipPort} 编码器信息失败，将使用默认编码器列表`);
                                encoderList = [
                                    'h264',
                                    'h265',
                                    'OMX.qcom.video.encoder.avc',
                                    'OMX.qcom.video.encoder.hevc',
                                    'OMX.MTK.VIDEO.ENCODER.AVC',
                                    'OMX.MTK.VIDEO.ENCODER.HEVC',
                                    'c2.android.avc.encoder',
                                    'c2.android.hevc.encoder'
                                ];
                            }
                            
                            // 从数据库加载设备信息
                            let savedDevice = await this.loadDeviceInfo(ipPort);
                            const displayName = savedDevice ? savedDevice.display_name : ipPort;
                            
                            const deviceInfo = {
                                ip_port: ipPort,
                                model: model.trim() || 'Unknown Model',
                                brand: brand.trim() || 'Unknown Brand',
                                android_version: version.trim() || 'Unknown Version',
                                display_name: displayName,
                                status: 'online',
                                resolution: resMatch ? resMatch[1] : 'Unknown',
                                density: densityMatch ? densityMatch[1] : 'Unknown',
                                supported_encoders: encoderList,
                                encoder_name: savedDevice?.encoder_name || '',
                                device_settings: savedDevice?.device_settings || {}
                            };
                            
                            currentDevices.push(deviceInfo);
                            connectedDevices.add(ipPort);
                            // 保存设备信息到数据库
                            await this.saveDeviceInfo(deviceInfo);
                        } catch (error) {
                            console.error(`获取设备 ${ipPort} 信息失败:`, error);
                        }
                    }
                }
            }
            
            // 从数据库加载所有设备
            const allDevices = await new Promise((resolve, reject) => {
                this.db.all('SELECT * FROM devices', [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            
            // 添加数据库中的离线设备
            for (const device of allDevices) {
                if (!connectedDevices.has(device.ip_port)) {
                    currentDevices.push({
                        ip_port: device.ip_port,
                        model: device.model || 'Unknown Model',
                        brand: device.brand || 'Unknown Brand',
                        android_version: device.android_version || 'Unknown Version',
                        display_name: device.display_name || device.ip_port,
                        status: 'offline'
                    });
                }
            }
            
            // 更新内存中的设备列表
            this.devices = currentDevices;
            
            // 发送更新事件
            this.emit('devices-updated', currentDevices);
            
            console.log('当前设备列表:', JSON.stringify(currentDevices, null, 2));
            
            return currentDevices;
        } catch (error) {
            console.error('更新设备列表失败:', error);
            return [];
        }
    }

    async getDevices() {
        try {
            return await this.updateDevices();
        } catch (error) {
            console.error('获取设备列表失败:', error);
            return [];
        }
    }

    async getDeviceInfo(ipPort) {
        try {
            const device = this.devices.find(d => d.ip_port === ipPort);
            if (!device) {
                throw new Error('Device not found');
            }
            return device;
        } catch (error) {
            console.error(`获取设备 ${ipPort} 信息失败:`, error);
            return {
                ip_port: ipPort,
                model: 'Unknown',
                brand: 'Unknown',
                android_version: 'Unknown',
                display_name: ipPort,
                status: 'offline'
            };
        }
    }

    async executeCommand(deviceId, command) {
        try {
            const { stdout } = await execAsync(`adb -s ${deviceId} shell ${command}`);
            return stdout;
        } catch (error) {
            console.error(`命令执行失败 ${deviceId}:`, error);
            throw error;
        }
    }

    async broadcastCommand(command) {
        const results = new Map();
        for (const [deviceId] of this.devices) {
            try {
                const result = await this.executeCommand(deviceId, command);
                results.set(deviceId, result);
            } catch (error) {
                results.set(deviceId, error);
            }
        }
        return results;
    }

    // 新增方法：配对设备
    async pairDevice(ip, port = '5555', pairCode) {
        try {
            const { stdout } = await execAsync(`adb pair ${ip}:${port} ${pairCode}`);
            console.log('设备配对结果:', stdout);
            return { success: true, message: stdout };
        } catch (error) {
            console.error('设备配对失败:', error);
            throw error;
        }
    }

    // 新增方法：连接设备
    async connectDevice(ip, port = '5555') {
        try {
            if (!ip) {
                throw new Error('IP地址不能为空');
            }

            console.log('正在连接设备:', { ip, port });
            const { stdout } = await execAsync(`adb connect ${ip}:${port}`);
            console.log('设备连接结果:', stdout);

            // 等待一段时间，让设备状态更新
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 更新设备列表
            await this.updateDevices();

            return { success: true, message: stdout };
        } catch (error) {
            console.error('连接设备失败:', error);
            throw error;
        }
    }

    // 新增方法：断开设备连接
    async disconnectDevice(deviceId) {
        try {
            if (!deviceId) {
                throw new Error('设备ID不能为空');
            }

            console.log('正在断开设备:', deviceId);
            const { stdout } = await execAsync(`adb disconnect ${deviceId}`);
            console.log('设备断开结果:', stdout);

            // 等待一段时间，让设备状态更新
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 更新设备列表
            await this.updateDevices();

            return { success: true, message: stdout };
        } catch (error) {
            console.error('断开设备失败:', error);
            throw error;
        }
    }

    // 新增方法：更新设备名称
    async updateDeviceName(ipPort, displayName) {
        try {
            console.log('正在更新设备名称:', ipPort, '->', displayName);
            
            // 检查设备是否存在
            const device = await this.loadDeviceInfo(ipPort);
            if (!device) {
                throw new Error('设备不存在');
            }
            
            // 更新设备信息
            await new Promise((resolve, reject) => {
                const sql = `UPDATE devices SET display_name = ? WHERE ip_port = ?`;
                this.db.run(sql, [displayName, ipPort], function(err) {
                    if (err) {
                        console.error('更新设备名称失败:', err);
                        reject(err);
                        return;
                    }
                    
                    console.log('更新结果:', this.changes, '行被修改');
                    resolve(this.changes);
                });
            });
            
            // 更新内存中的设备信息
            const deviceInMemory = this.devices.find(d => d.ip_port === ipPort);
            if (deviceInMemory) {
                deviceInMemory.display_name = displayName;
            }

            // 刷新设备列表
            await this.updateDevices();

            return { success: true, ipPort, displayName };
        } catch (error) {
            console.error('更新设备名称失败:', error);
            throw error;
        }
    }

    initDatabase() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // 创建设备表
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS devices (
                        ip_port TEXT PRIMARY KEY,
                        display_name TEXT,
                        brand TEXT,
                        model TEXT,
                        android_version TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (err) => {
                    if (err) {
                        console.error('创建devices表失败:', err);
                        reject(err);
                        return;
                    }
                    console.log('成功创建devices表');
                });

                // 创建设置表
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS settings (
                        id TEXT PRIMARY KEY,
                        value TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (err) => {
                    if (err) {
                        console.error('创建settings表失败:', err);
                        reject(err);
                        return;
                    }
                    console.log('成功创建settings表');
                    resolve();
                });
            });
        });
    }

    // 初始化默认设置
    initDefaultSettings() {
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

        // 检查是否已存在设置
        this.db.get("SELECT value FROM settings WHERE id = 'scrcpy'", (err, row) => {
            if (err) {
                console.error('查询设置失败:', err);
                return;
            }
            
            if (!row) {
                const stmt = this.db.prepare(
                    "INSERT INTO settings (id, value) VALUES ('scrcpy', ?)"
                );
                stmt.run(JSON.stringify(defaultSettings), (err) => {
                    if (err) {
                        console.error('插入默认设置失败:', err);
                    } else {
                        console.log('成功插入默认设置');
                    }
                });
                stmt.finalize();
            } else {
                console.log('设置已存在，无需初始化');
            }
        });
    }

    // 新增方法：加载设备信息
    async loadDeviceInfo(ipPort) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM devices WHERE ip_port = ?`;
            this.db.get(sql, [ipPort], (err, row) => {
                if (err) {
                    console.error('加载设备信息失败:', err);
                    reject(err);
                    return;
                }
                resolve(row);
            });
        });
    }

    // 新增方法：保存设备信息
    async saveDeviceInfo(device) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO devices 
                (ip_port, model, brand, android_version, display_name) 
                VALUES (?, ?, ?, ?, ?)
            `;
            this.db.run(
                sql, 
                [
                    device.ip_port,
                    device.model,
                    device.brand,
                    device.android_version,
                    device.display_name
                ],
                function(err) {
                    if (err) {
                        console.error('保存设备信息失败:', err);
                        reject(err);
                        return;
                    }
                    resolve(this.lastID);
                }
            );
        });
    }
}

module.exports = DeviceManager; 