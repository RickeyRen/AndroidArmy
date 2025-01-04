// 设置控制台编码为 UTF-8
if (process.platform === 'win32') {
    process.env.LANG = 'zh_CN.UTF-8';
}

function log(...args) {
    // 确保所有参数都经过正确的编码处理
    const encodedArgs = args.map(arg => 
        typeof arg === 'string' ? Buffer.from(arg, 'utf8').toString() : arg
    );
    console.log(new Date().toISOString(), ...encodedArgs);
}

function logError(...args) {
    // 确保所有参数都经过正确的编码处理
    const encodedArgs = args.map(arg => 
        typeof arg === 'string' ? Buffer.from(arg, 'utf8').toString() : arg
    );
    console.error(new Date().toISOString(), ...encodedArgs);
}

module.exports = {
    log,
    logError
}; 