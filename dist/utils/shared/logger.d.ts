export declare enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3
}
export interface LogEntry {
    timestamp: string;
    level: string;
    service: string;
    message: string;
    data?: any;
    error?: Error;
}
declare class Logger {
    private static instance;
    private serviceName;
    private logLevel;
    private enableConsole;
    private enableFile;
    private constructor();
    static getInstance(serviceName?: string, logLevel?: LogLevel, enableConsole?: boolean, enableFile?: boolean): Logger;
    private createLogEntry;
    private formatConsoleOutput;
    private writeLog;
    error(message: string, data?: any, error?: Error): void;
    warn(message: string, data?: any): void;
    info(message: string, data?: any): void;
    debug(message: string, data?: any): void;
    setLogLevel(level: LogLevel): void;
    getLogLevel(): LogLevel;
    setServiceName(name: string): void;
}
export declare const logger: Logger;
export { Logger };
//# sourceMappingURL=logger.d.ts.map