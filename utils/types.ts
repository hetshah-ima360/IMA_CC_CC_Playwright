/**
 * Type definitions for Commitment Metrics scenarios.
 */

/** General Tab fields, shared across all rows of the same contract. */
export interface ContractHeader {
  commitmentType: string;
  description: string;
  startDate: string;             // MM/DD/YYYY
  endDate: string;
  sourceData: string;
  calculationFrequency: string;
  group: string;
  contractSubgroup: string;
  origin: string;
  exclusiveFormula?: boolean;    // CONTRACT > Exclusive Formula toggle (optional)
  agreementStatus?: string;      // CONTRACT > Agreement Status (optional)
}

/**
 * One tier (row) in the Scale Data popup.
 *
 * The popup has 7 input fields grouped as:
 *   [Formula] : Operator | Value | Unit
 *   Outcome   : Scale Value
 *   Shortfall : Value | Scale | Scale Unit
 *
 * Example: < (LT) | 800000 | USD || 0.5 || 10000 | 1 | %
 */
export interface Scale {
  operator: string;          // condition operator: GE, LE, GT, LT
  value: string;             // condition value (number)
  unit: string;              // condition unit: "%" or "USD"
  // --- Standard (Outcome + Shortfall) layout ---
  outcomeValue?: string;     // Outcome > Scale Value (number)
  shortfallValue?: string;   // Shortfall > Value (number)
  shortfallScale?: string;   // Shortfall > Scale (number)
  shortfallUnit?: string;    // Shortfall > Scale Unit: "%" or "USD"
  // --- Incremental-basis layout (Scale Value/Unit + Increment Value/Scale Value) ---
  scaleValue?: string;       // Scale > Value (number)
  scaleUnit?: string;        // Scale > Unit dropdown: "%" or "USD"
  incrementValue?: string;   // Increment > Value (number)
  incrementScaleValue?: string; // Increment > Scale Value (number)
}

/** One row in the Eligibility grid paired with one row in the Calculation grid. */
export interface GridRow {
  // Eligibility
  validFrom: string;
  validTo: string;
  salesOrg: string;
  customerNumber: string;
  eligibilityType: string;
  eligibilityOption: string;
  conditionId: string;

  // Calculation
  formulaId: string;
  operator: string;
  valueType: string;
  value: string;
  unit: string;

  // Incremental Basis + Scale tiers
  incrementalBasis: boolean;
  scales: Scale[];           // empty if no scales for this row
}

/** A complete contract: header + N grid rows. */
export interface Contract {
  description: string;
  header: ContractHeader;
  rows: GridRow[];               // legacy paired model; use [] when using eligibility/calculation
  eligibility?: EligibilityRow[];  // decoupled eligibility rows (overrides rows for eligibility)
  calculation?: CalculationRow[];  // decoupled calculation rows (overrides rows for calculation)
  calcLevel: string;             // "contract"
  approvalStatus: string;        // "New"
}

/**
 * A standalone Eligibility grid row (decoupled from calculation). Only the
 * fields you set are filled; the rest of the columns are left untouched.
 */
export interface EligibilityRow {
  exclude?: boolean;             // Exclude checkbox
  validFrom: string;
  validTo: string;
  salesOrg: string;
  customerNumber?: string;
  customerChain?: string;
  nationalGroup?: string;
  subgroup?: string;
  region?: string;
  district?: string;
  deleted?: boolean;             // Deleted checkbox
}

/** A standalone Calculation grid row (decoupled from eligibility). */
export interface CalculationRow {
  formulaId: string;
  calcLevel?: string;            // defaults to Contract.calcLevel when omitted
  operator: string;
  valueType: string;
  value: string;
  unit: string;
  startDate: string;
  endDate: string;
  incrementalBasis: boolean;
  scales: Scale[];               // empty if no scales for this row
}

/** A scenario file: a named set of contracts created together by one spec. */
export interface Scenario {
  scenario: string;
  description?: string;
  contracts: Contract[];
  simulation?: SimulationConfig;
}

/** Expected Calculation Simulation result for one formula (from the sheet). */
export interface SimulationExpectation {
  formula: string;
  commitmentMet: string;
  actualValue: string;
  penaltyValue?: string;
}

/** Calculation Simulation config + expected results captured from the sheet. */
export interface SimulationConfig {
  calcPeriodFrom: string;
  calcPeriodTo: string;
  stagingContractNumber?: string;
  expected?: SimulationExpectation[];
}
