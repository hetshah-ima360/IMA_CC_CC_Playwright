import { Page, expect, Locator } from '@playwright/test';

/**
 * App Launcher + Top-Nav Navigation for IMA360 Platform.
 * For Commitment Metrics, the menu is in the top nav: "Commitment Metrics ▾"
 */
export class AppLauncherPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async openContractCompliance() {
    if (!this.page.url().includes('/applauncher')) {
      await this.page.goto('/applauncher', { waitUntil: 'domcontentloaded' });
    }

    // Wait for tiles to render
    await expect(this.page.getByText('AI Solutions', { exact: true }).first())
      .toBeVisible({ timeout: 30_000 });
    await expect(this.page.getByText('CPQ', { exact: true }).first())
      .toBeVisible({ timeout: 10_000 });

    const tile = this.page.getByText('Contract Compliance', { exact: true }).first();
    await tile.click();

    await this.page.waitForURL(/dashboard.*Contract.*Compliance/i, { timeout: 30_000 });
    await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  }

  /**
   * Opens Commitment Metrics > (the create/list entry).
   * Try clicking the menu, then the appropriate sub-item.
   */
  async openCommitmentMetricsList() {
    const menu = this.page.getByText('Commitment Metrics', { exact: true }).first();
    await menu.waitFor({ state: 'visible', timeout: 20_000 });
    await menu.click();
    await this.page.waitForTimeout(500);

    // The Commitment Metrics dropdown likely has entries like
    // "Contract Setup", "Contract Approval", etc. The list page is
    // typically the first/main entry. Try common names.
    const candidates = ['Contract Setup', 'Setup', 'List', 'Commitment Metrics'];

    let opened = false;
    for (const name of candidates) {
      const item = this.page.locator(`text=/^${name}$/`).first();
      if (await item.isVisible({ timeout: 2_000 }).catch(() => false)) {
        try {
          await item.click();
          opened = true;
          break;
        } catch {
          continue;
        }
      }
    }

    // Fallback: navigate directly
    if (!opened) {
      console.log('[debug] Menu navigation fallback - going to /commitment-metrics-list');
      await this.page.goto('/commitment-metrics-list', { waitUntil: 'domcontentloaded' });
    }

    await this.page.waitForURL(/commitment-metrics-list|commitment-metrics/i, { timeout: 30_000 })
      .catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  }
}
