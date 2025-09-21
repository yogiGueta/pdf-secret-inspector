import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer, { MulterError } from 'multer';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import path from 'path';
import fs from 'fs';

// Internal imports
import logger from './utils/logger';
import pdfParser from './services/pdfParser';
import secretDetector from './services/secretDetector';
import config from './config';
import { InspectionResult } from './types';

/**
 * PDF Secret Inspector Backend Service
 * 
 * Express server that processes PDF files and detects secrets.
 * Started as a simple proof of concept but grew into a more robust service.
 */

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());

// CORS setup
app.use(cors({
  origin: config.security.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindow,
  max: config.security.rateLimitMax,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});
app.use('/api/', limiter);

// Request logging
app.use(morgan('combined', { 
  stream: { 
    write: (message: string) => logger.info(message.trim()) 
  } 
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// File upload configuration
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: config.files.maxSize,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      const error = new Error('Only PDF files are allowed') as any;
      error.code = 'INVALID_FILE_TYPE';
      cb(error, false);
    }
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Health check endpoint
 */
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime()
  });
});

/**
 * PDF inspection endpoint
 */
app.post('/api/inspect-pdf', upload.single('pdf'), async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      res.status(400).json({
        error: 'No PDF file provided',
        code: 'NO_FILE'
      });
      return;
    }

    const { filename, path: filePath, size } = req.file;
    logger.info(`Processing PDF: ${filename} (${size} bytes)`);

    // Extract text from PDF
    const pdfContent = await pdfParser.extractText(filePath);
    
    // Detect secrets
    const secrets = await secretDetector.detectSecrets(pdfContent.text);
    
    // Calculate risk level
    const riskLevel = secretDetector.calculateRiskLevel(secrets);
    
    const processingTime = Date.now() - startTime;

    // Log results
    if (secrets.length > 0) {
      logger.logSecretDetection(filename || 'unknown', secrets, riskLevel);
    }
    
    logger.logFileProcessing(filename || 'unknown', size, processingTime);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    // Prepare response
    const result: InspectionResult = {
      filename: filename || 'unknown',
      fileSize: size,
      processingTime,
      secretsFound: secrets.length,
      riskLevel,
      secrets: secrets.map(secret => ({
        type: secret.type,
        description: secret.description,
        confidence: secret.confidence,
        location: secret.location,
        riskLevel: secret.riskLevel,
        source: secret.source
      })),
      metadata: {
        pages: pdfContent.pages,
        wordCount: pdfContent.wordCount,
        timestamp: new Date().toISOString()
      }
    };

    res.json(result);

  } catch (error) {
    const err = error as Error;
    logger.logError(err, { 
      endpoint: '/api/inspect-pdf', 
      file: req.file?.filename 
    });
    
    // Clean up file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Failed to process PDF',
      message: err.message,
      code: 'PROCESSING_ERROR'
    });
  }
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction): void => {
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        error: 'File too large',
        message: `PDF file must be smaller than ${Math.round(config.files.maxSize / 1024 / 1024)}MB`,
        code: 'FILE_TOO_LARGE'
      });
      return;
    }
  }
  
  logger.logError(error);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND'
  });
});

// Start server
const server = app.listen(config.server.port, () => {
  logger.info(`🔍 PDF Secret Inspector Backend running on port ${config.server.port}`);
  logger.info(`📊 Environment: ${config.server.env}`);
  logger.info(`🔒 CORS origins: ${config.security.corsOrigins.join(', ')}`);
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
