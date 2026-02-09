import { By } from 'selenium-webdriver';
import { BasePage } from './BasePage';

export class MyFridgePage extends BasePage {
  private pageTitle = By.xpath("//h1[contains(text(), 'MyFridge')]");
  private scanReceiptButton = By.xpath("//button[contains(text(), 'Scan Receipt')]");
  private addItemButton = By.xpath("//button[contains(text(), 'Add Item')]");
  private trackConsumptionButton = By.xpath("//button[contains(text(), 'Track Consumption')]");
  private productCards = By.css('.card, [class*="Card"]'); // Generic card selector
  private emptyState = By.xpath("//*[contains(text(), 'No items in your fridge yet')]");
  private categoryTabs = By.css('[role="tablist"] button');
  private searchInput = By.css('input[placeholder*="Search"]');

  async goto(): Promise<void> {
    await this.navigate('/myfridge');
    // Wait for React to render the page content
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  async isScanReceiptButtonVisible(): Promise<boolean> {
    return this.isVisible(this.scanReceiptButton);
  }

  async isAddItemButtonVisible(): Promise<boolean> {
    return this.isVisible(this.addItemButton);
  }

  async isTrackConsumptionButtonVisible(): Promise<boolean> {
    return this.isVisible(this.trackConsumptionButton);
  }

  async clickScanReceipt(): Promise<void> {
    await this.click(this.scanReceiptButton);
  }

  async clickAddItem(): Promise<void> {
    await this.click(this.addItemButton);
  }

  async clickTrackConsumption(): Promise<void> {
    await this.click(this.trackConsumptionButton);
  }

  async getProductCount(): Promise<number> {
    try {
      const products = await this.driver.findElements(this.productCards);
      return products.length;
    } catch {
      return 0;
    }
  }

  async isEmptyState(): Promise<boolean> {
    return this.isVisible(this.emptyState);
  }

  async searchProducts(query: string): Promise<void> {
    await this.type(this.searchInput, query);
  }

  async selectCategory(categoryName: string): Promise<void> {
    const categoryButton = By.xpath(`//button[contains(text(), '${categoryName}')]`);
    await this.click(categoryButton);
  }
}
