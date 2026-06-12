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
  outcomeValue: string;      // Outcome > Scale Value (number)
  shortfallValue: string;    // Shortfall > Value (number)
  shortfallScale: string;    // Shortfall > Scale (number)
  shortfallUnit: string;     // Shortfall > Scale Unit: "%" or "USD"
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
  rows: GridRow[];
  calcLevel: string;             // "contract"
  approvalStatus: string;        // "New"
}

/** A scenario file: a named set of contracts created together by one spec. */
export interface Scenario {
  scenario: string;
  description?: string;
  contracts: Contract[];
}
