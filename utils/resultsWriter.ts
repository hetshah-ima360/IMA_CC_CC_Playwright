import * as fs from 'fs';
import * as path from 'path';

export interface SimulationRecord {
  scenario: string;
  contractNumber: string;
  description: string;
  // Result fields captured from the Calculation Simulation results grid.
  commitmentNumber: string;
  calcStartDate: string;
  calcEndDate: string;
  formula1: string;            // Commitment Metrics (Formula 1)
  actualValue1: string;        // Actual Value (1)
  commitmentValue1: string;    // Commitment Value (1)
  commitmentMet: string;       // Yes/No
  penaltyValue?: string;       // Penalty Value (when the grid has that column)
  status?: string;
  runAt?: string;
}

/**
 * Append a Calculation Simulation result to results/simulation-<number>-<desc>.json.
 * JSON only. The description is slugified for the filename.
 */
export function appendSimulationResult(rec: SimulationRecord): void {
  const dir = path.join(process.cwd(), 'results');
  fs.mkdirSync(dir, { recursive: true });

  const slug = (rec.description || 'contract').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const file = path.join(dir, `simulation-${rec.contractNumber}-${slug}.json`);

  const record: SimulationRecord = { ...rec, runAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  console.log(`[debug] Wrote result -> ${path.relative(process.cwd(), file)}`);
}

/**
 * Write ALL result rows for a run to results/simulation-<number>-<desc>.json as
 * a JSON array (one record per row in the results grid).
 */
export function writeSimulationResults(
  base: { scenario: string; contractNumber: string; description: string },
  results: Array<{
    commitmentNumber: string;
    calcStartDate: string;
    calcEndDate: string;
    formula1: string;
    actualValue1: string;
    commitmentValue1: string;
    commitmentMet: string;
    penaltyValue?: string;
    status?: string;
  }>,
): void {
  const dir = path.join(process.cwd(), 'results');
  fs.mkdirSync(dir, { recursive: true });

  const slug = (base.description || 'contract').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const file = path.join(dir, `simulation-${base.contractNumber}-${slug}.json`);

  const runAt = new Date().toISOString();
  const records: SimulationRecord[] = results.map((r) => ({ ...base, ...r, runAt }));
  fs.writeFileSync(file, JSON.stringify(records, null, 2));
  console.log(`[debug] Wrote ${records.length} result row(s) -> ${path.relative(process.cwd(), file)}`);
}
