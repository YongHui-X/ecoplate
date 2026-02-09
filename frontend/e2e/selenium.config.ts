export const config = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  headless: process.env.HEADLESS !== 'false',
  timeout: {
    implicit: 10000,
    pageLoad: 30000,
    script: 30000,
  },
  healthCheck: {
    url: '/api/v1/health',
    maxAttempts: 30,
    intervalMs: 5000,
  },
};
