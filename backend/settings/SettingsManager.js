const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs/promises');

// 创建日志函数
function log(...args) {
    console.log(new Date().toISOString(), ...args);
}

function logError(...args) {
    console.error(new Date().toISOString(), ...args);
}

class SettingsManager {
    constructor() {
        this.dbPath = path.join(__dirname, '../../database/devices.db');
        this.db = null;
        this.isInitializing = false;
        this.initPromise = null;
        this.initializeDatabase();
    }

    async initializeDatabase() {
        if (this.isInitializing) {
            return this.initPromise;
        }

        this.isInitializing = true;
        this.initPromise = new Promise(async (resolve, reject) => {
            try {
                const dbDir = path.dirname(this.dbPath);
                await fs.mkdir(dbDir, { recursive: true });
                log('确保数据库目录存在:', dbDir);

                await this._connectToDatabase();
                await this._initTables();
                resolve();
            } catch (error) {
                logError('初始化数据库失败:', error);
                reject(error);
            } finally {
                this.isInitializing = false;
            }
        });

        return this.initPromise;
    }

    async _connectToDatabase() {
        if (this.db) {
            try {
                // 测试连接是否有效
                await this._rawQuery('SELECT 1');
                return; // 连接有效，直接返回
            } catch (error) {
                // 连接无效，关闭它
                try {
                    await new Promise((resolve) => this.db.close(() => resolve()));
                } catch (e) {
                    // 忽略关闭错误
                }
                this.db = null;
            }
        }

        // 创建新连接
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(
                this.dbPath,
                sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
                async (err) => {
                    if (err) {
                        logError('连接数据库失败:', err);
                        reject(err);
                        return;
                    }

                    try {
                        log('成功连接到数据库');
                        this.db.configure('busyTimeout', 3000);
                        await this._rawQuery('PRAGMA journal_mode = WAL');
                        await this._rawQuery('PRAGMA synchronous = NORMAL');
                        resolve();
                    } catch (error) {
                        logError('配置数据库失败:', error);
                        reject(error);
                    }
                }
            );
        });
    }

    // 基础查询方法，不包含重连逻辑
    async _rawQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    // 基础查询方法（SELECT），不包含重连逻辑
    async _rawQueryGet(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    // 包含重试和重连逻辑的查询方法
    async query(sql, params = []) {
        const maxRetries = 3;
        let lastError = null;

        for (let i = 0; i < maxRetries; i++) {
            try {
                await this._connectToDatabase();
                return await this._rawQuery(sql, params);
            } catch (error) {
                lastError = error;
                if (error.code === 'SQLITE_BUSY') {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                    continue;
                }
                if (i === maxRetries - 1) throw error;
            }
        }
        throw lastError;
    }

    // 包含重试和重连逻辑的查询方法（SELECT）
    async queryGet(sql, params = []) {
        const maxRetries = 3;
        let lastError = null;

        for (let i = 0; i < maxRetries; i++) {
            try {
                await this._connectToDatabase();
                return await this._rawQueryGet(sql, params);
            } catch (error) {
                lastError = error;
                if (error.code === 'SQLITE_BUSY') {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                    continue;
                }
                if (i === maxRetries - 1) throw error;
            }
        }
        throw lastError;
    }

    async _initTables() {
        try {
            log('开始初始化数据库表...');
            
            // 创建设置表
            await this._rawQuery(`
                CREATE TABLE IF NOT EXISTS settings (
                    id TEXT PRIMARY KEY,
                    value TEXT
                )
            `);
            log('成功创建或确认settings表存在');

            // 创建设备表
            await this._rawQuery(`
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
            `);
            log('成功创建或确认devices表存在');

            // 检查并初始化默认设置
            await this._initDefaultSettings();
            
            log('数据库表初始化完成');
        } catch (error) {
            logError('初始化数据库表失败:', error);
            throw error;
        }
    }

    async _initDefaultSettings() {
        try {
            // 检查是否需要初始化默认设置
            const scrcpyRow = await this._rawQueryGet("SELECT value FROM settings WHERE id = 'scrcpy'");
            const deviceListRow = await this._rawQueryGet("SELECT value FROM settings WHERE id = 'deviceList'");

            log('当前数据库中的设置状态：', {
                scrcpyExists: !!scrcpyRow,
                deviceListExists: !!deviceListRow
            });

            // 只在设置完全不存在时初始化
            if (!scrcpyRow) {
                log('scrcpy设置不存在，初始化默认值');
                await this.initScrcpySettings();
            }

            if (!deviceListRow) {
                log('deviceList设置不存在，初始化默认值');
                await this.initDeviceListSettings();
            }
        } catch (error) {
            logError('初始化默认设置失败:', error);
            throw error;
        }
    }

    // 等待初始化完成的方法
    async waitForInit() {
        return this.initPromise;
    }

    // 安全关闭数据库
    async close() {
        if (this.db) {
            return new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) {
                        logError('关闭数据库失败:', err);
                        reject(err);
                    } else {
                        log('数据库已安全关闭');
                        this.db = null;
                        resolve();
                    }
                });
            });
        }
    }

    async initScrcpySettings() {
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

        try {
            log('开始初始化scrcpy默认设置...');
            await this._rawQuery(
                "INSERT OR REPLACE INTO settings (id, value) VALUES ('scrcpy', ?)",
                [JSON.stringify(defaultSettings)]
            );
            log('成功插入默认 scrcpy 设置');
        } catch (error) {
            logError('初始化scrcpy默认设置失败:', error);
            throw error;
        }
    }

    async initDeviceListSettings() {
        const defaultDeviceListSettings = {
            refreshMode: 'smart',
            refreshInterval: 5000,
            smartRefreshEvents: ['connect', 'disconnect', 'pair']
        };

        try {
            log('开始初始化设备列表默认设置...');
            await this._rawQuery(
                "INSERT OR REPLACE INTO settings (id, value) VALUES ('deviceList', ?)",
                [JSON.stringify(defaultDeviceListSettings)]
            );
            log('成功插入默认设备列表设置');
        } catch (error) {
            logError('初始化设备列表默认设置失败:', error);
            throw error;
        }
    }

    async getScrcpySettings() {
        try {
            log('开始获取scrcpy设置...');
            const row = await this._rawQueryGet("SELECT value FROM settings WHERE id = 'scrcpy'");
            
            if (row) {
                try {
                    const settings = JSON.parse(row.value);
                    log('获取到的设置:', JSON.stringify(settings, null, 2));
                    return settings;
                } catch (error) {
                    logError('解析设置JSON失败:', error);
                    throw error;
                }
            } else {
                log('未找到设置，返回null');
                return null;
            }
        } catch (error) {
            logError('获取设置失败:', error);
            throw error;
        }
    }

    async updateScrcpySettings(newSettings) {
        let transaction = false;
        try {
            if (!newSettings) {
                const error = new Error('新设置为空');
                logError(error);
                throw error;
            }

            log('开始更新scrcpy设置...');
            
            // 定义允许的设置字段和类型
            const allowedSettings = {
                maxBitrate: 'number',
                maxFps: 'number',
                screenWidth: 'number',
                screenHeight: 'number',
                turnScreenOff: 'boolean',
                stayAwake: 'boolean',
                showTouches: 'boolean',
                fullscreen: 'boolean',
                borderless: 'boolean',
                alwaysOnTop: 'boolean',
                audioEnabled: 'boolean',
                videoBitrateKbps: 'number',
                maxSize: 'number',
                lockVideoOrientation: 'number',
                encoderName: 'string',
                powerOffOnClose: 'boolean',
                clipboardAutosync: 'boolean',
                shortcutKeysEnabled: 'boolean'
            };

            // 清理和验证设置对象
            const cleanSettings = {};
            for (const [key, expectedType] of Object.entries(allowedSettings)) {
                if (key in newSettings) {
                    const value = newSettings[key];
                    const actualType = typeof value;
                    if (actualType === expectedType) {
                        cleanSettings[key] = value;
                    } else if (expectedType === 'number' && actualType === 'string') {
                        // 尝试转换字符串到数字
                        const numValue = Number(value);
                        if (!isNaN(numValue)) {
                            cleanSettings[key] = numValue;
                        } else {
                            throw new Error(`设置项 ${key} 的值 "${value}" 无法转换为数字`);
                        }
                    } else {
                        throw new Error(`设置项 ${key} 的类型错误，期望 ${expectedType}，实际 ${actualType}`);
                    }
                }
            }

            log('清理后的设置:', JSON.stringify(cleanSettings, null, 2));

            // 在更新之前验证数据库连接
            await this.waitForInit();
            
            // 添加数据库文件检查
            const dbPath = path.join(__dirname, '../../database/devices.db');
            try {
                await fs.access(dbPath, fs.constants.W_OK);
                log('数据库文件可写');
            } catch (error) {
                logError('数据库文件访问错误:', error);
                throw new Error('数据库文件无法访问或写入');
            }

            // 检查是否已在事务中
            const inTransaction = await this._rawQueryGet('SELECT 1 FROM sqlite_master LIMIT 1');
            if (!inTransaction) {
                // 开始事务
                await this._rawQuery('BEGIN TRANSACTION');
                transaction = true;
            }

            try {
                // 在事务中获取当前设置
                const currentSettings = await this._rawQueryGet("SELECT value FROM settings WHERE id = 'scrcpy'");
                let parsedCurrentSettings = null;
                if (currentSettings) {
                    try {
                        parsedCurrentSettings = JSON.parse(currentSettings.value);
                    } catch (e) {
                        log('解析当前设置失败，将使用默认值');
                        parsedCurrentSettings = await this.getDefaultScrcpySettings();
                    }
                } else {
                    log('未找到当前设置，将使用默认值');
                    parsedCurrentSettings = await this.getDefaultScrcpySettings();
                }

                // 合并当前设置和新设置
                const mergedSettings = {
                    ...parsedCurrentSettings,  // 首先使用所有当前设置
                    ...cleanSettings          // 然后覆盖新的设置
                };

                // 确保所有必需的字段都存在
                const defaultSettings = await this.getDefaultScrcpySettings();
                for (const key of Object.keys(defaultSettings)) {
                    if (!(key in mergedSettings)) {
                        mergedSettings[key] = defaultSettings[key];
                    }
                }

                const settingsJson = JSON.stringify(mergedSettings);

                await this._rawQuery(
                    "INSERT OR REPLACE INTO settings (id, value) VALUES ('scrcpy', ?)",
                    [settingsJson]
                );

                // 验证设置是否正确保存
                const verifyRow = await this._rawQueryGet("SELECT value FROM settings WHERE id = 'scrcpy'");
                if (!verifyRow) {
                    throw new Error('设置保存后无法验证');
                }

                const verifySettings = JSON.parse(verifyRow.value);
                
                // 确保所有必需的字段都存在且值匹配
                const defaultKeys = Object.keys(defaultSettings);
                const isEqual = defaultKeys.every(key => {
                    if (key in mergedSettings) {
                        if (typeof mergedSettings[key] === 'object' && mergedSettings[key] !== null) {
                            return JSON.stringify(verifySettings[key]) === JSON.stringify(mergedSettings[key]);
                        }
                        return verifySettings[key] === mergedSettings[key];
                    }
                    return false;
                });

                if (!isEqual) {
                    log('验证失败：', {
                        verified: verifySettings,
                        merged: mergedSettings
                    });
                    throw new Error('设置保存后验证不匹配');
                }

                // 只有当我们开启了事务时才提交
                if (transaction) {
                    await this._rawQuery('COMMIT');
                    log('scrcpy设置更新成功，事务已提交');
                } else {
                    log('scrcpy设置更新成功');
                }
                
                return mergedSettings;
            } catch (error) {
                // 只有当我们开启了事务时才回滚
                if (transaction) {
                    await this._rawQuery('ROLLBACK');
                }
                throw error;
            }
        } catch (error) {
            logError('更新scrcpy设置失败:', error);
            throw error;
        }
    }

    async getDeviceCustomName(deviceId) {
        try {
            const row = await this._rawQueryGet(
                "SELECT name FROM devices WHERE id = ?",
                [deviceId]
            );
            return row ? row.name : '';
        } catch (error) {
            logError('获取设备名称失败:', error);
            throw error;
        }
    }

    async getAllDeviceCustomNames() {
        try {
            const rows = await new Promise((resolve, reject) => {
                this.db.all("SELECT id, name FROM devices", (err, rows) => {
                    if (err) {
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
                });
            });
            return rows;
        } catch (error) {
            logError('获取所有设备名称失败:', error);
            throw error;
        }
    }

    async setDeviceCustomName(deviceId, customName) {
        try {
            await this._rawQuery(
                'INSERT OR REPLACE INTO devices (id, name) VALUES (?, ?)',
                [deviceId, customName]
            );
            return customName;
        } catch (error) {
            logError('更新设备名称失败:', error);
            throw error;
        }
    }

    // 获取设备列表刷新设置
    async getDeviceListSettings() {
        try {
            log('开始获取设备列表刷新设置...');
            const row = await this._rawQueryGet("SELECT value FROM settings WHERE id = 'deviceList'");
            
            if (row) {
                try {
                    const settings = JSON.parse(row.value);
                    log('获取到的设备列表设置:', JSON.stringify(settings, null, 2));
                    return settings;
                } catch (error) {
                    logError('解析设备列表设置JSON失败:', error);
                    throw error;
                }
            } else {
                log('未找到设备列表设置，创建并保存默认值');
                const defaultSettings = {
                    refreshMode: 'smart',
                    refreshInterval: 5000,
                    smartRefreshEvents: ['connect', 'disconnect', 'pair']
                };
                
                // 保存默认设置到数据库
                await this._rawQuery(
                    "INSERT OR REPLACE INTO settings (id, value) VALUES ('deviceList', ?)",
                    [JSON.stringify(defaultSettings)]
                );
                
                return defaultSettings;
            }
        } catch (error) {
            logError('获取设备列表设置失败:', error);
            throw error;
        }
    }

    // 更新设备列表刷新设置
    async updateDeviceListSettings(newSettings) {
        let transaction = false;
        try {
            if (!newSettings) {
                const error = new Error('新设备列表设置为空');
                logError(error);
                throw error;
            }

            log('开始更新设备列表设置...');
            log('原始设置:', JSON.stringify(newSettings, null, 2));

            // 定义允许的设置字段和类型
            const allowedSettings = {
                refreshMode: 'string',
                refreshInterval: 'number',
                smartRefreshEvents: 'object' // 数组也是object类型
            };

            // 验证refreshMode的有效值
            const validRefreshModes = ['auto', 'smart', 'manual'];

            // 清理和验证设置对象
            const cleanSettings = {};
            
            // 验证和清理refreshMode
            if ('refreshMode' in newSettings) {
                const mode = newSettings.refreshMode;
                if (typeof mode === 'string' && validRefreshModes.includes(mode)) {
                    cleanSettings.refreshMode = mode;
                } else {
                    throw new Error(`无效的刷新模式: ${mode}`);
                }
            }

            // 验证和清理refreshInterval
            if ('refreshInterval' in newSettings) {
                const interval = Number(newSettings.refreshInterval);
                if (!isNaN(interval) && interval >= 1000) {
                    cleanSettings.refreshInterval = interval;
                } else {
                    throw new Error('刷新间隔必须是大于等于1000的数字');
                }
            }

            // 验证和清理smartRefreshEvents
            if ('smartRefreshEvents' in newSettings) {
                const events = newSettings.smartRefreshEvents;
                if (Array.isArray(events)) {
                    const validEvents = ['connect', 'disconnect', 'pair'];
                    const cleanEvents = events.filter(event => 
                        typeof event === 'string' && validEvents.includes(event)
                    );
                    cleanSettings.smartRefreshEvents = cleanEvents;
                } else {
                    throw new Error('smartRefreshEvents必须是数组');
                }
            }

            log('清理后的设置:', JSON.stringify(cleanSettings, null, 2));

            // 检查是否已在事务中
            const inTransaction = await this._rawQueryGet('SELECT 1 FROM sqlite_master LIMIT 1');
            if (!inTransaction) {
                // 开始事务
                await this._rawQuery('BEGIN TRANSACTION');
                transaction = true;
            }

            try {
                // 在事务中获取当前设置
                const currentSettings = await this._rawQueryGet("SELECT value FROM settings WHERE id = 'deviceList'");
                let parsedCurrentSettings = null;
                if (currentSettings) {
                    try {
                        parsedCurrentSettings = JSON.parse(currentSettings.value);
                    } catch (e) {
                        log('解析当前设置失败，将使用默认值');
                        parsedCurrentSettings = await this.getDefaultDeviceListSettings();
                    }
                } else {
                    log('未找到当前设置，将使用默认值');
                    parsedCurrentSettings = await this.getDefaultDeviceListSettings();
                }

                // 合并设置
                const mergedSettings = {
                    ...parsedCurrentSettings,
                    ...cleanSettings
                };

                // 确保所有必需的字段都存在
                const defaultSettings = await this.getDefaultDeviceListSettings();
                for (const key of Object.keys(defaultSettings)) {
                    if (!(key in mergedSettings)) {
                        mergedSettings[key] = defaultSettings[key];
                    }
                }

                const settingsJson = JSON.stringify(mergedSettings);
                await this._rawQuery(
                    "INSERT OR REPLACE INTO settings (id, value) VALUES ('deviceList', ?)",
                    [settingsJson]
                );

                // 验证设置是否正确保存
                const verifyRow = await this._rawQueryGet("SELECT value FROM settings WHERE id = 'deviceList'");
                if (!verifyRow) {
                    throw new Error('设置保存后无法验证');
                }

                const verifySettings = JSON.parse(verifyRow.value);
                
                // 确保所有必需的字段都存在且值匹配
                const defaultKeys = Object.keys(defaultSettings);
                const isEqual = defaultKeys.every(key => {
                    if (key in mergedSettings) {
                        if (Array.isArray(mergedSettings[key])) {
                            return JSON.stringify([...verifySettings[key]].sort()) === 
                                   JSON.stringify([...mergedSettings[key]].sort());
                        }
                        if (typeof mergedSettings[key] === 'object' && mergedSettings[key] !== null) {
                            return JSON.stringify(verifySettings[key]) === JSON.stringify(mergedSettings[key]);
                        }
                        return verifySettings[key] === mergedSettings[key];
                    }
                    return false;
                });

                if (!isEqual) {
                    log('验证失败：', {
                        verified: verifySettings,
                        merged: mergedSettings
                    });
                    throw new Error('设置保存后验证不匹配');
                }

                // 只有当我们开启了事务时才提交
                if (transaction) {
                    await this._rawQuery('COMMIT');
                    log('设备列表设置更新成功，事务已提交');
                } else {
                    log('设备列表设置更新成功');
                }
                
                return mergedSettings;
            } catch (error) {
                // 只有当我们开启了事务时才回滚
                if (transaction) {
                    await this._rawQuery('ROLLBACK');
                }
                throw error;
            }
        } catch (error) {
            logError('更新设备列表设置失败:', error);
            throw error;
        }
    }

    // 获取默认的scrcpy设置
    async getDefaultScrcpySettings() {
        return {
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
    }

    // 获取默认的设备列表设置
    async getDefaultDeviceListSettings() {
        return {
            refreshMode: 'smart',
            refreshInterval: 5000,
            smartRefreshEvents: ['connect', 'disconnect', 'pair']
        };
    }
}

module.exports = SettingsManager; 