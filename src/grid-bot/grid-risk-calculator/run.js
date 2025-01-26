import chalk from 'chalk'
import { gridRiskCalculator } from './grid-risk-calculator.js'
import { config, riskConfig } from '../config.js'
import logger from '../../utils/logger.js'

const { gridStep, gridNumber } = gridRiskCalculator({ ...riskConfig, ...config })

logger.info(chalk.cyan.bold('GRID STEP:'), chalk.yellow.bold(gridStep))
logger.info(chalk.cyan.bold('GRID NUMBER:'), chalk.yellow.bold(gridNumber))