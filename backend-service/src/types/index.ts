// Core types for the PDF Secret Inspector service
// These interfaces define the shape of data flowing through our system

export interface DetectedSecret {
  type: string;
  description: string;
  value: string;
  location: number;
  confidence: number;
  riskLevel: RiskLevel;
  source: 'local' | 'prompt_security';
}

export type RiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PDFContent {
  text: string;
  pages: number;
  wordCount: number;
  metadata?: Record<string, any>;
  info?: Record<string, any>;
}

export interface InspectionResult {
  filename: string;
  fileSize: number;
  processingTime: number;
  secretsFound: number;
  riskLevel: RiskLevel;
  secrets: Array<Omit<DetectedSecret, 'value'>>;
  metadata: {
    pages: number;
    wordCount: number;
    timestamp: string;
  };
}

export interface SecretPattern {
  regex: RegExp;
  type: string;
  description: string;
  riskLevel: RiskLevel;
}

export interface PromptSecurityResponse {
  status: string;
  result: {
    action: string;
    prompt: {
      action: string;
      findings: {
        Secrets?: Array<{
          category: string;
          entity: string;
          entity_type: string;
          sanitized_entity: string;
        }>;
      };
      passed: boolean;
      scores?: {
        Secrets?: {
          score: number;
          threshold?: number;
        };
      };
    };
  };
}

export interface AppConfig {
  server: {
    port: number;
    env: string;
  };
  security: {
    corsOrigins: string[];
    rateLimitWindow: number;
    rateLimitMax: number;
  };
  files: {
    maxSize: number;
    allowedTypes: string[];
  };
  promptSecurity: {
    apiUrl?: string;
    appId?: string;
  };
  logging: {
    level: string;
    file: string;
  };
}
