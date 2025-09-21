import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { DetectedSecret, RiskLevel } from '../types';

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom logger setup with Winston
 * 
 * Originally tried using pino for better performance, but Winston's 
 * ecosystem is more mature for our use case. Might revisit later.
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'pdf-secret-inspector',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    // Separate error logs for easier debugging
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    })
  ]
});

// Add console logging for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

/**
 * Enhanced logger with domain-specific methods
 * These methods provide structured logging for our specific use cases
 */
interface EnhancedLogger extends winston.Logger {
  logError: (error: Error, context?: Record<string, any>) => void;
  logSecretDetection: (filename: string, secrets: DetectedSecret[], riskLevel: RiskLevel) => void;
  logFileProcessing: (filename: string, size: number, processingTime: number) => void;
}

// Add custom methods to logger
const enhancedLogger = logger as EnhancedLogger;

enhancedLogger.logError = (error: Error, context: Record<string, any> = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    ...context,
    timestamp: new Date().toISOString()
  });
};

enhancedLogger.logSecretDetection = (filename: string, secrets: DetectedSecret[], riskLevel: RiskLevel) => {
  // Don't log actual secret values for security
  const sanitizedSecrets = secrets.map(s => ({
    type: s.type,
    confidence: s.confidence,
    source: s.source
  }));
  
  logger.warn('Secret Detection Alert', {
    filename,
    secretCount: secrets.length,
    riskLevel,
    secrets: sanitizedSecrets,
    timestamp: new Date().toISOString()
  });
};

enhancedLogger.logFileProcessing = (filename: string, size: number, processingTime: number) => {
  logger.info('File Processing Complete', {
    filename,
    sizeKB: Math.round(size / 1024 * 100) / 100, // Round to 2 decimal places
    processingTimeMs: processingTime,
    timestamp: new Date().toISOString()
  });
};

export default enhancedLogger;
