import { test, Page, BrowserContext } from '@playwright/test';
import { Contract, Scenario } from '../../utils/types';
import {
  loginAndOpenContractCompliance,
  createCommitmentContract,
} from '../../utils/commitmentRunner';
import scenarioData from '../../data/HS_CC_Standard_Commitments.json';

/**
 * Scenario: HS_CC_Standard_Commitments
 *
 * One JSON file (data/HS_CC_Standard_Commitments.json) holds all the contracts
 * for this scenario. This single spec logs in ONCE, then creates each contract
 * in turn (reusing the same browser session), navigating back to the
 * Commitment Metrics list between contracts.
 *
 * Run just this scenario:
 *   npx playwright test HS_CC_Standard_Commitments --headed
 */

const scenario = scenarioData as unknown as Scenario;
const contracts: Contract[] = scenario.contracts;

console.log(`\n[setup] Scenario "${scenario.scenario}" — ${contracts.length} contract(s):`);
contracts.forEach((c, i) => {
  const scaled = c.rows.some((r) => r.incrementalBasis && r.scales.length > 0);
  console.log(`  ${i + 1}. ${c.description} (${c.rows.length} row${c.rows.length > 1 ? 's' : ''})${scaled ? ' [has scales]' : ''}`);
});
console.log('');

test.describe(`Commitment Metrics — ${scenario.scenario}`, () => {
  test.describe.configure({ mode: 'serial' });

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await loginAndOpenContractCompliance(page);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  for (const c of contracts) {
    test(`Create ${c.description}`, async () => {
      test.setTimeout(0);
      console.log(`\n>>> Creating: ${c.description}`);
      const num = await createCommitmentContract(page, c);
      console.log(`\n✓ PASS: ${c.description}${num ? ' → ' + num : ''}\n`);
    });
  }
});
