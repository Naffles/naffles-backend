"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor(serviceName = 'naffles-service', logLevel = LogLevel.INFO, enableConsole = true, enableFile = false) {
        this.serviceName = serviceName;
        this.logLevel = logLevel;
        this.enableConsole = enableConsole;
        this.enableFile = enableFile;
    }
    static getInstance(serviceName, logLevel, enableConsole, enableFile) {
        if (!Logger.instance) {
            Logger.instance = new Logger(serviceName, logLevel, enableConsole, enableFile);
        }
        return Logger.instance;
    }
    createLogEntry(level, message, data, error) {
        return {
            timestamp: new Date().toISOString(),
            level,
            service: this.serviceName,
            message,
            data,
            error
        };
    }
    formatConsoleOutput(entry) {
        const timestamp = entry.timestamp;
        const level = entry.level.toUpperCase().padEnd(5);
        const service = entry.service.padEnd(15);
        let output = `[${timestamp}] ${level} [${service}] ${entry.message}`;
        if (entry.data) {
            output += `\nData: ${JSON.stringify(entry.data, null, 2)}`;
        }
        if (entry.error) {
            output += `\nError: ${entry.error.message}`;
            if (entry.error.stack) {
                output += `\nStack: ${entry.error.stack}`;
            }
        }
        return output;
    }
    writeLog(level, levelName, message, data, error) {
        if (level > this.logLevel) {
            return;
        }
        const entry = this.createLogEntry(levelName, message, data, error);
        if (this.enableConsole) {
            const output = this.formatConsoleOutput(entry);
            switch (level) {
                case LogLevel.ERROR:
                    console.error(output);
                    break;
                case LogLevel.WARN:
                    console.warn(output);
                    break;
                case LogLevel.INFO:
                    console.info(output);
                    break;
                case LogLevel.DEBUG:
                    console.debug(output);
                    break;
            }
        }
        if (this.enableFile) {
        }
    }
    error(message, data, error) {
        this.writeLog(LogLevel.ERROR, 'error', message, data, error);
    }
    warn(message, data) {
        this.writeLog(LogLevel.WARN, 'warn', message, data);
    }
    info(message, data) {
        this.writeLog(LogLevel.INFO, 'info', message, data);
    }
    debug(message, data) {
        this.writeLog(LogLevel.DEBUG, 'debug', message, data);
    }
    setLogLevel(level) {
        this.logLevel = level;
    }
    getLogLevel() {
        return this.logLevel;
    }
    setServiceName(name) {
        this.serviceName = name;
    }
}
exports.Logger = Logger;
exports.logger = Logger.getInstance();
//# sourceMappingURL=logger.js.map