import { test } from '@playwright/test';
import { AppLauncherPage } from '../../pages/AppLauncherPage';
import { CommitmentMetricsPage } from '../../pages/CommitmentMetricsPage';
import { CalculationSimulationPage } from '../../pages/CalculationSimulationPage';
import { loginAndOpenContractCompliance, createCommitmentContract } from '../../utils/commitmentRunner';
import { writeSimulationResults } from '../../utils/resultsWriter';
import { Scenario } from '../../utils/types';

import rawData from '../../data/IMA_CC_CM_11.json';

const scenario = rawData as unknown as Scenario;
const contract = scenario.contracts[0];
const sim = scenario.simulation;

/**
 * IMA_CC_CM_11 — create the Commitment Metrics contract, then read the newest
 * commitment number and run a Calculation Simulation, storing the result.
 * Expected results from the sheet are in data/IMA_CC_CM_11.json under "simulation".
 */
test.describe('Commitment Metrics — IMA_CC_CM_11 (Regression)', () => {
  test('IMA_CC_CM_11 - create contract then run simulation', async ({ page }) => {
    test.setTimeout(0);

    await loginAndOpenContractCompliance(page);
    const created = await createCommitmentContract(page, contract);
    console.log(`Created contract (form value): ${created}`);

    const launcher = new AppLauncherPage(page);
    const cm = new CommitmentMetricsPage(page);
    await launcher.openCommitmentMetricsContractSetup();
    const commitmentNumber = await cm.getCommitmentNumberFromList();
    console.log(`\n>>> Commitment Number created: ${commitmentNumber}\n`);

    await launcher.openCommitmentMetricsCalculationSimulation();
    const calcPeriodFrom = sim?.calcPeriodFrom ?? '07/01/2024';
    const calcPeriodTo = sim?.calcPeriodTo ?? '07/31/2024';

    const cs = new CalculationSimulationPage(page);
    await cs.runSimulation({
      contractType: contract.header.commitmentType,
      commitmentNumber,
      calcPeriodFrom,
      calcPeriodTo,
    });

    const results = await cs.readResults();
    writeSimulationResults(
      {
        scenario: scenario.scenario,
        contractNumber: commitmentNumber,
        description: contract.description,
      },
      results,
    );
    const exp = sim?.expected ?? [];
    console.log(`>>> IMA_CC_CM_11: ${results.length} result row(s) captured`);
    results.forEach((r, i) => {
      const e = exp[i];
      console.log(
        `   row ${i + 1}: Formula1="${r.formula1}", Actual(1)=${r.actualValue1}, Commitment(1)=${r.commitmentValue1}, Met=${r.commitmentMet} (status ${r.status})` +
        (e ? ` | expected Actual=${e.actualValue ?? 'n/a'}, Met=${e.commitmentMet ?? 'n/a'}` : ''),
      );
    });
  });
});
