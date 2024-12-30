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
            const { stdout } = await execAsync('adb devices -l');
            const lines = stdout.split('\n').filter(line => line.trim());
            lines.shift(); // 移除第一行 "List of devices attached"
            
            const currentDevices = [];
            
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                
                if (parts.length >= 2) {
                    const deviceId = parts[0];
                    const status = parts[1];
                    
                    // 从数据库加载设备信息
                    let savedDevice = await this.loadDeviceInfo(deviceId);
                    const deviceName = savedDevice ? savedDevice.name : deviceId;
                    
                    if (status === 'device') {
                        try {
                            const { stdout: model } = await execAsync(`adb -s ${deviceId} shell getprop ro.product.model`);
                            const { stdout: brand } = await execAsync(`adb -s ${deviceId} shell getprop ro.product.brand`);
                            const { stdout: version } = await execAsync(`adb -s ${deviceId} shell getprop ro.build.version.release`);
                            
                            const deviceInfo = {
                                id: deviceId,
                                model: model.trim() || 'Unknown Model',
                                brand: brand.trim() || 'Unknown Brand',
                                android: version.trim() || 'Unknown Version',
                                name: deviceName,
                                status: 'online'
                            };
                            
                            currentDevices.push(deviceInfo);
                            // 保存设备信息到数据库
                            await this.saveDeviceInfo(deviceInfo);
                        } catch (error) {
                            console.error(`获取设备 ${deviceId} 信息失败:`, error);
                            currentDevices.push({
                                id: deviceId,
                                model: savedDevice?.model || 'Unknown Model',
                                brand: savedDevice?.brand || 'Unknown Brand',
                                android: savedDevice?.android || 'Unknown Version',
                                name: deviceName,
                                status: 'offline'
                            });
                        }
                    }
                }
            }
            
            this.devices = currentDevices;
            this.emit('devices-updated', currentDevices);
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

    async getDeviceInfo(deviceId) {
        try {
            const device = Array.from(this.devices.values()).find(d => d.id === deviceId);
            if (!device) {
                throw new Error('Device not found');
            }
            return device;
        } catch (error) {
            console.error(`获取设备 ${deviceId} 信息失败:`, error);
            return {
                id: deviceId,
                model: 'Unknown',
                brand: 'Unknown',
                android: 'Unknown',
                name: deviceId,
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
            const { stdout } = await execAsync(`adb connect ${ip}:${port}`);
            console.log('设备连接结果:', stdout);
            await this.updateDevices(); // 更新设备列表
            return { success: true, message: stdout };
        } catch (error) {
            console.error('设备连接失败:', error);
            throw error;
        }
    }

    // 新增方法：断开设备连接
    async disconnectDevice(deviceId) {
        try {
            // 如果是网络设备（包含冒号），则使用 adb disconnect
            if (deviceId.includes(':')) {
                const { stdout } = await execAsync(`adb disconnect ${deviceId}`);
                console.log('设备断开结果:', stdout);
            }
            await this.updateDevices(); // 更新设备列表
            return { success: true };
        } catch (error) {
            console.error('断开设备失败:', error);
            throw error;
        }
    }

    // 新增方法：更新设备名称
    async updateDeviceName(deviceId, newName) {
        try {
            // 从数据库中获取设备
            const device = await this.db.get('SELECT * FROM devices WHERE id = ?', deviceId);
            if (!device) {
                throw new Error('设备不存在');
            }

            // 更新设备名称
            await this.db.run('UPDATE devices SET name = ? WHERE id = ?', [newName, deviceId]);
            
            // 更新内存中的设备名称
            const deviceIndex = this.devices.findIndex(d => d.id === deviceId);
            if (deviceIndex !== -1) {
                this.devices[deviceIndex].name = newName;
            }

            return { deviceId, newName };
        } catch (error) {
            console.error('更新设备名称失败:', error);
            throw error;
        }
    }

    initDatabase() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // 删除旧表
                this.db.run("DROP TABLE IF EXISTS settings", (err) => {
                    if (err) {
                        console.error('删除旧settings表失败:', err);
                        reject(err);
                        return;
                    }
                });

                // 创建设备表
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS devices (
                        id TEXT PRIMARY KEY,
                        name TEXT,
                        brand TEXT,
                        model TEXT,
                        android TEXT,
                        status TEXT,
                        last_connected TEXT
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
                        value TEXT NOT NULL
                    )
                `, (err) => {
                    if (err) {
                        console.error('创建settings表失败:', err);
                        reject(err);
                        return;
                    }
                    console.log('成功创建settings表');
                    this.initDefaultSettings();
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

    saveDeviceInfo(device) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO devices (id, name, brand, model, android, status, last_connected)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            device.id,
            device.name || device.id,
            device.brand || '',
            device.model || '',
            device.android || '',
            device.status || 'offline',
            new Date().toISOString()
        );
        stmt.finalize();
    }

    loadDeviceInfo(deviceId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM devices WHERE id = ?',
                [deviceId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }
}

module.exports = DeviceManager; 