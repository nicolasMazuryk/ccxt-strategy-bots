import logger from './logger.js'
import chalk from 'chalk'
import { performance } from 'perf_hooks'

export function profileFunction(fn, fnName, context) {
    return function (...args) {
        const start = performance.now()
        const result = fn.apply(this, args)
        const end = performance.now()
        
        // Store execution time in a performance metrics object
        if (!context.performanceMetrics) {
            context.performanceMetrics = {}
        }
        if (!context.performanceMetrics[fnName]) {
            context.performanceMetrics[fnName] = {
                totalTime: 0,
                calls: 0,
                avgTime: 0
            }
        }
        
        const metrics = context.performanceMetrics[fnName]
        metrics.totalTime += (end - start)
        metrics.calls++
        metrics.avgTime = metrics.totalTime / metrics.calls

        return result
    }
}

export function logPerformanceMetrics(metrics) {
    const formattedMetrics = Object.entries(metrics)
        .sort(([, a], [, b]) => b.totalTime - a.totalTime)
        .reduce((acc, [key, value]) => {
            acc[key] = {
                totalTime: value.totalTime.toFixed(2) + 'ms',
                calls: value.calls,
                avgTime: value.avgTime.toFixed(3) + 'ms'
            }
            return acc
        }, {})

    logger.info(chalk.cyan('\n[Performance Metrics]'))
    console.table(formattedMetrics)
}
