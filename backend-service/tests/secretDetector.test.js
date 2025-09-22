/* eslint-disable */
const path = require('path');

// Mock axios before importing the module under test
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
  isAxiosError: (err) => Boolean(err && err.isAxiosError),
}));

const axios = require('axios').default;

// Helper to load the compiled service after setting env
function loadService() {
  // Import compiled JS from dist
  // tests/ -> ../dist/services/secretDetector.js
  // Clear from cache to allow re-import per test if needed
  const modPath = path.join(__dirname, '..', 'dist', 'services', 'secretDetector.js');
  delete require.cache[require.resolve(modPath)];
  return require(modPath).default;
}

describe('SecretDetectorService - Prompt Security parsing', () => {
  beforeEach(() => {
    // Ensure env is set (required by detectWithPromptSecurity)
    process.env.PROMPT_SECURITY_API_URL = 'https://eu.prompt.security/api/protect';
    process.env.PROMPT_SECURITY_APP_ID = 'test-app-id';

    // Reset mock
    axios.post.mockReset();
  });

  test('parses standard result shape and marks CRITICAL when action is block', async () => {
    axios.post.mockResolvedValue({
      data: {
        result: {
          action: 'block',
          prompt: {
            findings: {
              Secrets: [
                { entity_type: 'AWS Access Key', category: 'Access Tokens', entity: 'AKIAEXAMPLEKEY123456' },
              ],
            },
            scores: { Secrets: { score: 0.9 } },
          },
        },
      },
    });

    const service = loadService();
    const res = await service.detectSecrets('dummy');

    expect(res).toHaveLength(1);
    expect(res[0].type).toBe('AWS Access Key');
    expect(res[0].confidence).toBeCloseTo(0.9, 5);
    expect(res[0].riskLevel).toBe('CRITICAL'); // action=block forces CRITICAL
    expect(res[0].source).toBe('prompt_security');
  });

  test('parses defensive shape (prompt at root) and maps risk by category', async () => {
    axios.post.mockResolvedValue({
      data: {
        prompt: {
          action: 'allow',
          findings: {
            Secrets: [
              { entity_type: 'Password', category: 'Other', entity: 'hunter2' },
            ],
          },
          scores: { Secrets: { score: 0.8 } },
        },
      },
    });

    const service = loadService();
    const res = await service.detectSecrets('dummy');

    expect(res).toHaveLength(1);
    expect(res[0].type).toBe('Password');
    expect(res[0].confidence).toBeCloseTo(0.8, 5);
    expect(res[0].riskLevel).toBe('MEDIUM'); // category=Other -> MEDIUM
  });
});

