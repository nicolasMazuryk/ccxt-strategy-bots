import winston from 'winston'
import chalk from 'chalk'

const formatMultipleParams = (...args) => {
    return args.map(arg => {
        if (typeof arg === 'object') {
            return JSON.stringify(arg)
        }
        return String(arg)
    }).join(' ')
}

const isVscodeDebugger = process.env.IS_VSCODE_DEBUGGER == 'true'

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }) => {
            const colorizedMessage = (() => {
                if (message.includes('ERROR') || message.includes('Failed')) {
                    return chalk.red(message)
                }
                if (message.includes('Successfully')) {
                    return chalk.green(message)
                }
                if (message.includes('WARNING') || message.includes('reconnecting')) {
                    return chalk.yellow(message)
                }
                if (message.includes('Initializing') || message.includes('Starting')) {
                    return chalk.cyan(message)
                }
                return message
            })()
            return `${chalk.gray(`[${timestamp}]`)} ${level.toUpperCase()}: ${colorizedMessage}`
        })
    ),
    transports: [
        ...(isVscodeDebugger ? [] : [
            new winston.transports.File({ 
                filename: 'logs/error.log', 
                level: 'error',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            }),
            new winston.transports.File({ 
                filename: 'logs/combined.log',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            })
        ]),
        new winston.transports.Console({
            forceConsole: isVscodeDebugger,
            
            format: winston.format.combine(
                winston.format.timestamp(),
                // winston.format.colorize(),
                winston.format.simple(),
                winston.format.printf(({ level, message, timestamp }) => {
                    const colorizedMessage = (() => {
                        if (message.includes('ERROR') || message.includes('Failed')) {
                            return chalk.red(message)
                        }
                        if (message.includes('Successfully')) {
                            return chalk.green(message)
                        }
                        if (message.includes('WARNING') || message.includes('reconnecting')) {
                            return chalk.yellow(message)
                        }
                        if (message.includes('Initializing') || message.includes('Starting')) {
                            return chalk.cyan(message)
                        }
                        return message
                    })()
                    return `${chalk.gray(`[${timestamp}] ${level.toUpperCase()}`)}: ${colorizedMessage}`
                })
            )
        })
    ]
})

// Wrap logger methods to handle multiple parameters
const wrappedLogger = {
    info: (...args) => logger.info(formatMultipleParams(...args)),
    error: (...args) => logger.error(formatMultipleParams(...args)),
    warn: (...args) => logger.warn(formatMultipleParams(...args)),
    debug: (...args) => logger.debug(formatMultipleParams(...args))
}

export default wrappedLogger

// export default console