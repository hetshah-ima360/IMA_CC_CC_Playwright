# IMA360 Platform - Commitment Metrics Playwright Suite

JSON-driven Playwright automation for Commitment Metrics contract setup on the
IMA360 Platform. Each **scenario** is one JSON file holding one or more
contracts, plus one spec that creates them. Run a scenario by running its spec.

## Folder structure

```
ima360-cm-playwright/
├── pages/                          # Page Objects (reusable UI layer)
│   ├── LoginPage.ts
│   ├── AppLauncherPage.ts
│   └── CommitmentMetricsPage.ts
├── data/                           # one JSON file per scenario
│   └── HS_CC_Standard_Commitments.json
├── tests/
│   └── commitment-metrics/         # one spec per scenario
│       └── HS_CC_Standard_Commitments.spec.ts
├── utils/
│   ├── types.ts                    # Contract / ContractHeader / GridRow / Scale / Scenario
│   └── commitmentRunner.ts         # shared login + create-contract flow
├── playwright.config.ts
├── tsconfig.json                   # @pages / @data / @utils aliases
├── package.json
└── .env                            # IMA360_USERNAME / IMA360_PASSWORD (not committed)
```

## How a scenario works

A scenario JSON looks like:

```jsonc
{
  "scenario": "HS_CC_Standard_Commitments",
  "description": "...",
  "contracts": [
    { "description": "HS_CC_02", "header": { ... }, "rows": [ ... ], "calcLevel": "contract", "approvalStatus": "New" },
    { "description": "HS_CC_03", ... },
    { "description": "HS_CC_04", ... }
  ]
}
```

The matching spec imports that JSON, logs in **once**, and creates each contract
in turn (reusing the same browser session, navigating back to the Commitment
Metrics list between contracts). Each contract becomes its own Playwright test,
so you get a pass/fail per contract.

- `header` — General tab fields (commitment type, dates, source data, frequency, group/subgroup/origin).
- `rows[]` — each row is an Eligibility row + the matching Calculation row.
- A row with `incrementalBasis: true` and a non-empty `scales[]` fills the Scale
  Data popup (operator/value/unit, outcome scale value, shortfall value/scale/unit).

## Running

```bash
cp .env.example .env        # fill in IMA360_USERNAME / IMA360_PASSWORD
npm install
npx playwright install chromium
```

Run one scenario (all its contracts):

```bash
npx playwright test HS_CC_Standard_Commitments --headed
```

Run a single contract within a scenario:

```bash
npx playwright test --headed -g "Create HS_CC_03"
```

Other: `npm test` (all scenarios), `npm run test:ui` (interactive), `npm run report`.

## Adding a scenario

1. Add `data/<ScenarioName>.json` with a `scenario` name and a `contracts` array.
2. Add `tests/commitment-metrics/<ScenarioName>.spec.ts` — copy an existing spec
   and change the one import line to your JSON. The shared runner
   (`utils/commitmentRunner.ts`) does the rest.

To add another contract to an existing scenario, just append it to that file's
`contracts` array — no code change needed.

## Path aliases

`tsconfig.json` maps `@pages/*`, `@data/*`, `@utils/*`. The specs use relative
imports (which always resolve); aliases are available for new code.
