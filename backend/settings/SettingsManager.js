const path = require('path');
const sqlite3 = require('sqlite3');
const fs = require('fs').promises;
const { log, logError } = require('../utils/logger');

class SettingsManager {
    constructor() {
        this.dbPath = path.join(__dirname, '../../database/devices.db');
        this.db = null;
        this.isInitializing = false;
        this.initPromise = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.defaultSettings = {
            scrcpy: {
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
                powerOffOnClose: false,
                clipboardAutosync: true,
                shortcutKeysEnabled: true
            },
            deviceList: {
                refreshMode: 'smart',
                refreshInterval: 5000,
                smartRefreshEvents: ['connect', 'disconnect', 'pair']
            }
        };
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
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    logError(`重试初始化数据库 (${this.retryCount}/${this.maxRetries})...`);
                    this.isInitializing = false;
                    setTimeout(() => {
                        this.initializeDatabase()
                            .then(resolve)
                            .catch(reject);
                    }, 1000 * this.retryCount);
                } else {
                    reject(error);
                }
            } finally {
                this.isInitializing = false;
            }
        });

        return this.initPromise;
    }

    async _connectToDatabase() {
        if (this.db) {
            try {
                await this._rawQuery('SELECT 1');
                return;
            } catch (error) {
                try {
                    await new Promise((resolve) => this.db.close(() => resolve()));
                } catch (e) {
                    logError('关闭无效连接时出错:', e);
                }
                this.db = null;
            }
        }

        return new Promise((resolve, reject) => {
            log('尝试连接数据库:', this.dbPath);
            
            this.db = new sqlite3.Database(
                this.dbPath,
                sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
                async (err) => {
                    if (err) {
                        logError('连接数据库失败:', err);
                        this.db = null;
                        reject(err);
                        return;
                    }

                    try {
                        log('成功连接到数据库');
                        this.db.configure('busyTimeout', 30000);
                        await this._rawQuery('PRAGMA journal_mode = WAL');
                        await this._rawQuery('PRAGMA synchronous = NORMAL');
                        await this._rawQuery('PRAGMA foreign_keys = ON');
                        await this._rawQuery('PRAGMA temp_store = MEMORY');
                        await this._rawQuery('PRAGMA cache_size = -2000');
                        await this._rawQuery('PRAGMA busy_timeout = 30000');
                        await this._rawQuery('PRAGMA locking_mode = NORMAL');
                        log('数据库配置完成');
                        resolve();
                    } catch (error) {
                        logError('配置数据库失败:', error);
                        try {
                            await new Promise((resolve) => this.db.close(() => resolve()));
                        } catch (e) {
                            logError('关闭失败的连接时出错:', e);
                        }
                        this.db = null;
                        reject(error);
                    }
                }
            );

            this.db.on('error', (error) => {
                logError('数据库连接错误:', error);
                this.db = null;
            });
        });
    }

    async _rawQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    async _rawQueryGet(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async _rawQueryAll(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async query(sql, params = []) {
        const maxRetries = 5;
        let lastError = null;
        let delay = 1000;

        for (let i = 0; i < maxRetries; i++) {
            try {
                await this._connectToDatabase();
                return await this._rawQuery(sql, params);
            } catch (error) {
                lastError = error;
                if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
                    log(`数据库忙，等待 ${delay}ms 后重试 (${i + 1}/${maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                    continue;
                }
                if (i === maxRetries - 1) throw error;
            }
        }
        throw lastError;
    }

    async queryGet(sql, params = []) {
        const maxRetries = 5;
        let lastError = null;
        let delay = 1000;

        for (let i = 0; i < maxRetries; i++) {
            try {
                await this._connectToDatabase();
                return await this._rawQueryGet(sql, params);
            } catch (error) {
                lastError = error;
                if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
                    log(`数据库忙，等待 ${delay}ms 后重试 (${i + 1}/${maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                    continue;
                }
                if (i === maxRetries - 1) throw error;
            }
        }
        throw lastError;
    }

    async queryAll(sql, params = []) {
        const maxRetries = 5;
        let lastError = null;
        let delay = 1000;

        for (let i = 0; i < maxRetries; i++) {
            try {
                await this._connectToDatabase();
                return await this._rawQueryAll(sql, params);
            } catch (error) {
                lastError = error;
                if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
                    log(`数据库忙，等待 ${delay}ms 后重试 (${i + 1}/${maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                    continue;
                }
                if (i === maxRetries - 1) throw error;
            }
        }
        throw lastError;
    }

    async _initTables() {
        let inTransaction = false;
        try {
            log('开始初始化数据库表...');
            
            // 等待任何现有的事务完成
            await this.query('PRAGMA busy_timeout = 60000');
            await this.query('PRAGMA journal_mode = WAL');
            await this.query('PRAGMA synchronous = NORMAL');
            
            const tables = await this.queryAll(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name IN ('settings', 'devices')
            `);
            log('现有的表:', tables.map(t => t.name));

            // 创建 settings 表
            await this.query(`
                CREATE TABLE IF NOT EXISTS settings (
                    id TEXT PRIMARY KEY,
                    value TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            log('成功创建 settings 表');

            // 创建 devices 表
            await this.query(`
                CREATE TABLE IF NOT EXISTS devices (
                    ip_port TEXT PRIMARY KEY,
                    display_name TEXT,
                    brand TEXT,
                    model TEXT,
                    android_version TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            log('成功创建 devices 表');

            // 获取所有设置
            const settings = await this.queryAll(`
                SELECT id, value FROM settings
            `);

            // 检查并初始化默认设置
            const defaultSettings = {
                scrcpy: {
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
                deviceList: {
                    refreshMode: 'smart',
                    refreshInterval: 5000,
                    smartRefreshEvents: ['connect', 'disconnect', 'pair']
                }
            };

            // 开始事务
            await this.query('BEGIN TRANSACTION');
            inTransaction = true;

            for (const [settingId, defaultValue] of Object.entries(defaultSettings)) {
                const existingSetting = settings.find(s => s.id === settingId);
                if (!existingSetting) {
                    await this.query(
                        'INSERT INTO settings (id, value) VALUES (?, ?)',
                        [settingId, JSON.stringify(defaultValue)]
                    );
                }
            }

            // 提交事务
            await this.query('COMMIT');
            inTransaction = false;

        } catch (error) {
            logError('初始化数据库表失败:', error);
            if (inTransaction) {
                try {
                    await this.query('ROLLBACK');
                } catch (rollbackError) {
                    logError('回滚事务失败:', rollbackError);
                }
            }
            throw error;
        }
    }

    async validateSettings() {
        log('验证应用程序设置...');
        try {
            const scrcpySettings = await this.getScrcpySettings();
            log('当前scrcpy设置:', scrcpySettings);

            const deviceListSettings = await this.getDeviceListSettings();
            log('当前设备列表设置:', deviceListSettings);
        } catch (error) {
            logError('验证设置失败:', error);
            throw error;
        }
    }

    async getScrcpySettings() {
        try {
            const row = await this.queryGet('SELECT value FROM settings WHERE id = ?', ['scrcpy']);
            if (row) {
                return JSON.parse(row.value);
            }
            return null;
        } catch (error) {
            logError('获取 scrcpy 设置失败:', error);
            throw error;
        }
    }

    async getDeviceListSettings() {
        try {
            const row = await this.queryGet('SELECT value FROM settings WHERE id = ?', ['deviceList']);
            if (row) {
                return JSON.parse(row.value);
            }
            return null;
        } catch (error) {
            logError('获取设备列表设置失败:', error);
            throw error;
        }
    }

    async saveScrcpySettings(settings) {
        try {
            await this.query(
                'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [JSON.stringify(settings), 'scrcpy']
            );
        } catch (error) {
            logError('更新 scrcpy 设置失败:', error);
            throw error;
        }
    }

    async updateDeviceListSettings(settings) {
        try {
            await this.query(
                'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [JSON.stringify(settings), 'deviceList']
            );
        } catch (error) {
            logError('更新设备列表设置失败:', error);
            throw error;
        }
    }

    async waitForInit() {
        if (!this.initPromise) {
            await this.initializeDatabase();
        }
        return this.initPromise;
    }

    async close() {
        if (this.db) {
            try {
                await new Promise((resolve, reject) => {
                    this.db.close((err) => {
                        if (err) {
                            logError('关闭数据库时出错:', err);
                            reject(err);
                        } else {
                            log('数据库已安全关闭');
                            resolve();
                        }
                    });
                });
            } catch (error) {
                logError('关闭数据库失败:', error);
                throw error;
            } finally {
                this.db = null;
            }
        }
    }

    async getDeviceCustomName(ipPort) {
        try {
            const row = await this.queryGet(
                'SELECT display_name FROM devices WHERE ip_port = ?',
                [ipPort]
            );
            return row ? row.display_name : null;
        } catch (error) {
            logError('获取设备名称失败:', error);
            throw error;
        }
    }

    async getAllDeviceCustomNames() {
        try {
            const rows = await this.queryAll("SELECT id, custom_name FROM devices WHERE custom_name IS NOT NULL");
            const names = {};
            rows.forEach(row => {
                names[row.id] = row.custom_name;
            });
            return names;
        } catch (error) {
            logError('获取所有设备名称失败:', error);
            return {};
        }
    }

    async setDeviceCustomName(ipPort, displayName) {
        try {
            await this.query(
                'INSERT OR REPLACE INTO devices (ip_port, display_name, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                [ipPort, displayName]
            );
            log('设备名称已更新:', { ipPort, displayName });
        } catch (error) {
            logError('更新设备名称失败:', error);
            throw error;
        }
    }

    async getDeviceDisplayName(ipPort) {
        try {
            const row = await this.queryGet(
                "SELECT display_name FROM devices WHERE ip_port = ?",
                [ipPort]
            );
            return row ? row.display_name : null;
        } catch (error) {
            logError('获取设备显示名称失败:', error);
            return null;
        }
    }

    async getAllDeviceDisplayNames() {
        try {
            const rows = await this.queryAll("SELECT ip_port, display_name FROM devices WHERE display_name IS NOT NULL");
            const names = {};
            rows.forEach(row => {
                names[row.ip_port] = row.display_name;
            });
            return names;
        } catch (error) {
            logError('获取所有设备显示名称失败:', error);
            return {};
        }
    }

    async setDeviceDisplayName(ipPort, displayName) {
        try {
            await this.query(
                'INSERT OR REPLACE INTO devices (ip_port, display_name) VALUES (?, ?)',
                [ipPort, displayName]
            );
            return displayName;
        } catch (error) {
            logError('更新设备显示名称失败:', error);
            throw error;
        }
    }
}

module.exports = SettingsManager; 