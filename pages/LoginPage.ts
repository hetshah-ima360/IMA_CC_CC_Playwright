import { Page, expect, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel(/email address/i).first();
    this.passwordInput = page.getByLabel(/^password/i).first();
    this.signInButton = page.getByRole('button', { name: /^sign in$/i }).first();
  }

  async goto() {
    await this.page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(this.emailInput).toBeVisible({ timeout: 30_000 });
  }

  async login(username: string, password: string) {
    await this.emailInput.fill(username);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
    await this.page.waitForURL(url => !url.toString().includes('/login'), { timeout: 60_000 });
  }
}
