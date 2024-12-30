const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class ScriptEngine extends EventEmitter {
    constructor(deviceManager) {
        super();
        this.deviceManager = deviceManager;
        this.scripts = new Map();
        this.runningTasks = new Map();
    }

    async loadScript(scriptPath) {
        try {
            const content = await fs.readFile(scriptPath, 'utf-8');
            const scriptName = path.basename(scriptPath, '.js');
            
            // 解析脚本内容
            const script = {
                name: scriptName,
                path: scriptPath,
                content: content,
                commands: this.parseCommands(content)
            };

            this.scripts.set(scriptName, script);
            return script;
        } catch (error) {
            console.error('加载脚本失败:', error);
            throw error;
        }
    }

    parseCommands(content) {
        // 这里实现简单的命令解析
        // 实际应用中可以实现更复杂的解析器
        return content.split('\n')
            .filter(line => line.trim() && !line.startsWith('#'))
            .map(line => line.trim());
    }

    async executeScript(scriptName, deviceIds, options = {}) {
        const script = this.scripts.get(scriptName);
        if (!script) {
            throw new Error(`脚本 ${scriptName} 不存在`);
        }

        const taskId = `${scriptName}_${Date.now()}`;
        const task = {
            id: taskId,
            scriptName,
            deviceIds,
            startTime: Date.now(),
            status: 'running',
            results: new Map()
        };

        this.runningTasks.set(taskId, task);
        this.emit('task-started', { taskId, script, deviceIds });

        try {
            for (const command of script.commands) {
                // 对每个设备执行命令
                const results = await this.deviceManager.broadcastCommand(command);
                task.results.set(command, results);
                
                this.emit('command-executed', {
                    taskId,
                    command,
                    results
                });

                // 检查是否需要延时
                if (options.delay) {
                    await new Promise(resolve => setTimeout(resolve, options.delay));
                }
            }

            task.status = 'completed';
            task.endTime = Date.now();
            this.emit('task-completed', { taskId, results: task.results });
            
            return {
                taskId,
                status: 'success',
                results: task.results
            };
        } catch (error) {
            task.status = 'failed';
            task.error = error;
            task.endTime = Date.now();
            
            this.emit('task-failed', { taskId, error });
            throw error;
        } finally {
            // 保留任务记录一段时间后清理
            setTimeout(() => {
                this.runningTasks.delete(taskId);
            }, 3600000); // 1小时后清理
        }
    }

    async stopScript(taskId) {
        const task = this.runningTasks.get(taskId);
        if (!task || task.status !== 'running') {
            return false;
        }

        task.status = 'stopped';
        task.endTime = Date.now();
        this.emit('task-stopped', { taskId });
        return true;
    }

    getTaskStatus(taskId) {
        return this.runningTasks.get(taskId);
    }

    getAllTasks() {
        return Array.from(this.runningTasks.values());
    }

    getAvailableScripts() {
        return Array.from(this.scripts.keys());
    }
}

module.exports = ScriptEngine; 