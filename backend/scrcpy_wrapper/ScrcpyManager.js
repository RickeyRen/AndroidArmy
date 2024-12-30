const { spawn } = require('child_process');
const EventEmitter = require('events');

class ScrcpyManager extends EventEmitter {
    constructor(settingsManager) {
        super();
        this.sessions = new Map();
        this.settingsManager = settingsManager;
    }

    async startSession(deviceId) {
        if (this.sessions.has(deviceId)) {
            console.log(`设备 ${deviceId} 已经存在会话，先停止旧会话`);
            await this.stopSession(deviceId);
        }

        const args = await this.getScrcpyArgs(deviceId);

        try {
            console.log('启动 scrcpy，参数:', args.join(' '));
            const process = spawn('scrcpy', args, {
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            process.stdout.on('data', (data) => {
                console.log(`scrcpy stdout [${deviceId}]:`, data.toString());
            });

            process.stderr.on('data', (data) => {
                console.error(`scrcpy stderr [${deviceId}]:`, data.toString());
            });

            process.on('error', (error) => {
                console.error(`Scrcpy 会话错误 ${deviceId}:`, error);
                this.emit('session-error', { deviceId, error });
            });

            process.on('exit', (code) => {
                console.log(`Scrcpy 会话结束 ${deviceId}, 退出码:`, code);
                this.sessions.delete(deviceId);
                this.emit('session-ended', { deviceId, code });
            });

            // 等待一段时间确保进程启动
            await new Promise((resolve) => setTimeout(resolve, 1000));

            if (process.exitCode === null) {
                this.sessions.set(deviceId, {
                    process,
                    startTime: Date.now()
                });
                console.log(`Scrcpy 会话启动成功 ${deviceId}`);
                this.emit('session-started', { deviceId });
                return true;
            } else {
                throw new Error(`Scrcpy 进程异常退出，退出码: ${process.exitCode}`);
            }
        } catch (error) {
            console.error(`启动 Scrcpy 会话失败 ${deviceId}:`, error);
            throw error;
        }
    }

    async stopSession(deviceId) {
        const session = this.sessions.get(deviceId);
        if (!session) {
            console.log(`设备 ${deviceId} 没有活动的会话`);
            return false;
        }

        try {
            console.log(`正在停止设备 ${deviceId} 的会话`);
            session.process.kill();
            this.sessions.delete(deviceId);
            return true;
        } catch (error) {
            console.error(`停止 Scrcpy 会话失败 ${deviceId}:`, error);
            throw error;
        }
    }

    async stopAllSessions() {
        const promises = [];
        for (const [deviceId] of this.sessions) {
            promises.push(this.stopSession(deviceId));
        }
        return Promise.all(promises);
    }

    getSessionInfo(deviceId) {
        const session = this.sessions.get(deviceId);
        if (!session) {
            return null;
        }

        return {
            deviceId,
            uptime: Date.now() - session.startTime,
            isRunning: !session.process.killed
        };
    }

    getAllSessions() {
        const sessions = [];
        for (const [deviceId] of this.sessions) {
            sessions.push(this.getSessionInfo(deviceId));
        }
        return sessions;
    }

    async getScrcpyArgs(deviceId) {
        const settings = await this.settingsManager.getScrcpySettings();
        const args = ['-s', deviceId];

        // 添加基本设置
        if (settings.maxSize) args.push('--max-size', settings.maxSize);
        if (settings.videoBitrateKbps) args.push('--video-bit-rate', settings.videoBitrateKbps + 'K');
        if (settings.maxFps) args.push('--max-fps', settings.maxFps);
        if (settings.screenWidth && settings.screenHeight) {
            args.push('--window-width', settings.screenWidth);
            args.push('--window-height', settings.screenHeight);
        }
        if (settings.lockVideoOrientation !== undefined && settings.lockVideoOrientation !== -1) {
            args.push('--lock-video-orientation', settings.lockVideoOrientation);
        }
        if (settings.encoderName) args.push('--encoder', settings.encoderName);
        if (settings.borderless) args.push('--window-borderless');
        if (settings.fullscreen) args.push('--fullscreen');
        if (settings.alwaysOnTop) args.push('--always-on-top');
        if (settings.stayAwake) args.push('--stay-awake');
        if (settings.turnScreenOff) args.push('--turn-screen-off');
        if (settings.showTouches) args.push('--show-touches');
        if (settings.audioEnabled) args.push('--audio');
        if (settings.powerOffOnClose) args.push('--power-off-on-close');
        if (!settings.clipboardAutosync) args.push('--no-clipboard-autosync');
        if (!settings.shortcutKeysEnabled) args.push('--disable-screensaver');

        return args;
    }
}

module.exports = ScrcpyManager; 