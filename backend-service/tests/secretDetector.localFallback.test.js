/* eslint-disable */
const path = require('path');

jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn(() => Promise.reject(Object.assign(new Error('ECONNREFUSED'), { isAxiosError: true, code: 'ECONNREFUSED' }))) },
  isAxiosError: () => true,
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
});

test('falls back to local regex and detects AWS Access Key', async () => {
  const res = await loadService().detectSecrets('this is AKIAIOSFODNN7EXAMPLE in text');
  expect(res.length).toBeGreaterThan(0);
  expect(res.find(s => s.type === 'AWS Access Key')).toBeTruthy();
  expect(res[0].source).toBe('local');
});

