const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// 创建日志函数
function log(...args) {
    console.log(new Date().toISOString(), ...args);
}

function logError(...args) {
    console.error(new Date().toISOString(), ...args);
}

class SettingsManager {
    constructor() {
        // 初始化数据库连接
        const dbPath = path.join(__dirname, '../../database/devices.db');
        log('数据库路径:', dbPath);
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                logError('连接数据库失败:', err);
            } else {
                log('成功连接到数据库');
                // 初始化数据库表
                this.initDatabase();
            }
        });
    }

    initDatabase() {
        // 创建设置表
        this.db.run(`
            CREATE TABLE IF NOT EXISTS settings (
                id TEXT PRIMARY KEY,
                value TEXT
            )
        `, (err) => {
            if (err) {
                console.error('创建settings表失败:', err);
            } else {
                console.log('成功创建或确认settings表存在');
                // 初始化默认设置
                this.initDefaultSettings();
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
                custom_name TEXT,
                last_connected TEXT
            )
        `, (err) => {
            if (err) {
                console.error('创建devices表失败:', err);
            } else {
                console.log('成功创建或确认devices表存在');
            }
        });
    }

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

    getScrcpySettings() {
        return new Promise((resolve, reject) => {
            log('开始获取scrcpy设置...');
            this.db.get("SELECT value FROM settings WHERE id = 'scrcpy'", (err, row) => {
                if (err) {
                    logError('获取设置失败:', err);
                    reject(err);
                    return;
                }
                
                if (row) {
                    try {
                        const settings = JSON.parse(row.value);
                        log('获取到的设置:', JSON.stringify(settings, null, 2));
                        resolve(settings);
                    } catch (error) {
                        logError('解析设置JSON失败:', error);
                        reject(error);
                    }
                } else {
                    log('未找到设置，返回null');
                    resolve(null);
                }
            });
        });
    }

    async updateScrcpySettings(newSettings) {
        return new Promise((resolve, reject) => {
            if (!newSettings) {
                const error = new Error('新设置为空');
                logError(error);
                reject(error);
                return;
            }

            log('开始更新scrcpy设置...');
            log('新设置:', JSON.stringify(newSettings, null, 2));

            try {
                // 确保settings是可序列化的纯对象
                const cleanSettings = JSON.parse(JSON.stringify(newSettings));
                const settingsJson = JSON.stringify(cleanSettings);
                
                const stmt = this.db.prepare(
                    "INSERT OR REPLACE INTO settings (id, value) VALUES ('scrcpy', ?)"
                );
                
                stmt.run(settingsJson, (err) => {
                    if (err) {
                        logError('更新设置失败:', err);
                        reject(err);
                    } else {
                        log('设置更新成功');
                        resolve(cleanSettings);
                    }
                });
                
                stmt.finalize();
            } catch (error) {
                logError('处理设置更新时出错:', error);
                reject(error);
            }
        });
    }

    getDeviceCustomName(deviceId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                "SELECT name FROM devices WHERE id = ?",
                [deviceId],
                (err, row) => {
                    if (err) {
                        console.error('获取设备名称失败:', err);
                        reject(err);
                    } else {
                        resolve(row ? row.name : '');
                    }
                }
            );
        });
    }

    getAllDeviceCustomNames() {
        return new Promise((resolve, reject) => {
            this.db.all(
                "SELECT id, name FROM devices",
                (err, rows) => {
                    if (err) {
                        console.error('获取所有设备名称失败:', err);
                        reject(err);
                    } else {
                        const names = {};
                        rows.forEach(row => {
                            if (row.name) {
                                names[row.id] = row.name;
                            }
                        });
                        resolve(names);
                    }
                }
            );
        });
    }

    async setDeviceCustomName(deviceId, customName) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(
                'UPDATE devices SET name = ? WHERE id = ?'
            );
            
            stmt.run(customName, deviceId, (err) => {
                if (err) {
                    console.error('更新设备名称失败:', err);
                    reject(err);
                } else {
                    console.log('设备名称更新成功');
                    resolve(customName);
                }
            });
            
            stmt.finalize();
        });
    }
}

module.exports = SettingsManager; 