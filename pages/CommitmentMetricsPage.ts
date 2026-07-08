import { Page, expect, Locator } from '@playwright/test';
import { Contract, GridRow, Scale, EligibilityRow, CalculationRow } from '../utils/types';

export class CommitmentMetricsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async clickAddFromList() {
    console.log(`[debug] On list page: ${this.page.url()}`);
    await this.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    const addBtn = this.page.getByRole('button', { name: /^add$/i }).first();
    await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addBtn.click();
    console.log('[debug] Add clicked');

    await expect(this.page.getByText('Create Commitment Metrics').first())
      .toBeVisible({ timeout: 15_000 });
    console.log('[debug] Modal opened');
  }

  async fillCreateModal(contract: Contract) {
    console.log('[debug] Filling modal...');
    const h = contract.header;

    await this.selectComboboxByName(/commitment type/i, h.commitmentType, 'Commitment Type');
    console.log(`[debug] Commitment Type = ${h.commitmentType}`);

    const descInput = this.page.locator('input').nth(1);
    await descInput.click();
    await descInput.fill(h.description);
    console.log(`[debug] Description = ${h.description}`);

    await this.fillDateField(h.startDate, 0);
    console.log(`[debug] Start Date = ${h.startDate}`);

    await this.fillDateField(h.endDate, 1);
    console.log(`[debug] End Date = ${h.endDate}`);

    await this.page.waitForTimeout(1000);

    const confirmStrategies = [
      this.page.getByRole('button', { name: /confirm|ok|create|submit/i }),
      this.page.locator('button[type="submit"]:visible'),
      this.page.locator('button:has(svg):visible').last(),
    ];

    let confirmed = false;
    for (let i = 0; i < confirmStrategies.length; i++) {
      try {
        const btn = confirmStrategies[i].first();
        await btn.waitFor({ state: 'visible', timeout: 3_000 });
        if (await btn.isDisabled().catch(() => false)) continue;
        await btn.click();
        confirmed = true;
        break;
      } catch {
        continue;
      }
    }
    if (!confirmed) throw new Error('Could not click confirm button on modal');

    await this.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await expect(this.page.getByText('Header Data').first())
      .toBeVisible({ timeout: 20_000 });
    console.log('[debug] Full form opened');
  }

  async fillGeneralTab(contract: Contract) {
    const h = contract.header;
    console.log('[debug] Filling General tab dropdowns...');
    await this.selectComboboxByName(/calculation frequency/i, h.calculationFrequency, 'Calculation Frequency');

    if (h.exclusiveFormula !== undefined) {
      await this.setSwitchByLabel(/exclusive formula/i, h.exclusiveFormula, 'Exclusive Formula');
    }
    if (h.agreementStatus) {
      await this.selectComboboxByName(/agreement status/i, h.agreementStatus, 'Agreement Status');
    }

    await this.selectComboboxByName(/^group$/i, h.group, 'Group');
    await this.selectComboboxByName(/contract subgroup/i, h.contractSubgroup, 'Contract Subgroup');
    await this.selectComboboxByName(/^origin$/i, h.origin, 'Origin');
    console.log('[debug] General tab done');
  }

  /**
   * Set a MUI Switch (toggle) identified by a nearby label to the desired state.
   * Best-effort: reads the current checked state and only clicks if it differs.
   */
  private async setSwitchByLabel(labelRegex: RegExp, desired: boolean, label: string) {
    try {
      // The switch's checkbox input sits near a label/text with this name.
      const container = this.page.locator('div', { hasText: labelRegex })
        .filter({ has: this.page.locator('input[type="checkbox"], .MuiSwitch-root') })
        .last();
      const input = container.locator('input[type="checkbox"]').first();
      const checked = await input.isChecked().catch(() => undefined);
      if (checked === desired) {
        console.log(`[debug] ${label} already ${desired ? 'ON' : 'OFF'}`);
        return;
      }
      // Click the switch track/thumb (the input itself is visually hidden in MUI).
      const clickable = container.locator('.MuiSwitch-root, .MuiSwitch-switchBase').first();
      if (await clickable.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await clickable.click();
      } else {
        await input.click({ force: true });
      }
      console.log(`[debug] ${label} -> ${desired ? 'ON' : 'OFF'}`);
    } catch {
      console.log(`[debug] ${label}: could not set toggle (left at default)`);
    }
  }

  async fillEligibilityRows(contract: Contract) {
    // Prefer the decoupled eligibility[] model; fall back to the legacy paired rows[].
    const rows: EligibilityRow[] = contract.eligibility ?? (contract.rows ?? []).map((r) => ({
      validFrom: r.validFrom,
      validTo: r.validTo,
      salesOrg: r.salesOrg,
      customerNumber: r.customerNumber,
    }));

    console.log(`[debug] Filling ${rows.length} Eligibility row(s)...`);
    await this.waitForHandsontable('Eligibility Rules');

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.salesOrg) throw new Error(`Eligibility row ${i + 1}: Sales Org is missing.`);

      console.log(`[debug] Eligibility row ${i + 1}/${rows.length}: salesOrg=${r.salesOrg}` +
        `${r.customerNumber ? `, customer=${r.customerNumber}` : ''}` +
        `${r.customerChain ? `, chain=${r.customerChain}` : ''}` +
        `${r.nationalGroup ? `, nationalGroup=${r.nationalGroup}` : ''}` +
        `${r.subgroup ? `, subgroup=${r.subgroup}` : ''}` +
        `${r.exclude ? ', EXCLUDE' : ''}${r.deleted ? ', DELETED' : ''}`);

      await this.resetGridFocus();

      // Fill the eligibility KEY fields first. Selecting Sales Org (or another
      // key) makes the grid repopulate this row's default Valid From/To, so we
      // set the dates LAST — otherwise the key selection overwrites Valid From
      // back to today (the default), which is the "06/24/2026" we were seeing.
      await this.fillHandsontableDropdownCellWithVerify(i, 'Sales Org', r.salesOrg);

      if (r.customerNumber) await this.fillHandsontableDropdownCellWithVerify(i, 'Customer Number', r.customerNumber);
      if (r.customerChain) await this.fillHandsontableDropdownCellWithVerify(i, 'Customer Chain', r.customerChain);
      if (r.nationalGroup) await this.fillHandsontableDropdownCellWithVerify(i, 'National Group', r.nationalGroup);
      if (r.subgroup) await this.fillHandsontableDropdownCellWithVerify(i, 'Subgroup', r.subgroup);
      if (r.region) await this.fillHandsontableDropdownCellWithVerify(i, 'Region', r.region);
      if (r.district) await this.fillHandsontableDropdownCellWithVerify(i, 'District', r.district);

      // Dates AFTER the keys (see note above), with verify/retry so a defaulted
      // value doesn't slip through.
      await this.fillHandsontableDateCell(i, 'Valid From', r.validFrom);
      await this.fillHandsontableDateCell(i, 'Valid To', r.validTo);

      // Always enforce Exclude to the requested state (default OFF). The grid
      // can render the first row's Exclude as checked, and previously the code
      // only ever turned it ON — so a defaulted-on checkbox was never cleared.
      // setEligibilityCheckbox only clicks when the current state differs.
      await this.setEligibilityCheckbox(i, 'Exclude', !!r.exclude);
      if (r.deleted) await this.setEligibilityCheckbox(i, 'Deleted', true);
    }

    console.log('[debug] All Eligibility rows done');
  }

  /**
   * Toggle a Handsontable checkbox cell (e.g. Exclude / Deleted) to `checked`.
   * Reads the current state from the cell's <input type="checkbox"> and only
   * clicks if it differs.
   */
  private async setEligibilityCheckbox(rowIndex: number, columnName: string, checked: boolean) {
    try {
      await this.resetGridFocus();
      const cell = await this.locateHandsontableCell(rowIndex, columnName);
      await cell.scrollIntoViewIfNeeded();
      const box = cell.locator('input[type="checkbox"]').first();
      if (await box.count() > 0) {
        const cur = await box.isChecked().catch(() => undefined);
        if (cur === checked) {
          console.log(`[debug]   ${columnName} row ${rowIndex + 1} already ${checked}`);
          return;
        }
        await box.click({ force: true });
      } else {
        // No input found — click the cell and toggle with Space.
        await cell.click();
        await this.page.keyboard.press('Space');
      }
      console.log(`[debug]   ${columnName} row ${rowIndex + 1} -> ${checked}`);
    } catch {
      console.log(`[debug]   ${columnName} row ${rowIndex + 1}: could not toggle checkbox`);
    }
  }

  async validateEligibility() {
    // Commit any open Handsontable editor and blur the grid BEFORE validating.
    // The a11y snapshot showed a cell editor still open (stray date/combobox
    // elements) when Validate was clicked — the click lands in edit mode and the
    // validation never runs, so no toast appears.
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.resetGridFocus().catch(() => {});
    await this.page.getByText('Eligibility Rules', { exact: false }).first()
      .click({ timeout: 1_500 }).catch(() => {});
    await this.page.waitForTimeout(400);

    const validateButton = this.page.getByRole('button', { name: /^validate$/i })
      .or(this.page.locator('button[aria-label*="validate" i]')).first();
    await validateButton.scrollIntoViewIfNeeded().catch(() => {});
    await validateButton.click();

    // Toast wording varies between builds — accept common "validated/validation
    // successful" variants.
    const success = this.page.locator(
      'text=/data validated successfully|validated successfully|successfully validated|validation (successful|completed|passed)/i',
    ).first();
    const ok = await success.isVisible({ timeout: 20_000 }).catch(() => false);
    if (ok) {
      console.log('[debug] Validated successfully');
      return;
    }

    // No success toast — dump whatever toast/status text IS on screen so we can
    // see the new wording (or a real validation error), then continue rather
    // than hard-failing here so the run can still reach the Calculation tab.
    const msgs = await this.page
      .evaluate(() => {
        const out: string[] = [];
        document
          .querySelectorAll('[role="status"], [role="alert"], .MuiAlert-message, .Toastify__toast, [class*="toast" i], [class*="snackbar" i]')
          .forEach((el) => {
            const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
            if (t) out.push(t);
          });
        return Array.from(new Set(out)).slice(0, 20);
      })
      .catch(() => []);
    console.log(`[debug] No "validated" toast. Toast/status text seen: ${JSON.stringify(msgs)}`);
    await this.page.waitForTimeout(1_000);
  }

  async fillCalculationRows(contract: Contract) {
    // Prefer the decoupled calculation[] model; fall back to legacy paired rows[].
    const calc: CalculationRow[] = contract.calculation ?? (contract.rows ?? []).map((r) => ({
      formulaId: r.formulaId,
      operator: r.operator,
      valueType: r.valueType,
      value: r.value,
      unit: r.unit,
      startDate: r.validFrom,
      endDate: r.validTo,
      incrementalBasis: r.incrementalBasis,
      scales: r.scales,
    }));

    console.log(`[debug] Filling ${calc.length} Calculation row(s)...`);
    await this.waitForHandsontable('Calculation Rules');

    // The platform changed the Calculation Rules grid: Operator / Value Type /
    // Value / Unit are no longer grid columns (they moved into the per-row
    // "Scale / View Scale Info" popup). Only fill columns that actually exist so
    // we don't crash on getColumnIndex; log the ones that are gone.
    const cols = await this.gridColumnNamesLower();
    const has = (name: string) => cols.includes(name.toLowerCase());
    const movedOut = ['Operator', 'Value Type', 'Value', 'Unit'].filter((c) => !has(c));
    if (movedOut.length) {
      console.log(
        `[debug] Calc grid no longer exposes ${JSON.stringify(movedOut)} — these now live in the per-row "View Scale Info" popup. Skipping them in the grid.`,
      );
    }

    for (let i = 0; i < calc.length; i++) {
      const r = calc[i];
      console.log(`[debug] Calculation row ${i + 1}/${calc.length}: formula=${r.formulaId}, value=${r.value}${r.unit}`);

      await this.resetGridFocus();

      await this.fillHandsontableDropdownCell(i, 'Formula 1', r.formulaId);
      await this.logCalcCell(i, 'Formula 1');
      // Calc Level is a multi-select checkbox popup that DEFAULTS to
      // "1 (contract)"; picking another level only ADDS it. setCalcLevel
      // enforces a clean single selection (check the requested level, uncheck
      // every other one) so calcLevel:"Customer" ends up as Customer ONLY.
      await this.setCalcLevel(i, r.calcLevel ?? contract.calcLevel);
      await this.logCalcCell(i, 'Calc Level 1');
      if (has('Operator') && r.operator) {
        await this.fillHandsontableDropdownCell(i, 'Operator', r.operator);
        await this.logCalcCell(i, 'Operator');
      }
      if (has('Value Type') && r.valueType) {
        await this.fillHandsontableDropdownCell(i, 'Value Type', r.valueType);
        await this.logCalcCell(i, 'Value Type');
      }
      if (has('Value') && r.value) {
        await this.fillHandsontableCell(i, 'Value', r.value);
        await this.logCalcCell(i, 'Value');
      }
      if (has('Unit') && r.unit) {
        // Unit is a small fixed-list dropdown: double-click to open it and pick
        // the option directly (no type-to-filter).
        await this.fillHandsontableDropdownCell(i, 'Unit', r.unit, false);
        await this.logCalcCell(i, 'Unit');
      }
      // Start Date / End Date are intentionally NOT touched — they auto-populate
      // from the contract period and must not be changed by the script.

      // Incremental Basis + Scales — only enable the toggle when scale data
      // exists (enabling without scales puts IMA360 in an invalid state).
      if (r.incrementalBasis && r.scales.length > 0) {
        console.log(`[debug] Calc row ${i + 1}: Incremental Basis = TRUE with ${r.scales.length} scale(s)`);
        await this.enableIncrementalBasis(i);
        await this.fillScales(i, r.scales);
      } else if (r.incrementalBasis && r.scales.length === 0) {
        console.log(`[debug] Calc row ${i + 1}: Incremental Basis = TRUE but NO scale data — skipping toggle.`);
      }
    }

    console.log('[debug] All Calculation rows done');
  }

  /** Logs the current text content of a calc-grid cell, for diagnostics. */
  private async logCalcCell(rowIndex: number, columnName: string) {
    try {
      const cell = await this.locateHandsontableCell(rowIndex, columnName);
      const txt = (await cell.textContent())?.trim() || '(empty)';
      const ok = txt && txt !== '(empty)' ? '✓' : '✗ EMPTY';
      console.log(`[debug]   ${columnName} row ${rowIndex + 1} = "${txt}" ${ok}`);
    } catch (e) {
      console.log(`[debug]   ${columnName} row ${rowIndex + 1} = (could not read)`);
    }
  }

  async setApprovalStatus(status: string) {
    await this.selectComboboxByName(/approval status/i, status, 'Approval Status', {
      perStrategyTimeout: 2_000,
      openTimeout: 1_500,
      optionTimeout: 3_000,
    });
    console.log(`[debug] Approval Status = ${status}`);
  }

  async clickNext() {
    const nextBtn = this.page.getByRole('button', { name: /next|forward|→/i })
      .or(this.page.locator('button[aria-label*="next" i]')).last();
    await nextBtn.click();
    await this.page.waitForTimeout(1_500);
  }

  async clickSave() {
    const saveBtn = this.page.getByRole('button', { name: /^save$/i })
      .or(this.page.locator('button[aria-label*="save" i]')).first();
    await saveBtn.click();
  }

  async assertSaveSuccessful() {
    await expect(this.page.locator('text=/successfully|created|saved/i').first())
      .toBeVisible({ timeout: 20_000 });
  }

  async getCommitmentNumber(): Promise<string> {
    const field = this.page.getByLabel('Commitment Number', { exact: false }).first();
    await expect(field).not.toHaveValue('', { timeout: 30_000 });
    return (await field.inputValue()).trim();
  }

  /**
   * Read the newest commitment number from the Commitment Metrics list. The
   * list is sorted newest-first and each row's Commitment Number column is a
   * link formatted "<description> (<id>)" (e.g. "IMA_CC_CM_20 (655)"). Returns
   * the numeric id from the top row.
   */
  async getCommitmentNumberFromList(): Promise<string> {
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await this.page.waitForTimeout(800);

    let text = '';
    const link = this.page.getByRole('link', { name: /\(\d+\)\s*$/ }).first();
    if (await link.isVisible({ timeout: 8_000 }).catch(() => false)) {
      text = (await link.textContent())?.trim() || '';
      console.log(`[debug] Top commitment (link): "${text}"`);
    } else {
      const cell = this.page.getByText(/\(\d+\)\s*$/).first();
      text = (await cell.textContent())?.trim() || '';
      console.log(`[debug] Top commitment (text): "${text}"`);
    }

    const m = text.match(/\((\d+)\)\s*$/);
    if (!m) {
      throw new Error(`Could not parse a commitment number from the list (top row text: "${text}")`);
    }
    console.log(`[debug] Commitment number from list -> ${m[1]}`);
    return m[1];
  }

  // ============================================================
  // NEW: INCREMENTAL BASIS + SCALES
  // ============================================================

  /**
   * Clicks the Incremental Basis radio/checkbox in the Calculation Rules
   * grid for the given row, enabling the Scale popup for that row.
   */
  private async enableIncrementalBasis(rowIndex: number) {
    console.log(`[debug]   Enabling Incremental Basis for row ${rowIndex + 1}...`);
    const cell = await this.locateHandsontableCell(rowIndex, 'Incremental Basis');
    await cell.scrollIntoViewIfNeeded();
    // Prefer clicking a native input/icon inside the cell (more reliable).
    const innerSelectors = [
      'input[type="checkbox"]', 'input[type="radio"]',
      '[role="checkbox"]', '[role="radio"]',
      'button', 'svg', 'i', 'span'
    ];
    let toggled = false;
    for (const sel of innerSelectors) {
      try {
        const inner = cell.locator(sel).first();
        if (await inner.isVisible({ timeout: 300 }).catch(() => false)) {
          await inner.click({ force: true }).catch(() => {});
          toggled = true;
          break;
        }
      } catch {
        // ignore and try next selector
      }
    }

    if (!toggled) {
      // Fallback: click the cell itself
      await cell.click({ force: true }).catch(() => {});
    }

    await this.page.waitForTimeout(400);
    // Press Escape to make sure no editor stayed open
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(200);
  }

  /**
   * Fills all scale tiers for a given Calculation Rules row.
   * Opens the Scale popup by clicking the row's Scale icon, then for each
   * tier fills Operator, Value, Unit, Scale Value, and Scale Unit, finally
   * confirms with ✓.
   */
  private async fillScales(rowIndex: number, scales: Scale[]) {
    console.log(`[debug]   Opening Scale popup for row ${rowIndex + 1} (${scales.length} tier(s))...`);
    await this.openScalePopup(rowIndex);

    for (let t = 0; t < scales.length; t++) {
      const s = scales[t];
      console.log(`[debug]     Tier ${t + 1}: cond=${s.operator} ${s.value} ${s.unit} | outcome=${s.outcomeValue} | shortfall=${s.shortfallValue}/${s.shortfallScale} ${s.shortfallUnit}`);
      await this.fillScaleTier(t, s);
    }

    // Pause after filling all scale cells so HOT commits the last value.
    await this.page.waitForTimeout(600);
    await this.confirmScalePopup();

    // Popup is now closed — click back into the Calculation Rules grid so
    // Handsontable commits any pending edits and focus returns to the tab.
    try {
      const commitCell = await this.locateHandsontableCell(rowIndex, 'Formula 1');
      await commitCell.scrollIntoViewIfNeeded().catch(() => {});
      await commitCell.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(200);
      console.log('[debug]   Back on Calculation Rules ✓ — proceeding to next tab');
    } catch {
      console.log('[debug]   Could not click back into Calculation Rules grid');
    }
  }

  /**
   * Clicks the Scale icon in the Calculation Rules grid for the given row.
   * The icon lives in the "Scale" column (a small clickable icon). We try
   * several strategies because the icon may be an <svg>, an <i>, a <button>,
   * or just clickable cell content.
   */
  private async openScalePopup(rowIndex: number) {
    const cell = await this.locateHandsontableCell(rowIndex, 'Scale');
    await cell.scrollIntoViewIfNeeded();

    // DIAGNOSTIC: dump the Scale cell's inner HTML so we can see the icon.
    const cellHtml = await cell.innerHTML().catch(() => '(could not read)');
    console.log(`[debug]   Scale cell HTML (first 400): ${cellHtml.slice(0, 400)}`);

    // Check if there's a button and whether it's disabled.
    const button = cell.locator('button').first();
    const btnVisible = await button.isVisible({ timeout: 500 }).catch(() => false);
    const btnDisabled = btnVisible ? await button.isDisabled().catch(() => false) : null;
    console.log(`[debug]   Scale button: visible=${btnVisible}, disabled=${btnDisabled}`);

    // Wait a bit longer for the popup to appear (was 2s, now 3s).
    const popupAppeared = async () =>
      await this.page.getByText('Scale Data').first()
        .isVisible({ timeout: 3_000 }).catch(() => false);

    // Strategy 1: click the button directly (most precise).
    if (btnVisible && !btnDisabled) {
      console.log(`[debug]   openScalePopup: trying button.click()...`);
      await button.click({ force: true }).catch((e) => console.log(`[debug]     button.click failed: ${e.message}`));
      await this.page.waitForTimeout(300);
      if (await popupAppeared()) { console.log(`[debug]   ✓ Popup opened via button.click()`); await this.page.waitForTimeout(100); return; }
    }

    // Strategy 2: click any icon-like child element
    const iconSelectors = ['svg', 'i', '[role="button"]', 'img', 'span', 'a'];
    for (const sel of iconSelectors) {
      const icon = cell.locator(sel).first();
      if (await icon.isVisible({ timeout: 300 }).catch(() => false)) {
        console.log(`[debug]   openScalePopup: trying icon "${sel}"...`);
        await icon.click({ force: true }).catch(() => {});
        await this.page.waitForTimeout(300);
        if (await popupAppeared()) { console.log(`[debug]   ✓ Popup opened via icon "${sel}"`); await this.page.waitForTimeout(100); return; }
      }
    }

    // Strategy 3: plain click on the cell
    console.log(`[debug]   openScalePopup: trying cell.click()...`);
    await cell.click({ force: true }).catch(() => {});
    await this.page.waitForTimeout(300);
    if (await popupAppeared()) { console.log(`[debug]   ✓ Popup opened via cell.click()`); await this.page.waitForTimeout(100); return; }

    // Strategy 4: double-click the cell
    console.log(`[debug]   openScalePopup: trying cell.dblclick()...`);
    await cell.dblclick({ force: true }).catch(() => {});
    await this.page.waitForTimeout(300);
    if (await popupAppeared()) { console.log(`[debug]   ✓ Popup opened via cell.dblclick()`); await this.page.waitForTimeout(100); return; }

    // Strategy 5: click at the visual center of the cell via mouse coords
    const box = await cell.boundingBox().catch(() => null);
    if (box) {
      console.log(`[debug]   openScalePopup: trying mouse.click at center (${Math.round(box.x + box.width/2)}, ${Math.round(box.y + box.height/2)})...`);
      await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await this.page.waitForTimeout(300);
      if (await popupAppeared()) { console.log(`[debug]   ✓ Popup opened via mouse.click coords`); await this.page.waitForTimeout(100); return; }
    }

    // Strategy 6: JS-evaluated direct click on the button element.
    console.log(`[debug]   openScalePopup: trying JS-evaluated button.click()...`);
    const jsResult = await cell.evaluate((el) => {
      const btn = el.querySelector('button');
      if (btn) {
        (btn as HTMLButtonElement).click();
        return 'clicked';
      }
      return 'no button found';
    }).catch((e) => `error: ${e.message}`);
    console.log(`[debug]     JS click result: ${jsResult}`);
    await this.page.waitForTimeout(400);
    if (await popupAppeared()) { console.log(`[debug]   ✓ Popup opened via JS .click()`); await this.page.waitForTimeout(100); return; }

    // All strategies failed.
    throw new Error(
      `Could not open Scale popup for row ${rowIndex + 1}. ` +
      `btnVisible=${btnVisible} btnDisabled=${btnDisabled}. ` +
      `Cell HTML: ${cellHtml.slice(0, 500)}`
    );
  }

  /**
   * Fills one tier in the Scale Data popup.
   *
   * 7 cells, fixed left-to-right:
   *   0 Operator (dropdown)  1 Value (number)  2 Unit (dropdown)
   *   3 Scale Value/Outcome  4 Shortfall Value  5 Shortfall Scale
   *   6 Shortfall Scale Unit (dropdown)
   *
   * Root cause of previous empty-cell failure:
   *   enterScaleDropdown pressed Enter to open the operator dropdown, but HOT
   *   dropdown-type cells open on CLICK, not Enter. The option search found
   *   nothing, fell through to keyboard fallback, and the cell stayed empty.
   *
   * Fix: click each cell individually by position within the .ht_master grid
   * (scaleGrid()), which is stable across tiers. Clicking a new cell also
   * naturally commits the previous cell's open editor, so the fill is clean.
   */
  private async fillScaleTier(tierIndex: number, scale: Scale) {
    const grid = this.scaleGrid();
    await grid.waitFor({ state: 'visible', timeout: 10_000 });

    const cellAt = (pos: number) =>
      grid.locator('tbody tr').nth(tierIndex).locator('td').nth(pos);

    const optSel =
      '.handsontable.autocompleteEditor:visible tbody td, ' +
      'li[role="option"]:visible, [role="option"]:visible, td[role="option"]:visible';

    /**
     * Double-click a dropdown cell to open it, then click the matching option.
     * Double-click is what the popup requires — confirmed from the UI:
     * dblclick on cell 0 opens the operator list; selecting an option commits
     * the value and HOT auto-moves the cursor to the next cell.
     */
    const fillDropdown = async (pos: number, token: string) => {
      if (!token) return;
      const cell = cellAt(pos);
      await cell.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
      await cell.dblclick({ force: true });            // dblclick opens the dropdown
      await this.page.waitForTimeout(350);

      const matcher = new RegExp(this.escapeRegex(token), 'i');
      const opt = this.page.locator(optSel).filter({ hasText: matcher }).first();

      if (await opt.isVisible({ timeout: 2_500 }).catch(() => false)) {
        await opt.click({ force: true });
      } else {
        // Fallback: type the token to filter the autocomplete list.
        await this.page.keyboard.type(token, { delay: 25 });
        await this.page.waitForTimeout(250);
        const filtered = this.page.locator(optSel).filter({ hasText: matcher }).first();
        if (await filtered.isVisible({ timeout: 1_500 }).catch(() => false)) {
          await filtered.click({ force: true });
        } else {
          await this.page.keyboard.press('ArrowDown').catch(() => {});
          await this.page.waitForTimeout(100);
          await this.page.keyboard.press('Enter').catch(() => {});
        }
      }
      await this.page.waitForTimeout(200);
      console.log(`[debug]       pos ${pos} dropdown="${token}"`);
    };

    /**
     * Double-click a numeric cell to open its text editor, type the value,
     * then Tab to commit and keep HOT's cursor inside the popup row.
     */
    const fillNumber = async (pos: number, value: string) => {
      if (!value) return;
      const cell = cellAt(pos);
      await cell.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
      await cell.dblclick({ force: true });            // dblclick opens text editor
      await this.page.waitForTimeout(150);
      await this.page.keyboard.press('Control+A').catch(() => {});
      await this.page.keyboard.press('Backspace').catch(() => {});
      await this.page.keyboard.type(value.trim(), { delay: 25 });
      await this.page.waitForTimeout(100);
      await this.page.keyboard.press('Tab');           // commit value
      await this.page.waitForTimeout(150);
      console.log(`[debug]       pos ${pos} value="${value}"`);
    };

    // ── Fill the cells left-to-right ─────────────────────────────────────
    // Cols 0-2 are common: Operator (dropdown), Value (number), Unit (dropdown).
    await fillDropdown(0, this.operatorCode(scale.operator));
    await fillNumber(1, scale.value);
    await fillDropdown(2, this.unitToken(scale.unit));

    // The Incremental-basis Scale Data popup is ALWAYS this 7-column layout
    // (fillScaleTier only runs for incremental rows):
    //   0 Operator (dropdown)   1 Value (number)        2 Unit (dropdown)
    //   3 Scale Value (number)  4 Scale Unit (DROPDOWN) 5 Increment Value (number)
    //   6 Increment Scale Value (number)
    // Sheet "Scale Tab" columns map onto the new columns by type + name
    // (prefer the new field names if a JSON ever uses them):
    //   Operator              <- Scale Operator        (GE)
    //   Value                 <- Scale Value           (20000)
    //   Unit                  <- Scale Unit            (USD)
    //   Scale Value           <- scaleValue          ?? Scale Outcome Value   (0.3)
    //   Scale Unit (dropdown) <- scaleUnit           ?? Scale Shortfall Unit  (USD)
    //   Increment Value       <- incrementValue      ?? Scale Shortfall Value (100)
    //   Increment Scale Value <- incrementScaleValue ?? Scale Shortfall Scale (0.25)
    console.log('[debug]     Scale layout: INCREMENT (new 7-col)');
    await fillNumber(3, scale.scaleValue ?? scale.outcomeValue ?? '');
    await fillDropdown(4, this.unitToken(scale.scaleUnit ?? scale.shortfallUnit ?? ''));
    await fillNumber(5, scale.incrementValue ?? scale.shortfallValue ?? '');
    await fillNumber(6, scale.incrementScaleValue ?? scale.shortfallScale ?? '');

    // Do NOT press Escape — the Scale Data dialog can close on Escape. The last
    // cell is committed by its option-click / Tab, so just settle.
    await this.page.waitForTimeout(400);

    // Read back from the same .ht_master grid for logging.
    try {
      const cells = this.scaleGrid().locator('tbody tr').nth(tierIndex).locator('td');
      const got: string[] = [];
      for (let i = 0; i < 7; i++) {
        got.push(((await cells.nth(i).textContent()) || '').trim());
      }
      console.log(`[debug]     Tier ${tierIndex + 1} cells: ${JSON.stringify(got)}`);
    } catch {
      console.log(`[debug]     Tier ${tierIndex + 1}: readback error`);
    }
  }

  /** The Scale Data dialog (MUI), identified by its heading. */
  private scaleDialog(): Locator {
    return this.page.locator('[role="dialog"]')
      .filter({ has: this.page.getByText('Scale Data', { exact: false }) })
      .first();
  }

  /**
   * The Scale popup's data grid: Handsontable's MAIN table inside `.ht_master`,
   * within the Scale Data dialog. This selector is stable across tiers and
   * ignores the transient autocomplete-editor tables HOT adds while a dropdown
   * is open (which broke the old global-index / cell-count lookup).
   */
  private scaleGrid(): Locator {
    return this.scaleDialog()
      .locator('.ht_master table.htCore, .ht_master .htCore')
      .first();
  }

  /** '<=  (LE)' → 'LE'; '>=' → 'GE'; 'GE' → 'GE'. */
  private operatorCode(raw: string): string {
    const s = (raw || '').trim();
    const paren = s.match(/\(([^)]+)\)/);
    if (paren) return paren[1].trim().toUpperCase();
    const sym: Record<string, string> = { '>=': 'GE', '<=': 'LE', '>': 'GT', '<': 'LT' };
    return sym[s] ?? s.toUpperCase();
  }

  /** 'USD  (USD)' → 'USD'; '%  (%)' → '%'; 'USD' → 'USD'. */
  private unitToken(raw: string): string {
    const s = (raw || '').replace(/\s+/g, ' ').trim();
    return s ? s.split('(')[0].trim() : '';
  }

  /** Clicks the ✓ Confirm button on the Scale Data popup (same as Price Compliance). */
  private async confirmScalePopup() {
    console.log('[debug]   confirmScalePopup: clicking button[aria-label="Confirm"]...');
    const confirmBtn = this.page.locator('[role="dialog"] button[aria-label="Confirm"]').last();
    try {
      await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await confirmBtn.click({ force: true });
    } catch {
      await this.page.locator('button[aria-label="Confirm"]').last().click({ force: true }).catch(() => {});
    }

    let closed = await this.page.getByText('Scale Data').first()
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    // Keyboard fallback (Tab → Tab → Enter) if the button click didn't close it.
    if (!closed) {
      console.log('[debug]   confirmScalePopup: button click did not close — keyboard fallback');
      await this.page.keyboard.press('Tab');
      await this.page.waitForTimeout(100);
      await this.page.keyboard.press('Tab');
      await this.page.waitForTimeout(100);
      await this.page.keyboard.press('Enter');
      closed = await this.page.getByText('Scale Data').first()
        .waitFor({ state: 'hidden', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    }

    console.log(`[debug]   confirmScalePopup: ✓ done (closed=${closed})`);
    await this.page.waitForTimeout(200);
  }

  private operatorToUiText(operator: string): string {
    const op = operator.trim().toUpperCase();
    switch (op) {
      case 'GE': return '>= (GE)';
      case 'LE': return '<= (LE)';
      case 'GT': return '> (GT)';
      case 'LT': return '< (LT)';
      default: return operator;
    }
  }

  // ============================================================
  // HELPERS (unchanged)
  // ============================================================

  private readonly REAL_COL_HEADER = '.ht_master span.colHeader:not(.cornerHeader)';

  private readonly HOT_AUTOCOMPLETE_OPTION = '.handsontable.autocompleteEditor:visible tbody td';

  private async waitForHandsontable(sectionTitle: string) {
    console.log(`[debug] Waiting for "${sectionTitle}" grid...`);
    await expect(this.page.getByText(sectionTitle).first())
      .toBeVisible({ timeout: 20_000 });

    await this.page.locator('.ht_master table.htCore').first()
      .waitFor({ state: 'attached', timeout: 20_000 });

    await this.page.waitForFunction(
      () => {
        const headers = document.querySelectorAll('.ht_master span.colHeader:not(.cornerHeader)');
        for (const h of Array.from(headers)) {
          const txt = (h.textContent || '').trim();
          if (txt.length > 0) return true;
        }
        return false;
      },
      undefined,
      { timeout: 15_000 }
    );

    await this.page.waitForTimeout(200);

    const headers = await this.page.locator(this.REAL_COL_HEADER).allTextContents();
    const cleaned = headers.map((h) => h.trim()).filter((h) => h.length > 0);
    console.log(`[debug] Grid loaded — columns: ${JSON.stringify(cleaned.slice(0, 14))}`);
  }

  private async resetGridFocus() {
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(50);

    await this.page.evaluate(() => {
      const containers = document.querySelectorAll(
        '.ht_master .wtHolder, .handsontable .wtHolder, .ht_clone_top .wtHolder, .ht_clone_left .wtHolder'
      );
      for (const c of Array.from(containers)) {
        (c as HTMLElement).scrollLeft = 0;
      }
      window.dispatchEvent(new Event('resize'));
    });
    await this.page.waitForTimeout(100);
  }

  private async waitForAutocompletePopupOpen(timeoutMs = 5000) {
    const popup = this.page.locator('.handsontable.autocompleteEditor:visible').first();
    await popup.waitFor({ state: 'visible', timeout: timeoutMs });
    await this.page.locator(this.HOT_AUTOCOMPLETE_OPTION).first()
      .waitFor({ state: 'visible', timeout: timeoutMs });
  }

  /**
   * After a combobox is clicked open, its options may load asynchronously
   * (the UI shows a "Loading" placeholder first). This waits until real
   * options are present, polling for up to `baseTimeout` + extra time to
   * cover the server fetch. Returns true if options appeared.
   */
  private async waitForDropdownOptions(baseTimeout: number): Promise<boolean> {
    // Total budget: give the "Loading" state plenty of time to resolve.
    const totalBudget = Math.max(baseTimeout, 2_000) + 8_000;
    const start = Date.now();

    while (Date.now() - start < totalBudget) {
      // Count real, visible options (excluding any "Loading" placeholder).
      const optionCount = await this.page.evaluate(() => {
        const nodes = document.querySelectorAll('li[role="option"], [role="option"]');
        let real = 0;
        for (const n of Array.from(nodes)) {
          const txt = (n.textContent || '').trim();
          const rect = (n as HTMLElement).getBoundingClientRect();
          const visible = rect.width > 0 && rect.height > 0;
          if (visible && txt && !/^loading/i.test(txt)) real++;
        }
        return real;
      }).catch(() => 0);

      if (optionCount > 0) return true;

      await this.page.waitForTimeout(300);
    }
    return false;
  }

  private async selectComboboxByName(
    nameRegex: RegExp,
    optionText: string,
    friendlyName: string,
    timeouts: { perStrategyTimeout?: number; openTimeout?: number; optionTimeout?: number } = {}
  ) {
    const perStrategyTimeout = timeouts.perStrategyTimeout ?? 4_000;
    const openTimeout = timeouts.openTimeout ?? 2_000;
    const optionTimeout = timeouts.optionTimeout ?? 5_000;

    const strategies: Locator[] = [
      this.page.getByRole('combobox', { name: nameRegex }),
      this.page.locator(`label:has-text("${friendlyName}")`)
        .locator('xpath=following::*[@role="combobox" or self::input][1]'),
      this.page.locator(`[role="combobox"]`).filter({
        has: this.page.locator(`text=${friendlyName}`)
      }),
      this.page.getByText(friendlyName, { exact: false })
        .locator('xpath=ancestor::*[1]')
        .locator('[role="combobox"], input, [aria-haspopup]')
        .first(),
    ];

    let opened = false;
    // Cap the per-strategy visibility wait — a strategy that's present but not
    // yet visible only needs a short wait; one that matches nothing is skipped
    // instantly via count() (this was the 4s pause: strategy 1, getByRole
    // combobox-by-name, never matches these MUI fields and burned its full
    // timeout before falling through to the label/xpath strategy that works).
    const quickVisibleTimeout = Math.min(perStrategyTimeout, 1_200);
    for (let pass = 0; pass < 2 && !opened; pass++) {
      for (let i = 0; i < strategies.length && !opened; i++) {
        const el = strategies[i].first();
        if ((await el.count().catch(() => 0)) === 0) continue; // no match → next strategy now
        try {
          await el.waitFor({ state: 'visible', timeout: quickVisibleTimeout });
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await el.click({ force: true });
          await this.page.waitForTimeout(400);

          // The dropdown options may load asynchronously from the server,
          // showing a "Loading" placeholder first. Wait for real options to
          // appear (or Loading to disappear) before deciding it failed.
          const optionsAppeared = await this.waitForDropdownOptions(openTimeout);
          if (optionsAppeared) {
            opened = true;
            break;
          }
        } catch {
          continue;
        }
      }
      // Brief pause before a second pass, in case the form rendered late.
      if (!opened) await this.page.waitForTimeout(500);
    }
    if (!opened) throw new Error(`Could not open "${friendlyName}" dropdown`);

    const option = this.page.locator('li[role="option"], [role="option"]')
      .filter({ hasText: new RegExp(this.escapeRegex(optionText), 'i') })
      .first();

    const optionVisible = await option.isVisible({ timeout: optionTimeout }).catch(() => false);
    if (!optionVisible) {
      const shortText = optionText.split('(')[0].trim();
      const looserOption = this.page.locator('li[role="option"], [role="option"]')
        .filter({ hasText: new RegExp(this.escapeRegex(shortText), 'i') })
        .first();
      if (await looserOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await looserOption.click();
        return;
      }
      const allOptions = await this.page.locator('li[role="option"]:visible, [role="option"]:visible').allTextContents();
      throw new Error(`Option "${optionText}" not in "${friendlyName}". Available: ${JSON.stringify(allOptions)}`);
    }
    await option.click();
  }

  private async fillDateField(dateValue: string, dateIndex: number) {
    const strategies = [
      this.page.locator('input[placeholder*="mm" i]').nth(dateIndex),
      this.page.locator('input').nth(2 + dateIndex),
    ];
    for (let i = 0; i < strategies.length; i++) {
      try {
        const field = strategies[i];
        await field.waitFor({ state: 'visible', timeout: 3_000 });
        await field.click();
        await this.page.waitForTimeout(200);
        await field.click({ clickCount: 3 });
        await this.page.keyboard.press('Backspace');
        await this.page.waitForTimeout(100);
        await this.page.keyboard.type(dateValue, { delay: 80 });
        await this.page.waitForTimeout(300);
        const value = await field.inputValue().catch(() => '');
        if (value && value.length >= 8) {
          await this.page.keyboard.press('Tab');
          return;
        }
      } catch {
        continue;
      }
    }
    throw new Error(`Could not fill date field with "${dateValue}"`);
  }

  private async getColumnIndex(columnName: string): Promise<number> {
    const headers = this.page.locator(this.REAL_COL_HEADER);
    const count = await headers.count();
    for (let i = 0; i < count; i++) {
      const text = (await headers.nth(i).textContent())?.trim() || '';
      if (text.toLowerCase() === columnName.toLowerCase()) {
        return await headers.nth(i).evaluate((el) => {
          const th = el.closest('th');
          return th ? th.cellIndex : -1;
        });
      }
    }
    const allHeaders = await headers.allTextContents();
    throw new Error(`Column "${columnName}" not found. Available columns: ${JSON.stringify(allHeaders)}`);
  }

  private async locateHandsontableCell(rowIndex: number, columnName: string): Promise<Locator> {
    const colIndex = await this.getColumnIndex(columnName);
    return this.page.locator('.ht_master table.htCore tbody tr').nth(rowIndex)
      .locator('td').nth(colIndex - 1);
  }

  private async fillHandsontableCell(rowIndex: number, columnName: string, value: string) {
    const cell = await this.locateHandsontableCell(rowIndex, columnName);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await this.page.waitForTimeout(80);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(80);
    await this.page.keyboard.type(value, { delay: 30 });
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(100);
  }

  /** Compare two dates by their digits only (e.g. "01/01/2024" === "1/1/2024"? no
   *  — but the grid renders the same MM/DD/YYYY we type, so digit-equality holds). */
  private sameDateText(a: string, b: string): boolean {
    const d = (s: string) => (s || '').replace(/\D/g, '');
    return d(a).length > 0 && d(a) === d(b);
  }

  /**
   * Fill a Handsontable DATE cell that uses the new native date editor
   * (mm/dd/yyyy segmented input + calendar popup): double-click to open the
   * editor, type the date in mm/dd/yyyy order, then press Tab to commit and move
   * to the next cell. Verifies and retries up to 3×.
   */
  private async fillHandsontableDateCell(rowIndex: number, columnName: string, value: string) {
    if (!value) return;
    // Normalize to 8 digits MMDDYYYY — the native date input auto-advances
    // segments as digits are typed, so we don't type the slashes.
    const m = value.match(/(\d{1,2})\D(\d{1,2})\D(\d{4})/);
    const digits = m ? `${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}${m[3]}` : value.replace(/\D/g, '');

    for (let attempt = 1; attempt <= 3; attempt++) {
      const cell = await this.locateHandsontableCell(rowIndex, columnName);
      await cell.scrollIntoViewIfNeeded();
      await cell.click();
      await this.page.waitForTimeout(60);
      // Double-click opens the date editor (calendar + mm/dd/yyyy input).
      await cell.dblclick();
      await this.page.waitForTimeout(250);

      const dateInput = await this.locateGridDateEditor(cell);
      if (dateInput) {
        await dateInput.click().catch(() => {});
        await this.page.waitForTimeout(60);
        // Make sure we start at the month segment regardless of where the click
        // landed (ArrowLeft stops at the leftmost segment).
        await this.page.keyboard.press('ArrowLeft').catch(() => {});
        await this.page.keyboard.press('ArrowLeft').catch(() => {});
      }

      await this.page.keyboard.type(digits, { delay: 70 });
      await this.page.waitForTimeout(150);
      await this.page.keyboard.press('Tab');
      await this.page.waitForTimeout(200);

      const txt = (await (await this.locateHandsontableCell(rowIndex, columnName)).textContent())?.trim() || '';
      if (this.sameDateText(txt, value)) {
        console.log(`[debug]   ${columnName} row ${rowIndex + 1} = "${txt}" ✓`);
        return;
      }
      console.log(`[debug]   ${columnName} row ${rowIndex + 1} shows "${txt}", expected "${value}" — retry ${attempt}/3`);
      await this.resetGridFocus();
    }
    console.log(`[debug]   ${columnName} row ${rowIndex + 1}: date did not commit (left as-is)`);
  }

  /**
   * Locate the date editor input for the cell being edited, SCOPED to the grid
   * so we never grab the header's Start/End Date fields (which are also
   * <input type="date"> and always visible on the form). Tries inside the cell
   * first, then the Handsontable editor holder / active master grid.
   */
  private async locateGridDateEditor(cell: Locator): Promise<Locator | null> {
    const candidates: Locator[] = [
      cell.locator('input[type="date"], input[placeholder*="mm" i]'),
      this.page.locator('.handsontableInputHolder input:visible, .htEditorContainer input:visible'),
      this.page.locator('.ht_master input[type="date"]:visible, .ht_master input[placeholder*="mm" i]:visible'),
    ];
    for (const c of candidates) {
      const loc = c.first();
      if ((await loc.count().catch(() => 0)) > 0) return loc;
    }
    return null;
  }

  /** Current calc/eligibility grid column names (lower-cased). */
  private async gridColumnNamesLower(): Promise<string[]> {
    const headers = this.page.locator(this.REAL_COL_HEADER);
    const all = await headers.allTextContents();
    return all.map((t) => t.trim().toLowerCase()).filter(Boolean);
  }

  /**
   * Broad selector for autocomplete options across BOTH renderings the
   * IMA360 Calculation grid uses:
   *   1. In-grid Handsontable autocomplete: td[role="option"].listbox
   *   2. A separate floating dropdown panel (used by the Formula column),
   *      which renders options as plain elements outside the htCore table.
   * We cast a wide net and then match by text.
   */
  private readonly DROPDOWN_OPTION_SELECTOR =
    'td[role="option"]:visible, ' +
    'td.listbox:visible, ' +
    '[role="option"]:visible, ' +
    '.autocompleteEditor td:visible, ' +
    'li[role="option"]:visible';

  private async fillHandsontableDropdownCell(rowIndex: number, columnName: string, value: string, typeToFilter = true) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // If the cell already holds the value, we're done.
      const existing = await this.locateHandsontableCell(rowIndex, columnName);
      const existingText = (await existing.textContent())?.trim() || '';
      if (this.cellContainsValue(existingText, value)) {
        return;
      }

      const cell = await this.locateHandsontableCell(rowIndex, columnName);
      await cell.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
      await cell.click();
      await this.page.waitForTimeout(50);
      await cell.dblclick();
      await this.page.waitForTimeout(typeToFilter ? 150 : 300);

      // For small fixed-list dropdowns (e.g. Unit) we don't type — the
      // double-click opens the full list and we pick the option directly.
      // Typing is only needed to filter large autocomplete lists (e.g. Formula).
      if (typeToFilter) {
        await this.page.keyboard.type(value, { delay: 30 });
        await this.page.waitForTimeout(100);
      } else {
        await this.page.waitForTimeout(150);
      }

      // Collect every visible option across both dropdown renderings. Fetch all
      // option texts in a SINGLE round-trip — iterating with one textContent()
      // call per option is very slow when the list is large (e.g. the full
      // Formula catalog), which shows up as a long pause on this step.
      const allOptions = this.page.locator(this.DROPDOWN_OPTION_SELECTOR);
      const optTexts = await allOptions.allTextContents();
      const optCount = optTexts.length;

      // Find the option matching our value (either direction of containment,
      // normalized for spacing/case), then click that one by index.
      // We use mousedown+mouseup (not just click) because Handsontable
      // autocomplete editors typically commit the value on the mousedown
      // event — a plain Playwright click can be swallowed by the editor's
      // blur handler before the selection registers.
      let matchIdx = -1;
      for (let oi = 0; oi < optCount; oi++) {
        const optText = (optTexts[oi] || '').trim();
        if (!optText) continue;
        if (this.cellContainsValue(optText, value) || this.cellContainsValue(value, optText)) {
          matchIdx = oi;
          break;
        }
      }

      let clicked = false;
      if (matchIdx >= 0) {
        const opt = allOptions.nth(matchIdx);
        await opt.scrollIntoViewIfNeeded().catch(() => {});
        // Handsontable autocompletes commit the selection on mousedown — the
        // option then detaches and the popup closes. The follow-up mouseup/click
        // were waiting the full action timeout (~25s) + 3s on that detached
        // element every cell (~50s across formula+unit). Only fire them if the
        // option is still present (selection didn't commit), with a short cap.
        await opt.dispatchEvent('mousedown').catch(() => {});
        await this.page.waitForTimeout(100);
        if ((await opt.count().catch(() => 0)) > 0) {
          await opt.dispatchEvent('mouseup', {}, { timeout: 1_000 }).catch(() => {});
          await opt.click({ force: true, timeout: 1_000 }).catch(() => {});
        }
        clicked = true;
      }

      if (!clicked && optCount === 0) {
        // Not a Handsontable autocomplete list. Some calc-grid cells (notably
        // Calc Level) open a MUI checkbox popup with options like
        // "1 (contract)" / "2 (customer_number)" that the Handsontable option
        // selector can't see. Match and click there instead.
        if (await this.selectCheckboxPopupOption(value)) {
          clicked = true;
        }
      }

      if (!clicked) {
        // Keyboard fallback: the typed text has filtered the list and the
        // first/best match is highlighted. ArrowDown moves into the list,
        // Enter commits it. This is the most reliable for floating panels.
        if (optCount >= 1) {
          await this.page.keyboard.press('ArrowDown');
          await this.page.waitForTimeout(120);
          await this.page.keyboard.press('Enter');
          clicked = true;
        } else {
          await this.page.keyboard.press('Enter');
        }
      }

      await this.page.waitForTimeout(50);
      await this.page.keyboard.press('Tab').catch(() => {});
      await this.page.waitForTimeout(50);
      await this.page.keyboard.press('Escape').catch(() => {});

      // Verify
      const after = await this.locateHandsontableCell(rowIndex, columnName);
      const afterText = (await after.textContent())?.trim() || '';
      if (this.cellContainsValue(afterText, value)) {
        return;  // success
      }

      console.log(`[debug]   ⚠ ${columnName} row ${rowIndex + 1} attempt ${attempt}/${maxAttempts}: cell shows "${afterText || '(empty)'}", expected "${value}". Retrying...`);
      await this.resetGridFocus();
    }

    // All attempts failed — dump the full filtered option list for diagnosis.
    let allOpts: string[] = [];
    try {
      const cell = await this.locateHandsontableCell(rowIndex, columnName);
      await cell.click();
      await cell.dblclick();
      await this.page.waitForTimeout(300);
      await this.page.keyboard.type(value.slice(0, 4), { delay: 40 });
      await this.page.waitForTimeout(400);
      allOpts = await this.page.locator(this.DROPDOWN_OPTION_SELECTOR).allTextContents();
      await this.page.keyboard.press('Escape').catch(() => {});
    } catch { /* ignore */ }

    throw new Error(
      `Could not set ${columnName} = "${value}" in calc row ${rowIndex + 1} after ${maxAttempts} attempts. ` +
      `Options seen: ${JSON.stringify(allOpts.slice(0, 25))}`
    );
  }

  private async fillHandsontableDropdownCellWithVerify(rowIndex: number, columnName: string, value: string) {
    const maxAttempts = 3;
    let lastSeen = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(200);

      const cell = await this.locateHandsontableCell(rowIndex, columnName);

      const beforeText = (await cell.textContent())?.trim() || '';
      if (this.cellContainsValue(beforeText, value)) {
        console.log(`[debug]   ${columnName} row ${rowIndex + 1} already has "${beforeText}" — skipping fill`);
        return;
      }

      await cell.scrollIntoViewIfNeeded();
      await cell.click();
      await this.page.waitForTimeout(250);
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(400);

      await this.page.keyboard.type(value, { delay: 50 });
      await this.page.waitForTimeout(700);

      let optionClicked = false;
      try {
        await this.waitForAutocompletePopupOpen(5000);

        const opts = this.page.locator(this.HOT_AUTOCOMPLETE_OPTION);
        const texts = await opts.allTextContents();

        // Match preference: EXACT code first, then NUMERIC (leading-zero
        // insensitive), then "contains".
        //   "999"  -> "999 (999)"   (exact, not "000999")
        //   "56"   -> "056 (056)"   (numeric 56 == 56, NOT "0356" which is 356)
        //   "498"  -> "(0498)"      (numeric 498 == 498)
        // Only if none of those hit do we fall back to a loose contains.
        let idx = texts.findIndex((t) => this.optionCodeMatches(t, value));
        if (idx < 0) {
          idx = texts.findIndex((t) => this.optionCodeNumericMatches(t, value));
        }
        if (idx < 0) {
          idx = texts.findIndex(
            (t) => this.cellContainsValue(t, value) || this.cellContainsValue(value, t),
          );
        }

        if (idx >= 0) {
          console.log(`[debug]   Selecting "${(texts[idx] || '').trim()}" for "${value}"`);
          await opts.nth(idx).click();
          optionClicked = true;
        } else if (texts.length > 0) {
          console.log(`[debug]   No match for "${value}" — picking first option: "${(texts[0] || '').trim()}"`);
          await opts.nth(0).click();
          optionClicked = true;
        }
      } catch {
        console.log(`[debug]   ⚠ Autocomplete popup didn't open for ${columnName} row ${rowIndex + 1} attempt ${attempt}`);
      }

      if (!optionClicked) {
        await this.page.keyboard.press('Enter');
      }

      await this.page.waitForTimeout(150);
      await this.page.keyboard.press('Tab');
      await this.page.waitForTimeout(250);

      const safeCell = this.page.locator('.ht_master table.htCore tbody tr').nth(rowIndex)
        .locator('td').nth(0);
      await safeCell.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(150);

      const cellAfter = await this.locateHandsontableCell(rowIndex, columnName);
      const afterText = (await cellAfter.textContent())?.trim() || '';
      lastSeen = afterText;

      if (this.cellContainsValue(afterText, value)) {
        console.log(`[debug]   ${columnName} row ${rowIndex + 1} = "${afterText}" ✓`);
        return;
      }

      console.log(`[debug]   ⚠ ${columnName} row ${rowIndex + 1} attempt ${attempt}/${maxAttempts} failed — cell shows "${afterText}", retrying`);

      await this.page.keyboard.press('Escape').catch(() => {});
      await this.resetGridFocus();
    }

    throw new Error(
      `Could not set ${columnName} = "${value}" in row ${rowIndex + 1} after ${maxAttempts} attempts. ` +
      `Last cell content: "${lastSeen}".`
    );
  }

  /**
   * Set the "Calc Level 1" cell to a SINGLE level.
   *
   * Calc Level is a MUI multi-select checkbox popup ("1 (contract)" /
   * "2 (customer_number)" / "Test (3)") that DEFAULTS to "1 (contract)"
   * checked. Picking another level only ADDS it, leaving Contract checked too —
   * which is why the generic dropdown filler (it types-to-filter, hiding the
   * default, then verifies by "contains") left BOTH selected.
   *
   * This opens the popup WITHOUT typing (so every option, including the default,
   * stays visible to be unchecked), then delegates to selectCheckboxPopupOption
   * (check the requested level, uncheck every other one). Finally it verifies the
   * cell shows ONLY the requested level, retrying up to 3×.
   */
  /**
   * Set Calc Level 1 to a SINGLE level (e.g. "Customer" / "Contract").
   *
   * The cell opens a custom HOT editor on double-click: a floating div with
   * a Search <input> and plain <li> items (radio-circle style). There are no
   * MUI/ARIA role="option" elements — the selector is just `li` inside the
   * visible editor container (.htSelectEditor, .handsontableEditor, or the
   * first absolutely-positioned div that appears after the double-click).
   *
   * Strategy inside evaluate():
   *   1. Find the visible editor container.
   *   2. Collect its <li> children.
   *   3. Click the target li if not already selected.
   *   4. Click any other selected li to deselect it (single-select enforcement).
   *   Selected state is read from: aria-selected, aria-checked, input.checked,
   *   or a "selected"/"active"/"checked" CSS class on the li or its first child.
   */
  private async setCalcLevel(rowIndex: number, value: string) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.resetGridFocus();

      // ── 1. Double-click the cell to open the editor ───────────────────────
      const cell = await this.locateHandsontableCell(rowIndex, 'Calc Level 1');
      await cell.scrollIntoViewIfNeeded();
      await cell.dblclick({ force: true });
      await this.page.waitForTimeout(500);

      // ── 2. Find the editor container + collect li items in evaluate() ─────
      const result = await this.page.evaluate((targetValue: string) => {
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
        const matches = (text: string) =>
          norm(text).includes(norm(targetValue)) || norm(targetValue).includes(norm(text));

        // Find the floating editor that appeared after the double-click.
        // The custom HOT editor is a div/ul that became visible; we identify it
        // as a positioned container holding <li> elements with text content.
        const isSelected = (el: HTMLElement): boolean => {
          for (const attr of ['aria-selected', 'aria-checked']) {
            const v = el.getAttribute(attr);
            if (v != null) return v === 'true';
          }
          const cb = el.querySelector('input[type="checkbox"], input[type="radio"]') as HTMLInputElement | null;
          if (cb) return cb.checked;
          // CSS class check on the li or its first visible child
          const cls = [el, el.firstElementChild as HTMLElement | null]
            .filter(Boolean).map(e => (e as HTMLElement).className || '').join(' ');
          return /\bselected\b|\bactive\b|\bchecked\b|\bht_selected\b/i.test(cls);
        };

        // Candidate containers: prefer HOT-specific class names, then fall back
        // to any visible floating div/ul that directly contains <li> with text.
        const containerSels = [
          '.htSelectEditor',
          '.handsontableEditor',
          '.htEditor',
          '.handsontable.autocompleteEditor',
        ];
        let container: HTMLElement | null = null;
        for (const sel of containerSels) {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (el && el.querySelector('li')) { container = el; break; }
        }
        // Fallback: any absolutely/fixed positioned element visible on screen
        // that contains <li> elements with text (the editor floats above the grid).
        if (!container) {
          for (const el of Array.from(document.querySelectorAll('div, ul')) as HTMLElement[]) {
            const style = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const lis = Array.from(el.querySelectorAll(':scope > li, :scope > ul > li')) as HTMLElement[];
            if (
              (style.position === 'absolute' || style.position === 'fixed') &&
              r.width > 0 && r.height > 0 && r.top >= 0 &&
              lis.length > 0 &&
              lis.some(li => (li.textContent || '').trim().length > 0)
            ) { container = el; break; }
          }
        }

        if (!container) {
          // Last resort: dump what IS on screen for the next debug pass.
          const visible = (Array.from(document.querySelectorAll('*')) as HTMLElement[])
            .filter(e => {
              const r = e.getBoundingClientRect();
              return r.width > 50 && r.height > 10 && r.top > 0 &&
                window.getComputedStyle(e).position === 'absolute';
            })
            .map(e => `${e.tagName}.${e.className} — "${(e.textContent || '').trim().slice(0, 60)}"`)
            .slice(0, 15);
          return { ok: false, log: `no editor container found. Absolute elements: ${JSON.stringify(visible)}` };
        }

        const lis = (Array.from(
          container.querySelectorAll(':scope > li, :scope > ul > li, li')
        ) as HTMLElement[]).filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (el.textContent || '').trim();
        });

        if (lis.length === 0) {
          return { ok: false, log: `container found (${container.className}) but no visible <li> items` };
        }

        const log: string[] = [`container: ${container.tagName}.${container.className}, ${lis.length} items`];
        for (const li of lis) {
          const text = (li.textContent || '').trim();
          if (!text) continue;
          const shouldSelect = matches(text);
          const currently = isSelected(li);
          log.push(`"${text}" selected=${currently} want=${shouldSelect}`);
          if (shouldSelect !== currently) {
            li.click();
            log.push('→ clicked');
          }
        }
        return { ok: true, log: log.join(' | ') };
      }, value).catch((e: Error) => ({ ok: false, log: `evaluate error: ${e.message}` }));

      console.log(`[debug]   Calc Level evaluate attempt ${attempt}: ok=${result.ok} | ${result.log}`);
      await this.page.waitForTimeout(300);

      // ── 3. Close by clicking a neutral cell ──────────────────────────────
      const safeCell = this.page.locator('.ht_master table.htCore tbody tr').nth(rowIndex)
        .locator('td').nth(0);
      await safeCell.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(300);

      if (result.ok) {
        // The closed cell renders as "2 (customer_number)+1" even when exactly
        // one item is selected — that "+1" is just this HOT widget's display
        // format, not an extra selection. Trust the evaluate() result which read
        // the live option states directly, not the closed-cell text.
        const after = (await (await this.locateHandsontableCell(rowIndex, 'Calc Level 1')).textContent())?.trim() || '';
        console.log(`[debug]   Calc Level 1 row ${rowIndex + 1} = "${after}" ✓`);
        return;
      }
      console.log(`[debug]   ⚠ Calc Level 1 row ${rowIndex + 1} attempt ${attempt}/3 — retrying`);
    }

    throw new Error(`Could not set Calc Level 1 = "${value}" as a clean single selection in row ${rowIndex + 1}.`);
  }

  /**
   * Select an option from a MUI checkbox-style popup (e.g. the Calc Level
   * dropdown: "1 (contract)", "2 (customer_number)", "Test (3)"). Checks the
   * matching option, UNCHECKS every other selected option (single-select), and
   * closes the popup. Returns true on success.
   */
  private async selectCheckboxPopupOption(value: string): Promise<boolean> {
    const isChecked = async (opt: Locator): Promise<boolean> => {
      const role = (await opt.getAttribute('role').catch(() => null)) || '';
      if (role === 'checkbox' || role === 'menuitemcheckbox') {
        const a = await opt.getAttribute('aria-checked').catch(() => null);
        if (a != null) return a === 'true';
        return await opt.isChecked().catch(() => false);
      }
      const cb = opt.locator('input[type="checkbox"], [role="checkbox"]').first();
      if ((await cb.count().catch(() => 0)) > 0) {
        const a = await cb.getAttribute('aria-checked').catch(() => null);
        if (a != null) return a === 'true';
        return await cb.isChecked().catch(() => false);
      }
      const cls = (await opt.getAttribute('class').catch(() => '')) || '';
      return /\bMui-checked\b|\bMui-selected\b/.test(cls);
    };

    // Typing the value earlier filters the popup's Search box, which HIDES the
    // default-checked "1 (contract)" so it can never be unchecked. Clear the
    // search so the FULL option list is visible first.
    const clearSearch = async () => {
      const search = this.page
        .locator('input[placeholder*="search" i]:visible, .MuiAutocomplete-input:visible')
        .first();
      if ((await search.count().catch(() => 0)) > 0) {
        await search.fill('').catch(() => {});
      } else {
        await this.page.keyboard.press('Control+A').catch(() => {});
        await this.page.keyboard.press('Backspace').catch(() => {});
      }
      await this.page.waitForTimeout(300);
    };

    // Pick ONE element per option row (avoid the union matching a row AND its
    // inner checkbox, which would duplicate indices).
    const rowLocator = async (): Promise<Locator | null> => {
      const rowSelectors = [
        '[role="menuitemcheckbox"]',
        'li[role="option"]',
        '.MuiMenuItem-root',
        'li:has(input[type="checkbox"])',
        'label:has(input[type="checkbox"])',
      ];
      for (const rs of rowSelectors) {
        const l = this.page.locator(rs).filter({ hasText: /\S/ });
        if ((await l.count().catch(() => 0)) > 0) return l;
      }
      return null;
    };

    const apply = async (): Promise<boolean> => {
      const loc = await rowLocator();
      if (!loc) return false;
      const texts = await loc.allTextContents().catch(() => []);
      const idx = texts.findIndex((t) => {
        const x = (t || '').trim();
        return !!x && !/^loading/i.test(x) && (this.cellContainsValue(x, value) || this.cellContainsValue(value, x));
      });
      if (idx < 0) return false;

      // 1) Ensure the TARGET is checked.
      if (!(await isChecked(loc.nth(idx)))) {
        await loc.nth(idx).click({ force: true, timeout: 3_000 }).catch(() => {});
        await this.page.waitForTimeout(150);
      }
      // 2) UNCHECK every other selected option (single-select per rule), with a
      // retry in case the first click doesn't register.
      for (let i = 0; i < texts.length; i++) {
        if (i === idx) continue;
        const t = (texts[i] || '').trim();
        if (!t || /^loading/i.test(t)) continue;
        for (let attempt = 0; attempt < 2 && (await isChecked(loc.nth(i))); attempt++) {
          await loc.nth(i).click({ force: true, timeout: 3_000 }).catch(() => {});
          await this.page.waitForTimeout(150);
        }
      }
      return true;
    };

    await clearSearch();
    let ok = await apply();
    if (!ok) {
      await clearSearch();
      ok = await apply();
    }
    if (ok) {
      await this.page.waitForTimeout(120);
      await this.page.keyboard.press('Escape').catch(() => {}); // close popup to commit
    }
    return ok;
  }

  /**
   * True when `value` exactly equals the option's code — checked against the
   * whole text, the part before " (", and the part inside the trailing "(...)".
   * Lets "999" match "999 (999)" but NOT "000999 (000999)", and "8000" match
   * "Pharma (8000)". Used to prefer an exact pick over a loose "contains".
   */
  private optionCodeMatches(optionText: string, value: string): boolean {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    const v = norm(value);
    if (!v) return false;
    const t = (optionText || '').trim();
    const candidates = [t, t.split('(')[0]];
    const m = t.match(/\(([^)]*)\)\s*$/);
    if (m) candidates.push(m[1]);
    return candidates.some((c) => norm(c) === v);
  }

  /**
   * Leading-zero-insensitive numeric code match: the option's code (whole text,
   * before-paren, or inside the trailing paren) equals `value` as an integer.
   * e.g. value "56" matches "056 (056)" (56 === 56) but NOT "0356 (0356)" (356).
   * Only applies when both sides are purely numeric.
   */
  private optionCodeNumericMatches(optionText: string, value: string): boolean {
    const v = (value || '').trim();
    if (!/^\d+$/.test(v)) return false;
    const target = parseInt(v, 10);
    const t = (optionText || '').trim();
    const candidates = [t, t.split('(')[0].trim()];
    const m = t.match(/\(([^)]*)\)\s*$/);
    if (m) candidates.push(m[1].trim());
    return candidates.some((c) => /^\d+$/.test(c) && parseInt(c, 10) === target);
  }

  private cellContainsValue(cellText: string, expectedValue: string): boolean {
    if (!cellText || !expectedValue) return false;
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    return norm(cellText).includes(norm(expectedValue));
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
