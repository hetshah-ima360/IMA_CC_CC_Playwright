import { Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { AppLauncherPage } from '../pages/AppLauncherPage';
import { CommitmentMetricsPage } from '../pages/CommitmentMetricsPage';
import { Contract } from './types';

/**
 * Log in and open the Contract Compliance app ONCE for a scenario run.
 * Call this in beforeAll; the session is reused for every contract.
 */
export async function loginAndOpenContractCompliance(page: Page) {
  const username = process.env.IMA360_USERNAME;
  const password = process.env.IMA360_PASSWORD;
  if (!username || !password) {
    throw new Error('IMA360_USERNAME and IMA360_PASSWORD must be set in .env');
  }

  const login = new LoginPage(page);
  await login.goto();
  await login.login(username, password);
  console.log('✓ Logged in (once for the scenario)');

  const launcher = new AppLauncherPage(page);
  await launcher.openContractCompliance();
  console.log('✓ Opened Contract Compliance');
}

/**
 * Create one Commitment Metrics contract end-to-end from a Contract object.
 * Navigates to the Commitment Metrics list first, so it can be called once per
 * contract within a shared session. Returns the commitment number, or null.
 *
 * Scale tiers are handled inside fillCalculationRows() for any row whose
 * incrementalBasis is true and has scales.
 */
export async function createCommitmentContract(page: Page, c: Contract): Promise<string | null> {
  const launcher = new AppLauncherPage(page);
  await launcher.openCommitmentMetricsList();
  console.log('✓ Navigated to Commitment Metrics list');

  const cm = new CommitmentMetricsPage(page);
  await cm.clickAddFromList();
  await cm.fillCreateModal(c);

  await cm.fillGeneralTab(c);
  await cm.clickNext();
  console.log('→ Eligibility Rules');

  await cm.fillEligibilityRows(c);
  await cm.validateEligibility();
  await cm.clickNext();
  console.log('→ Calculation Rules');

  await cm.fillCalculationRows(c);
  await cm.clickNext();
  console.log('→ Notes & Attachments');

  await cm.clickNext();
  console.log('→ Approval');

  await cm.setApprovalStatus(c.approvalStatus);
  await cm.clickSave();
  await cm.assertSaveSuccessful();

  try {
    return await cm.getCommitmentNumber();
  } catch {
    return null;
  }
}
