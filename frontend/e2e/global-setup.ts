import { config } from './selenium.config.js';

async function globalSetup(): Promise<void> {
  console.log('E2E Global Setup: Checking application health...');

  const healthUrl = `${config.baseUrl}${config.healthCheck.url}`;
  let attempts = 0;

  while (attempts < config.healthCheck.maxAttempts) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        console.log(`Application is healthy at ${config.baseUrl}`);
        return;
      }
    } catch (error) {
      // App not ready yet
    }

    attempts++;
    console.log(
      `Health check attempt ${attempts}/${config.healthCheck.maxAttempts}...`
    );
    await new Promise((resolve) =>
      setTimeout(resolve, config.healthCheck.intervalMs)
    );
  }

  throw new Error(
    `Application failed to become healthy after ${config.healthCheck.maxAttempts} attempts`
  );
}

export default globalSetup;
