import axios, { AxiosResponse } from 'axios';
import logger from '../utils/logger';
import { DetectedSecret, RiskLevel, SecretPattern, PromptSecurityResponse } from '../types';

/**
 * Secret Detection Service
 * 
 * Combines local regex patterns with external API for comprehensive detection.
 * Started with just regex but added Prompt Security integration for better accuracy.
 * 
 * TODO: Add more sophisticated ML-based detection
 * FIXME: Some regex patterns might be too aggressive - need fine-tuning
 */
class SecretDetectorService {
  
  // Pattern definitions - these have been refined over time based on false positives
  private readonly patterns: Record<string, SecretPattern> = {
    awsAccessKey: {
      regex: /AKIA[0-9A-Z]{16}/g,
      type: 'AWS Access Key',
      description: 'AWS Access Key ID detected',
      riskLevel: 'HIGH'
    },
    
    // This pattern is a bit loose but catches most AWS secret keys
    awsSecretKey: {
      regex: /[A-Za-z0-9/+=]{40}/g,
      type: 'AWS Secret Key', 
      description: 'Potential AWS Secret Access Key',
      riskLevel: 'HIGH'
    },
    
    githubToken: {
      regex: /ghp_[A-Za-z0-9]{36}/g,
      type: 'GitHub Token',
      description: 'GitHub Personal Access Token',
      riskLevel: 'HIGH'
    },
    
    // JWT pattern - pretty reliable
    jwtToken: {
      regex: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
      type: 'JWT Token',
      description: 'JSON Web Token detected',
      riskLevel: 'MEDIUM'
    },
    
    privateKey: {
      regex: /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
      type: 'Private Key',
      description: 'Private key detected',
      riskLevel: 'CRITICAL'
    },
    
    // Database URLs - covers most common formats
    databaseUrl: {
      regex: /(mongodb|mysql|postgresql|redis):\/\/[^\s]+/g,
      type: 'Database URL',
      description: 'Database connection string',
      riskLevel: 'HIGH'
    },
    
    // Generic API key pattern - might have false positives
    apiKey: {
      regex: /[Aa][Pp][Ii][_]?[Kk][Ee][Yy]['"]*\s*[:=]\s*['"][A-Za-z0-9-_]{20,}['"]/g,
      type: 'API Key',
      description: 'API key detected',
      riskLevel: 'MEDIUM'
    },
    
    // Password pattern - also prone to false positives
    password: {
      regex: /[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]['"]*\s*[:=]\s*['"][^'"]{6,}['"]/g,
      type: 'Password',
      description: 'Password detected',
      riskLevel: 'MEDIUM'
    }
  };

  /**
   * Main detection method - combines local and API detection
   */
  async detectSecrets(text: string): Promise<DetectedSecret[]> {
    const secrets: DetectedSecret[] = [];

    // Try external API first - it's more accurate
    try {
      const apiSecrets = await this.detectWithPromptSecurity(text);
      secrets.push(...apiSecrets);
    } catch (error) {
      // Fallback to local detection if API fails
      logger.warn('Prompt Security API unavailable, using local detection only', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });

      const localSecrets = this.detectWithLocalPatterns(text);
      secrets.push(...localSecrets);
    }

    return this.deduplicateSecrets(secrets);
  }

  /**
   * Local pattern matching using regex
   * Fast and doesn't require external dependencies
   */
  private detectWithLocalPatterns(text: string): DetectedSecret[] {
    const secrets: DetectedSecret[] = [];

    for (const [patternName, pattern] of Object.entries(this.patterns)) {
      const matches = text.match(pattern.regex);
      if (matches) {
        matches.forEach((match) => {
          const location = text.indexOf(match);
          secrets.push({
            type: pattern.type,
            description: pattern.description,
            value: this.maskSecret(match),
            location,
            confidence: 0.8, // Local patterns have decent confidence
            riskLevel: pattern.riskLevel,
            source: 'local'
          });
        });
      }
    }

    return secrets;
  }

  /**
   * External API detection using Prompt Security
   * More sophisticated but requires network call
   */
  private async detectWithPromptSecurity(text: string): Promise<DetectedSecret[]> {
    const apiUrl = process.env.PROMPT_SECURITY_API_URL;
    const appId = process.env.PROMPT_SECURITY_APP_ID;

    if (!apiUrl || !appId) {
      throw new Error('Prompt Security API not configured');
    }

    try {
      const response: AxiosResponse<PromptSecurityResponse> = await axios.post(
        apiUrl,
        {
          prompt: text,
        },
        {
          timeout: 10000, // 10 second timeout
          headers: {
            'Content-Type': 'application/json',
            'APP-ID': appId
          }
        }
      );

      return this.parsePromptSecurityResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          throw new Error('API service unavailable');
        }
      }
      throw error;
    }
  }

  /**
   * Parse the response from Prompt Security API
   * Their API format might change, so we're defensive here
   */
  private parsePromptSecurityResponse(data: PromptSecurityResponse): DetectedSecret[] {
    const secrets: DetectedSecret[] = [];

    // Be defensive about API response shape
    const anyData: any = data as any;
    const resultPrompt = anyData?.result?.prompt ?? anyData?.prompt ?? {};
    const findings = Array.isArray(resultPrompt?.findings?.Secrets)
      ? resultPrompt.findings.Secrets
      : [];
    const action = anyData?.result?.action ?? resultPrompt?.action;
    const confidenceScore: number = (resultPrompt?.scores?.Secrets?.score ?? 0.95) as number;
    const isBlocked = action === 'block';

    findings.forEach((secret: any) => {
      const entityType = secret?.entity_type || 'Unknown';
      const category = secret?.category || 'Other';
      secrets.push({
        type: entityType,
        description: `${entityType} detected${category ? ` in ${category}` : ''}`,
        value: this.maskSecret(secret?.entity || ''),
        location: 0, // API doesn't provide location
        confidence: confidenceScore,
        riskLevel: isBlocked ? 'CRITICAL' : this.mapCategoryToRiskLevel(category, entityType),
        source: 'prompt_security'
      });
    });

    return secrets;
  }

  /**
   * Map Prompt Security categories to our risk levels
   */
  private mapCategoryToRiskLevel(category: string, entityType: string): RiskLevel {
    // Access tokens are generally high risk
    if (category === 'Access Tokens') {
      if (entityType.includes('AWS')) return 'CRITICAL';
      if (entityType.includes('GitHub')) return 'HIGH';
      return 'HIGH';
    }
    
    // Other category - assess by entity type
    if (category === 'Other') {
      if (entityType.includes('Password')) return 'MEDIUM';
      return 'MEDIUM';
    }
    
    // Default to HIGH for unknown categories with secrets
    return 'HIGH';
  }

  /**
   * Calculate overall risk level based on all detected secrets
   * Uses the highest risk level found
   */
  calculateRiskLevel(secrets: DetectedSecret[]): RiskLevel {
    if (secrets.length === 0) return 'NONE';

    const riskLevels = secrets.map(s => s.riskLevel);
    
    // Priority order for risk levels
    if (riskLevels.includes('CRITICAL')) return 'CRITICAL';
    if (riskLevels.includes('HIGH')) return 'HIGH';
    if (riskLevels.includes('MEDIUM')) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Mask secret values for safe logging
   * Shows first and last few characters only
   */
  private maskSecret(secret: string): string {
    if (secret.length <= 8) {
      return '*'.repeat(secret.length);
    }
    return secret.substring(0, 4) + '*'.repeat(secret.length - 8) + secret.substring(secret.length - 4);
  }

  /**
   * Remove duplicate secrets based on type and location
   * Different detection methods might find the same secret
   */
  private deduplicateSecrets(secrets: DetectedSecret[]): DetectedSecret[] {
    const seen = new Set<string>();
    return secrets.filter(secret => {
      const key = `${secret.type}-${secret.location}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

// Export singleton instance
export default new SecretDetectorService();
