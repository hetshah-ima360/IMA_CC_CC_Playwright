import { Page, Locator } from '@playwright/test';

export interface SimulationInput {
  contractType: string;       // e.g. "Standard Commitment - 01 (IMA_CC_CM_01)"
  commitmentNumber: string;   // numeric id, e.g. "537"
  calcPeriodFrom: string;     // MM/DD/YYYY
  calcPeriodTo: string;       // MM/DD/YYYY
}

export interface SimulationResult {
  commitmentNumber: string;       // grid "Commitment Number" e.g. "CALC TEST (671)"
  calcStartDate: string;          // Calculation Start Date (the input period)
  calcEndDate: string;            // Calculation End Date (the input period)
  formula1: string;               // grid "Commitment Metrics (Formula 1)"
  actualValue1: string;           // grid "Actual Value(1)"
  commitmentValue1: string;       // grid "Commitment Value(1)"
  commitmentMet: string;          // grid "Commitment Met" (Yes/No)
  penaltyValue: string;           // grid "Penalty Value" (blank if no such column)
  status: string;                 // OK | EMPTY | NO_RESULT
}

/**
 * Commitment Metrics > Calculation Simulation.
 *
 * Layout (from the app): a "Calculation Data" section with a Calculation Period
 * (two date inputs) and a "Contract Selection" section with Contract Type
 * (single-select), Commitment Number (multi-select with checkbox options like
 * "SG Test 2-61447 (537)"), Group and Subgroup. Each field has an "Equal"
 * operator select to its left which we skip.
 */
export class CalculationSimulationPage {
  readonly page: Page;
  private period = { from: '', to: '' };

  constructor(page: Page) {
    this.page = page;
  }

  async runSimulation(input: SimulationInput) {
    console.log('[debug] Calculation Simulation page loaded');
    await this.setCalculationPeriod(input.calcPeriodFrom, input.calcPeriodTo);
    await this.setContractType(input.contractType);
    await this.setCommitmentNumber(input.commitmentNumber);
    await this.run();
  }

  // ---- Calculation Period -------------------------------------------------

  async setCalculationPeriod(from: string, to: string) {
    console.log(`[debug] Calculation Period: ${from} -> ${to}`);
    this.period = { from, to };
    await this.fillDate(from, 0);
    await this.fillDate(to, 1);
  }

  private async fillDate(value: string, index: number) {
    const candidates: Locator[] = [
      this.page.locator('input[placeholder*="mm" i]').nth(index),
      this.page.locator('input[placeholder*="dd" i]').nth(index),
      this.page.locator('input[placeholder*="yyyy" i]').nth(index),
    ];
    for (const field of candidates) {
      if (!(await field.isVisible({ timeout: 2_000 }).catch(() => false))) continue;
      await field.click();
      await field.click({ clickCount: 3 });
      await this.page.keyboard.press('Backspace');
      await this.page.waitForTimeout(100);
      await this.page.keyboard.type(value, { delay: 60 });
      await this.page.waitForTimeout(200);
      const v = await field.inputValue().catch(() => '');
      if (v && v.replace(/\D/g, '').length >= 8) {
        await this.page.keyboard.press('Tab');
        return;
      }
    }
    console.log(`[debug] WARN could not confirm date input ${index} = "${value}"`);
  }

  // ---- Contract Type (single-select) -------------------------------------

  async setContractType(text: string) {
    console.log(`[debug] Contract Type = "${text}"`);
    const code = (text.match(/\(([^)]+)\)\s*$/) || [])[1] || '';

    const matchers: RegExp[] = [this.flexibleMatcher(text)];
    if (code) {
      matchers.push(new RegExp('\\(\\s*' + this.escapeRegex(code) + '\\s*\\)', 'i'));
      matchers.push(new RegExp(this.escapeRegex(code), 'i'));
    }

    // Candidate value controls (most specific first). Each row is
    // <label> <"Equal" operator> <value control>, so we try the control after
    // the operator, the 2nd interactive control after the label, the first real
    // input, and the first combobox — opening each and verifying it's the real
    // Contract Type list (not the operator's equal/not-equal list).
    const xp = (s: string) =>
      this.page.locator(`xpath=//*[normalize-space(text())="Contract Type"]${s}`).first();
    const candidates: Locator[] = [
      this.valueControl('Contract Type'),
      xp('/following::*[@role="combobox" or @aria-haspopup="listbox" or @aria-haspopup="true"][2]'),
      xp('/following::input[not(@aria-hidden="true") and not(@tabindex="-1")][1]'),
      xp('/following::*[@role="combobox" or @aria-haspopup="listbox"][1]'),
    ];

    for (let ci = 0; ci < candidates.length; ci++) {
      const ctrl = candidates[ci];
      if (!(await ctrl.isVisible({ timeout: 3_000 }).catch(() => false))) continue;
      await ctrl.scrollIntoViewIfNeeded().catch(() => {});

      // Already set?
      const current = ((await ctrl.textContent().catch(() => '')) || '').trim();
      if (current && (current.includes(text) || (code && current.includes(code)))) {
        console.log(`[debug]   Contract Type already set to "${current}"`);
        return;
      }

      await ctrl.click().catch(() => {});
      await this.waitForOptions();
      const opts = await this.visibleOptionTexts();

      // If we opened the "Equal" operator (or nothing), this is the wrong
      // control — close and try the next candidate.
      const isOperator = opts.length > 0 && opts.every((o) => /^(equal|not\s*equal)$/i.test(o));
      if (opts.length === 0 || isOperator) {
        console.log(`[debug]   candidate ${ci} opened ${opts.length ? 'operator' : 'nothing'} ${JSON.stringify(opts)} — next`);
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.page.waitForTimeout(200);
        continue;
      }

      console.log(`[debug]   Contract Type options: ${JSON.stringify(opts.slice(0, 20))}`);
      for (const m of matchers) {
        if (await this.clickOption(m, false)) return;
      }
      if (opts.length === 1) {
        console.log(`[debug]   clicking the only option "${opts[0]}"`);
        const only = this.page
          .locator('[role="option"], [role="menuitemcheckbox"], .MuiMenuItem-root, .MuiAutocomplete-option')
          .filter({ hasText: /\S/ }).first();
        await only.click({ force: true }).catch(() => {});
        return;
      }
      await this.page.keyboard.press('Escape').catch(() => {});
    }

    throw new Error(`Contract Type option "${text}" not found`);
  }

  /** Visible dropdown option texts (real options only — excludes breadcrumb/nav). */
  private async visibleOptionTexts(): Promise<string[]> {
    return this.page.evaluate(() => {
      const nodes = document.querySelectorAll(
        '[role="option"], [role="menuitemcheckbox"], .MuiMenuItem-root, .MuiAutocomplete-option',
      );
      const out: string[] = [];
      for (const n of Array.from(nodes)) {
        const r = (n as HTMLElement).getBoundingClientRect();
        const t = (n.textContent || '').trim();
        if (r.width > 0 && r.height > 0 && t && !/^loading/i.test(t)) out.push(t);
      }
      return out;
    }).catch(() => []);
  }

  // ---- Commitment Number (multi-select with checkboxes) ------------------

  async setCommitmentNumber(id: string) {
    console.log(`[debug] Commitment Number = "${id}"`);
    const input = this.commitmentNumberInput();
    await input.waitFor({ state: 'visible', timeout: 15_000 });
    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.click();
    await this.page.waitForTimeout(400);
    await input.fill('').catch(() => {});
    await this.page.keyboard.type(String(id), { delay: 60 });
    await this.waitForOptions(); // list loads asynchronously after typing
    await this.page.waitForTimeout(300);

    // Options look like "SG Test 2-61447 (537)"; match on the bracketed id so
    // we don't accidentally match a description that merely contains the digits.
    const matcher = new RegExp('\\(\\s*' + this.escapeRegex(String(id)) + '\\s*\\)', 'i');
    if (!(await this.clickOption(matcher, true))) {
      const seen = await this.page
        .locator('[role="option"], [role="checkbox"], label, li')
        .filter({ hasText: /\S/ })
        .allTextContents()
        .catch(() => []);
      console.log(`[debug] Commitment Number options seen: ${JSON.stringify(seen.slice(0, 40))}`);
      throw new Error(`Commitment Number option "(${id})" not found`);
    }
    await this.page.keyboard.press('Escape').catch(() => {}); // close popup so Run enables
    await this.page.waitForTimeout(300);
  }

  // ---- Run ----------------------------------------------------------------

  async run() {
    console.log('[debug] Clicking Run...');
    const btn = this.page.getByRole('button', { name: /^(run|simulate|calculate|execute)$/i }).first();
    await btn.waitFor({ state: 'visible', timeout: 15_000 });
    await btn.click();
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await this.page.waitForTimeout(1_500);
    console.log('[debug] Run clicked — simulation submitted');
  }

  // ---- Results ------------------------------------------------------------

  /**
   * Read the simulation result from the results grid (the page shown right
   * after Run). The grid has ONE data row and scrolls horizontally, so for each
   * wanted column we scroll its header into view and read the cell directly
   * below it (aligned by x, at the data row's y). Calc Start/End come from the
   * period that was entered.
   */
  /**
   * Read EVERY row in the results grid (one row per formula). Returns one
   * SimulationResult per row; an empty/failed grid returns a single NO_RESULT.
   */
  async readResults(): Promise<SimulationResult[]> {
    const noResult: SimulationResult = {
      commitmentNumber: '', calcStartDate: this.period.from, calcEndDate: this.period.to,
      formula1: '', actualValue1: '', commitmentValue1: '', commitmentMet: '', penaltyValue: '', status: 'NO_RESULT',
    };

    // The simulation computes server-side then navigates to the results grid.
    await this.page.waitForURL(/results(-analysis)?/i, { timeout: 180_000 }).catch(() => {});

    // Poll (up to 180s) for a leftmost, grid-only header. "Actual Value(1)" sits
    // mid-grid and can be virtualized/clipped, so we anchor on the left columns.
    const anchorRe = /calculation frequency|commitment metrics \(formula 1\)|internal description|actual value/i;
    let gridReady = false;
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      gridReady = await this.page.getByText(anchorRe).first().isVisible().catch(() => false);
      if (gridReady) break;
      await this.page.waitForTimeout(2_000);
    }

    if (!gridReady) {
      // Dump what header-like text IS on the page so we can fix the anchor.
      const headers = await this.page
        .evaluate(() => {
          const out: string[] = [];
          document
            .querySelectorAll('[role="columnheader"], th, .ag-header-cell-text, [class*="header"], [class*="colHeader"]')
            .forEach((el) => {
              const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
              if (t && t.length < 50) out.push(t);
            });
          return Array.from(new Set(out)).slice(0, 50);
        })
        .catch(() => []);
      console.log(`[debug] Results grid not detected. url=${this.page.url()}`);
      console.log(`[debug] Header-like texts seen: ${JSON.stringify(headers)}`);
      return [noResult];
    }

    // Let the results page fully render all rows before capturing.
    await this.page.waitForTimeout(3_000);

    const rowYs = await this.detailRowCenterYs();
    if (rowYs.length === 0) {
      console.log('[debug] No result data rows found.');
      return [noResult];
    }
    console.log(`[debug] Result rows detected: ${rowYs.length}`);

    // (SimulationResult key, grid header) for each column we capture.
    const columns: Array<[keyof SimulationResult, string]> = [
      ['commitmentNumber', 'Commitment Number'],
      ['formula1', 'Commitment Metrics (Formula 1)'],
      ['actualValue1', 'Actual Value(1)'],
      ['commitmentValue1', 'Commitment Value(1)'],
      ['commitmentMet', 'Commitment Met'],
      ['penaltyValue', 'Penalty Value'],
    ];

    const rows: SimulationResult[] = rowYs.map(() => ({
      commitmentNumber: '', calcStartDate: this.period.from, calcEndDate: this.period.to,
      formula1: '', actualValue1: '', commitmentValue1: '', commitmentMet: '', penaltyValue: '', status: 'OK',
    }));

    // For each column scroll its header into view ONCE, then read every row's
    // cell beneath it (header center x, each row's y). Columns virtualize, so
    // scrolling per column is what brings the right cells into the DOM.
    for (const [key, header] of columns) {
      const cx = await this.headerCenterX(header);
      if (cx < 0) {
        console.log(`[debug]   ${header}: header not found`);
        continue;
      }
      for (let i = 0; i < rowYs.length; i++) {
        const v = await this.readCellAt(cx, rowYs[i]);
        (rows[i] as unknown as Record<string, string>)[key as string] = v;
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!(r.formula1 || r.actualValue1 || r.commitmentValue1)) r.status = 'EMPTY';
      console.log(`[debug] Row ${i + 1}: ${JSON.stringify(r)}`);
    }
    return rows;
  }

  /** Vertical centers of ALL data rows (the rows below the filter row). */
  private async detailRowCenterYs(): Promise<number[]> {
    // Scroll grids fully left so leftmost cells render.
    await this.page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll('*')) as HTMLElement[]) {
        if (el.scrollWidth > el.clientWidth + 40) el.scrollLeft = 0;
      }
    }).catch(() => {});
    await this.page.waitForTimeout(300);

    return this.page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[role="row"], tr')) as HTMLElement[];
      // Bottom of the filter row ("Contains"/"Equals"); data rows sit below it.
      let filterBottom = -1;
      for (const el of rows) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && /contains|equals/i.test(el.textContent || '')) {
          filterBottom = Math.max(filterBottom, r.bottom);
        }
      }
      const centers: number[] = [];
      for (const el of rows) {
        const r = el.getBoundingClientRect();
        const t = (el.textContent || '').trim();
        if (
          r.width > 200 && r.height > 0 && r.height < 120 &&
          r.top >= filterBottom - 2 && /\d/.test(t) && !/contains|equals/i.test(t)
        ) {
          const c = Math.round(r.top + r.height / 2);
          if (!centers.some((y) => Math.abs(y - c) < 12)) centers.push(c);
        }
      }
      centers.sort((a, b) => a - b);
      return centers;
    });
  }

  /** Scroll a column header into view and return its center x (or -1). */
  private async headerCenterX(headerText: string): Promise<number> {
    let header = this.page.getByText(headerText, { exact: true }).last();
    if ((await header.count().catch(() => 0)) === 0) {
      header = this.page.getByText(headerText, { exact: false }).last();
    }
    if ((await header.count().catch(() => 0)) === 0) return -1;
    // Scroll to it even if it's currently off-screen (column virtualization),
    // then read its box.
    await header.scrollIntoViewIfNeeded().catch(() => {});
    await this.page.waitForTimeout(350);
    const hb = await header.boundingBox().catch(() => null);
    return hb ? Math.round(hb.x + hb.width / 2) : -1;
  }

  /** Read the grid cell at a point (column header x, row y). */
  private async readCellAt(cx: number, rowY: number): Promise<string> {
    return this.page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!el) return '';
        let node: HTMLElement | null = el;
        for (let i = 0; i < 5 && node; i++) {
          const role = node.getAttribute && node.getAttribute('role');
          const cls = (node.className && node.className.toString()) || '';
          if (role === 'gridcell' || role === 'cell' || node.tagName === 'TD' || /(^|\s)(ag-cell|cell|td)/i.test(cls)) {
            break;
          }
          node = node.parentElement;
        }
        return ((node || el).textContent || '').trim().replace(/\s+/g, ' ');
      },
      { x: cx, y: rowY },
    ).catch(() => '');
  }

  // ---- helpers ------------------------------------------------------------

  /**
   * The value control for a labelled field. Each row is laid out as
   *   <label>  <"Equal" operator select>  <value control>
   * so we anchor to the row's "Equal" operator and take the next combobox/input
   * after it — otherwise we'd grab the operator itself (whose options are
   * "equal"/"not equal").
   */
  private valueControl(label: string): Locator {
    return this.page
      .locator(
        `xpath=//*[normalize-space(text())="${label}"]` +
        `/following::*[normalize-space(text())="Equal"][1]` +
        `/following::*[@role="combobox" or @aria-haspopup="listbox" or @aria-haspopup="true" or self::input or self::button][1]`,
      )
      .first();
  }

  /** The typeable search input of the Commitment Number multi-select. */
  private commitmentNumberInput(): Locator {
    return this.page
      .locator(
        'xpath=//*[normalize-space(text())="Commitment Number"]/following::input' +
        '[not(@aria-hidden="true") and not(@tabindex="-1")][1]',
      )
      .first();
  }

  /**
   * CM dropdowns fetch their options from the server and briefly show a
   * "Loading" placeholder. Poll until at least one real (non-Loading) option is
   * visible, or the budget elapses.
   */
  private async waitForOptions(budgetMs = 12_000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < budgetMs) {
      const count = await this.page.evaluate(() => {
        const nodes = document.querySelectorAll(
          '[role="option"], [role="checkbox"], li[role="option"], .MuiMenuItem-root, li',
        );
        let real = 0;
        for (const n of Array.from(nodes)) {
          const txt = (n.textContent || '').trim();
          const r = (n as HTMLElement).getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && txt && !/^loading/i.test(txt)) real++;
        }
        return real;
      }).catch(() => 0);
      if (count > 0) {
        await this.page.waitForTimeout(250);
        return true;
      }
      await this.page.waitForTimeout(300);
    }
    return false;
  }

  /**
   * Find and click a dropdown option using several strategies (role=option,
   * MUI checkbox lists, plain rows). For checkbox/multi-select options it only
   * clicks when not already checked and closes the popup afterwards.
   */
  private async clickOption(matcher: RegExp, isMultiselect: boolean): Promise<boolean> {
    const candidates: Locator[] = [
      this.page.getByRole('option', { name: matcher }),
      this.page.getByRole('checkbox', { name: matcher }),
      this.page.locator('li[role="option"], [role="option"], label, li').filter({ hasText: matcher }),
      this.page.getByText(matcher),
    ];

    for (const cand of candidates) {
      const opt = cand.first();
      if (!(await opt.isVisible({ timeout: 1_500 }).catch(() => false))) continue;

      const selfRole = (await opt.getAttribute('role').catch(() => null)) || '';
      const innerCb = opt.locator('input[type="checkbox"], [role="checkbox"]').first();
      const hasInnerCb = (await innerCb.count().catch(() => 0)) > 0;
      const isCheckbox = selfRole === 'checkbox' || hasInnerCb;

      let checked = false;
      if (selfRole === 'checkbox') checked = await opt.isChecked().catch(() => false);
      else if (hasInnerCb) checked = await innerCb.isChecked().catch(() => false);

      if (!checked) {
        await opt.click({ timeout: 3_000 }).catch(async () => {
          await opt.click({ force: true, timeout: 3_000 }).catch(() => {});
        });
      }
      if (isMultiselect || isCheckbox) {
        await this.page.waitForTimeout(150);
        await this.page.keyboard.press('Escape').catch(() => {});
      }
      return true;
    }
    return false;
  }

  private escapeRegex(s: string): string {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Build a matcher that tolerates differing whitespace runs in the option text. */
  private flexibleMatcher(text: string): RegExp {
    const esc = this.escapeRegex(text).replace(/\s+/g, '\\s+');
    return new RegExp(esc, 'i');
  }
}
