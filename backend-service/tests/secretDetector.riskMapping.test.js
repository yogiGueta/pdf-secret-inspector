/* eslint-disable */
const path = require('path');

jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));
const axios = require('axios').default;

const loadService = () => {
  const p = path.join(__dirname, '..', 'dist', 'services', 'secretDetector.js');
  delete require.cache[require.resolve(p)];
  return require(p).default;
};

beforeEach(() => {
  process.env.PROMPT_SECURITY_API_URL = 'https://eu.prompt.security/api/protect';
  process.env.PROMPT_SECURITY_APP_ID = 'test';
  axios.post.mockReset();
});

test('Access Tokens + AWS => CRITICAL', async () => {
  axios.post.mockResolvedValue({
    data: {
      result: {
        prompt: {
          findings: { Secrets: [ { entity_type: 'AWS Access Key', category: 'Access Tokens', entity: 'AKIAEXAMPLE' } ] },
          scores: { Secrets: { score: 0.93 } },
        },
        action: 'allow',
      },
    },
  });
  const res = await loadService().detectSecrets('dummy');
  expect(res).toHaveLength(1);
  expect(res[0].type).toBe('AWS Access Key');
  expect(res[0].riskLevel).toBe('CRITICAL'); // AWS tokens are treated as CRITICAL in mapping
});

test('action=block forces CRITICAL', async () => {
  axios.post.mockResolvedValue({
    data: {
      result: {
        action: 'block',
        prompt: {
          findings: { Secrets: [ { entity_type: 'GitHub Token', category: 'Access Tokens', entity: 'ghp_123...' } ] },
          scores: { Secrets: { score: 0.9 } },
        },
      },
    },
  });
  const res = await loadService().detectSecrets('dummy');
  expect(res[0].riskLevel).toBe('CRITICAL');
});

test('Other + Password => MEDIUM', async () => {
  axios.post.mockResolvedValue({
    data: {
      result: {
        prompt: {
          findings: { Secrets: [ { entity_type: 'Password', category: 'Other', entity: 'hunter2' } ] },
          scores: { Secrets: { score: 0.8 } },
          action: 'allow',
        },
      },
    },
  });
  const res = await loadService().detectSecrets('dummy');
  expect(res[0].riskLevel).toBe('MEDIUM');
});

