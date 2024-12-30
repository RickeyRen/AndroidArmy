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

        const args = this.settingsManager.getScrcpyArgs(deviceId);

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
}

module.exports = ScrcpyManager; 