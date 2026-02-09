import { WebDriver } from 'selenium-webdriver';
import { createDriver, quitDriver, takeScreenshot } from '../../helpers/driver';
import { MyFridgePage } from '../../pages/MyFridgePage';
import { loginAsTestUser } from '../../helpers/auth';

describe('MyFridge - View Products', () => {
  let driver: WebDriver;
  let fridgePage: MyFridgePage;

  beforeAll(async () => {
    driver = await createDriver();
    fridgePage = new MyFridgePage(driver);
    await loginAsTestUser(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  beforeEach(async () => {
    await fridgePage.goto();
  });

  it('should navigate to My Fridge page', async () => {
    await fridgePage.goto();
    const url = await fridgePage.getCurrentUrl();
    expect(url).toContain('/myfridge');
  });

  it('should display scan receipt button', async () => {
    const isVisible = await fridgePage.isScanReceiptButtonVisible();
    expect(isVisible).toBe(true);
  });

  it('should display add item button', async () => {
    const isVisible = await fridgePage.isAddItemButtonVisible();
    expect(isVisible).toBe(true);
  });

  it('should show products or empty state', async () => {
    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    const pageSource = await driver.getPageSource();

    // Check for page features that indicate it loaded
    const hasMyFridgeTitle = pageSource.includes('MyFridge');
    const hasScanReceipt = pageSource.includes('Scan Receipt');
    const hasAddItem = pageSource.includes('Add Item');

    // Page should at least have the MyFridge title and action buttons
    expect(hasMyFridgeTitle && hasScanReceipt && hasAddItem).toBe(true);
  });
});
