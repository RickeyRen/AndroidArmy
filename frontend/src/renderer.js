// 调试日志函数
const debug = (message, ...args) => {
    console.log(`[Renderer] ${message}`, ...args);
};

// 错误日志函数
const logError = (message, error) => {
    console.error(`[Renderer] ${message}:`, error);
    console.error('Error stack:', error.stack);
};

// 窗口控制
if (process.platform === 'win32') {
    debug('Setting up window controls');
    
    try {
        // 最小化按钮
        const minimizeBtn = document.querySelector('.window-control-button.minimize');
        if (!minimizeBtn) {
            throw new Error('Minimize button not found');
        }
        
        minimizeBtn.addEventListener('click', async () => {
            debug('Minimize button clicked');
            try {
                if (!window.api || !window.api.windowControl) {
                    throw new Error('Window control API not available');
                }
                const result = await window.api.windowControl.minimize();
                debug('Minimize result:', result);
            } catch (error) {
                logError('Minimize error', error);
            }
        });

        // 最大化/还原按钮
        const maximizeBtn = document.querySelector('.window-control-button.maximize');
        if (!maximizeBtn) {
            throw new Error('Maximize button not found');
        }
        
        maximizeBtn.addEventListener('click', async () => {
            debug('Maximize button clicked');
            try {
                if (!window.api || !window.api.windowControl) {
                    throw new Error('Window control API not available');
                }
                const result = await window.api.windowControl.maximize();
                debug('Maximize result:', result);
            } catch (error) {
                logError('Maximize error', error);
            }
        });

        // 关闭按钮
        const closeBtn = document.querySelector('.window-control-button.close');
        if (!closeBtn) {
            throw new Error('Close button not found');
        }
        
        closeBtn.addEventListener('click', async () => {
            debug('Close button clicked');
            try {
                if (!window.api || !window.api.windowControl) {
                    throw new Error('Window control API not available');
                }
                const result = await window.api.windowControl.close();
                debug('Close result:', result);
            } catch (error) {
                logError('Close error', error);
            }
        });
        
        debug('Window controls setup complete');
    } catch (error) {
        logError('Window controls setup error', error);
    }
}

// 其他渲染进程代码... 