import { config } from 'dotenv';
import { AppConfig } from '../types';

// Load environment variables early
config();

/**
 * Application configuration
 * Centralizes all environment-based settings with sensible defaults
 * 
 * TODO: Add validation for required env vars in production
 * FIXME: Consider using a proper config validation library like joi
 */
const appConfig: AppConfig = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development'
  },
  
  security: {
    // Allow Chrome extensions and localhost for development
    // In production, this should be more restrictive
    corsOrigins: process.env.CORS_ORIGIN?.split(',') || [
      'chrome-extension://*', 
      'http://localhost:*'
    ],
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
  },
  
  files: {
    maxSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB default
    allowedTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || ['application/pdf']
  },
  
  promptSecurity: {
    ...(process.env.PROMPT_SECURITY_API_URL && { apiUrl: process.env.PROMPT_SECURITY_API_URL }),
    ...(process.env.PROMPT_SECURITY_APP_ID && { appId: process.env.PROMPT_SECURITY_APP_ID })
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log'
  }
};

// Validate critical config in production
if (appConfig.server.env === 'production') {
  if (!appConfig.promptSecurity.apiUrl || !appConfig.promptSecurity.appId) {
    console.warn('⚠️  Prompt Security API not configured - falling back to local detection only');
  }
}

export default appConfig;
