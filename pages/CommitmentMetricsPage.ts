import { Page, expect, Locator } from '@playwright/test';
import { Contract, GridRow, Scale } from '../utils/types';

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
    await this.selectComboboxByName(/^group$/i, h.group, 'Group');
    await this.selectComboboxByName(/contract subgroup/i, h.contractSubgroup, 'Contract Subgroup');
    await this.selectComboboxByName(/^origin$/i, h.origin, 'Origin');
    console.log('[debug] General tab done');
  }

  async fillEligibilityRows(contract: Contract) {
    console.log(`[debug] Filling ${contract.rows.length} Eligibility row(s)...`);
    await this.waitForHandsontable('Eligibility Rules');

    for (let i = 0; i < contract.rows.length; i++) {
      const r = contract.rows[i];

      if (!r.salesOrg) {
        throw new Error(`Row ${i + 1}: Sales Org is missing in Excel.`);
      }

      console.log(`[debug] Eligibility row ${i + 1}/${contract.rows.length}: salesOrg=${r.salesOrg}, customer=${r.customerNumber}`);

      await this.resetGridFocus();

      await this.fillHandsontableCell(i, 'Valid From', r.validFrom);
      await this.fillHandsontableCell(i, 'Valid To', r.validTo);
      await this.fillHandsontableDropdownCellWithVerify(i, 'Sales Org', r.salesOrg);

      if (r.customerNumber) {
        await this.fillHandsontableDropdownCellWithVerify(i, 'Customer Number', r.customerNumber);
      }
    }

    console.log('[debug] All Eligibility rows done');
  }

  async validateEligibility() {
    const validateButton = this.page.getByRole('button', { name: /validate/i })
      .or(this.page.locator('button[aria-label*="validate" i]')).first();
    await validateButton.click();
    await expect(this.page.locator('text=/data validated successfully/i').first())
      .toBeVisible({ timeout: 20_000 });
    console.log('[debug] Validated successfully');
  }

  async fillCalculationRows(contract: Contract) {
    console.log(`[debug] Filling ${contract.rows.length} Calculation row(s)...`);
    await this.waitForHandsontable('Calculation Rules');

    for (let i = 0; i < contract.rows.length; i++) {
      const r = contract.rows[i];
      console.log(`[debug] Calculation row ${i + 1}/${contract.rows.length}: formula=${r.formulaId}, value=${r.value}${r.unit}`);

      await this.resetGridFocus();

      await this.fillHandsontableDropdownCell(i, 'Formula 1', r.formulaId);
      await this.logCalcCell(i, 'Formula 1');
      await this.fillHandsontableDropdownCell(i, 'Calc Level 1', contract.calcLevel);
      await this.logCalcCell(i, 'Calc Level 1');
      await this.fillHandsontableDropdownCell(i, 'Operator', r.operator);
      await this.logCalcCell(i, 'Operator');
      await this.fillHandsontableDropdownCell(i, 'Value Type', r.valueType);
      await this.logCalcCell(i, 'Value Type');
      await this.fillHandsontableCell(i, 'Value', r.value);
      await this.logCalcCell(i, 'Value');
      await this.fillHandsontableDropdownCell(i, 'Unit', r.unit);
      await this.logCalcCell(i, 'Unit');
      await this.fillHandsontableCell(i, 'Start Date', r.validFrom);
      await this.fillHandsontableCell(i, 'End Date', r.validTo);

      // Incremental Basis + Scales (NEW)
      // We only enable Incremental Basis when there is actual scale data to
      // enter. Enabling the toggle WITHOUT providing scales puts IMA360 into
      // an invalid state ("uses scales" but none defined), which fails on
      // save. So a row flagged Incremental Basis = TRUE but with no scale
      // rows is treated as a no-op for the toggle.
      if (r.incrementalBasis && r.scales.length > 0) {
        console.log(`[debug] Calc row ${i + 1}: Incremental Basis = TRUE with ${r.scales.length} scale(s)`);
        await this.enableIncrementalBasis(i);
        await this.fillScales(i, r.scales);
      } else if (r.incrementalBasis && r.scales.length === 0) {
        console.log(`[debug] Calc row ${i + 1}: Incremental Basis = TRUE but NO scale data — skipping toggle (would fail validation). Add scale data in Excel or set Incremental Basis = FALSE.`);
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

    // ── Fill the 7 cells left-to-right ────────────────────────────────────
    // Dropdown (0, 2, 6): dblclick → list appears → click option.
    // Number   (1, 3, 4, 5): dblclick → type → Tab to commit.

    await fillDropdown(0, this.operatorCode(scale.operator));
    await fillNumber(1, scale.value);
    await fillDropdown(2, this.unitToken(scale.unit));
    await fillNumber(3, scale.outcomeValue);
    await fillNumber(4, scale.shortfallValue);
    await fillNumber(5, scale.shortfallScale);
    await fillDropdown(6, this.unitToken(scale.shortfallUnit));

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
    for (let i = 0; i < strategies.length; i++) {
      try {
        const el = strategies[i].first();
        await el.waitFor({ state: 'visible', timeout: perStrategyTimeout });
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await el.click({ force: true });
        await this.page.waitForTimeout(500);

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

  private async fillHandsontableDropdownCell(rowIndex: number, columnName: string, value: string) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // If the cell already holds the value, we're done.
      const existing = await this.locateHandsontableCell(rowIndex, columnName);
      const existingText = (await existing.textContent())?.trim() || '';
      if (this.cellContainsValue(existingText, value)) {
        return;
      }

      const cell = await this.locateHandsontableCell(rowIndex, columnName);
      await cell.scrollIntoViewIfNeeded();
      await cell.click();
      await this.page.waitForTimeout(50);
      await cell.dblclick();
      await this.page.waitForTimeout(150);

      await this.page.keyboard.type(value, { delay: 30 });
      await this.page.waitForTimeout(100);

      // Collect every visible option across both dropdown renderings.
      const allOptions = this.page.locator(this.DROPDOWN_OPTION_SELECTOR);
      const optCount = await allOptions.count();

      // Find and click the option matching our value (either direction of
      // containment, normalized for spacing/case).
      // We use mousedown+mouseup (not just click) because Handsontable
      // autocomplete editors typically commit the value on the mousedown
      // event — a plain Playwright click can be swallowed by the editor's
      // blur handler before the selection registers.
      let clicked = false;
      for (let oi = 0; oi < optCount; oi++) {
        const opt = allOptions.nth(oi);
        const optText = (await opt.textContent())?.trim() || '';
        if (!optText) continue;
        if (this.cellContainsValue(optText, value) || this.cellContainsValue(value, optText)) {
          try {
            // Dispatch mousedown explicitly, then click — covers both commit models.
            await opt.scrollIntoViewIfNeeded().catch(() => {});
            await opt.dispatchEvent('mousedown').catch(() => {});
            await this.page.waitForTimeout(100);
            await opt.dispatchEvent('mouseup').catch(() => {});
            await opt.click({ force: true, timeout: 3_000 }).catch(() => {});
            clicked = true;
            break;
          } catch {
            // try keyboard fallback below
          }
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

        const matchingOption = this.page
          .locator(this.HOT_AUTOCOMPLETE_OPTION)
          .filter({ hasText: new RegExp(this.escapeRegex(value), 'i') })
          .first();

        const visible = await matchingOption.isVisible({ timeout: 3_000 }).catch(() => false);
        if (visible) {
          await matchingOption.click();
          optionClicked = true;
        } else {
          const firstOption = this.page.locator(this.HOT_AUTOCOMPLETE_OPTION).first();
          if (await firstOption.isVisible({ timeout: 1_000 }).catch(() => false)) {
            const optText = await firstOption.textContent();
            console.log(`[debug]   No exact "${value}" — picking first option: "${optText?.trim()}"`);
            await firstOption.click();
            optionClicked = true;
          }
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

  private cellContainsValue(cellText: string, expectedValue: string): boolean {
    if (!cellText || !expectedValue) return false;
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    return norm(cellText).includes(norm(expectedValue));
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
