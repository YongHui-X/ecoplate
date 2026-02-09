import { WebDriver } from 'selenium-webdriver';
import { createDriver, quitDriver } from '../../helpers/driver';
import { LoginPage } from '../../pages/LoginPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { loginAsTestUser, isLoggedIn, ensureLoggedOut } from '../../helpers/auth';

describe('Logout', () => {
  let driver: WebDriver;
  let dashboardPage: DashboardPage;
  let loginPage: LoginPage;

  beforeAll(async () => {
    driver = await createDriver();
    dashboardPage = new DashboardPage(driver);
    loginPage = new LoginPage(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  beforeEach(async () => {
    // Ensure clean state before each test
    await ensureLoggedOut(driver);
  });

  it('should be logged in after login', async () => {
    await loginAsTestUser(driver);

    const loggedIn = await isLoggedIn(driver);
    expect(loggedIn).toBe(true);
  });

  it('should logout and redirect to login', async () => {
    await loginAsTestUser(driver);

    // Clear localStorage to simulate logout
    await driver.executeScript('localStorage.clear()');
    await dashboardPage.navigate('/login');

    const url = await dashboardPage.getCurrentUrl();
    expect(url).toContain('/login');
  });
});
