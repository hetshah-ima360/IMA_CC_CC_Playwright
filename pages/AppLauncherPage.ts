import { Page, expect } from '@playwright/test';

/**
 * App Launcher + Top-Nav Navigation for IMA360 Platform.
 * For Commitment Metrics, the menu is in the top nav: "Commitment Metrics ▾".
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

    // Readiness is keyed off the "Search apps" box (the old "AI Solutions"/"CPQ"
    // tiles no longer exist). Then click the Contract Compliance tile, falling
    // back to filtering via the search box if it isn't immediately visible.
    await this.page.getByPlaceholder(/search apps/i).first()
      .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});

    const tile = () => this.page.getByText('Contract Compliance', { exact: true }).first();
    if (!(await tile().isVisible({ timeout: 5_000 }).catch(() => false))) {
      const search = this.page.getByPlaceholder(/search apps/i).first();
      await search.fill('Contract Compliance').catch(() => {});
      await this.page.waitForTimeout(800);
    }
    await tile().click();

    await this.page.waitForURL(/dashboard.*Contract.*Compliance/i, { timeout: 30_000 }).catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  }

  /** Opens Commitment Metrics > Contract Setup (the contract list page). */
  async openCommitmentMetricsList() {
    await this.openCommitmentMetricsMenuItem(['Contract Setup', 'Setup', 'List']);
    await this.page.waitForURL(/commitment-metrics-list|commitment-metrics/i, { timeout: 30_000 })
      .catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    console.log('[debug] Reached Commitment Metrics > Contract Setup list');
  }

  /** Alias for readability in specs. */
  async openCommitmentMetricsContractSetup() {
    await this.openCommitmentMetricsList();
  }

  /** Opens Commitment Metrics > Calculation Simulation. */
  async openCommitmentMetricsCalculationSimulation() {
    console.log(`[debug] Opening Commitment Metrics > Calculation Simulation from: ${this.page.url()}`);
    await this.openCommitmentMetricsMenuItem(['Calculation Simulation', 'Calculation Simulation ']);
    await this.page.waitForURL(/calculation-simulation/i, { timeout: 30_000 }).catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    // Page readiness: the Contract Selection / Contract Type controls are present.
    await this.page.getByText(/Contract Type/i).first()
      .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    console.log('[debug] Reached Calculation Simulation page');
  }

  /** Open the "Commitment Metrics" top-nav menu and click the first matching item. */
  private async openCommitmentMetricsMenuItem(itemNames: string[]) {
    const menu = this.page.getByText('Commitment Metrics', { exact: true }).first();
    await menu.waitFor({ state: 'visible', timeout: 20_000 });
    await menu.click();
    await this.page.waitForTimeout(500);

    for (const name of itemNames) {
      const item = this.page.getByText(name, { exact: true }).first();
      if (await item.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await item.click().catch(() => {});
        return;
      }
    }

    // Fallback: direct navigation for the list page only.
    if (itemNames.some((n) => /setup|list/i.test(n))) {
      console.log('[debug] Menu navigation fallback - going to /commitment-metrics-list');
      await this.page.goto('/commitment-metrics-list', { waitUntil: 'domcontentloaded' });
    }
  }
}
