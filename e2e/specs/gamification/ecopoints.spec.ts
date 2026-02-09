import { WebDriver } from 'selenium-webdriver';
import { createDriver, quitDriver } from '../../helpers/driver';
import { EcoPointsPage } from '../../pages/EcoPointsPage';
import { loginAsTestUser } from '../../helpers/auth';

describe('Gamification - EcoPoints', () => {
  let driver: WebDriver;
  let ecoPointsPage: EcoPointsPage;

  beforeAll(async () => {
    driver = await createDriver();
    ecoPointsPage = new EcoPointsPage(driver);
    await loginAsTestUser(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  it('should navigate to ecopoints page', async () => {
    await ecoPointsPage.goto();
    
    const url = await ecoPointsPage.getCurrentUrl();
    expect(url).toContain('/ecopoints');
  });
});
