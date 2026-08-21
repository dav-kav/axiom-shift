# Google Sheets Handoff Architecture
# Wander Boutique Hotel — Bank Reconciliation Automation

## Overview

Goal: client-owned Google Sheet she controls. No third-party servers, no CLI, no technical knowledge required. She pastes raw BAC CSV → clicks a button → gets QB-ready output → drags into QuickBooks.

**Data stays in Google Drive at all times.** Already her ecosystem.

---

## Sheet Structure

**3 tabs:**

### Tab 1: "Import" (Raw BAC CSV)
- Client pastes raw BAC export CSV here (columns as-is: Month, Fecha, Referencia, Descripción, Débito, Crédito, Saldo, Agencia, Notels)
- Instructions in row 1 as a header note
- Parser reads FROM this tab

### Tab 2: "QB Upload" (Output)
- Parser writes classified output here: Date, Description, Amount
- QB drag-drop-ready — she can select all and drag directly into QB
- Column headers match QuickBooks import expectations exactly
- Also includes a summary: total transactions, total income, total expenses, unclassified count

### Tab 3: "Unclassified Log" (Error handling)
- Any rows the parser can't classify land here automatically
- She can review them, manually fill in the Description, then move them to QB Upload herself
- This is the feedback loop: every time she does this, she tells David what pattern was missing

---

## Apps Script Design

**File: `Parser.gs`** — contains the full parser logic, ported from `parser.py`

**File: `CategoryMap.gs`** — contains the `category_map.json` as a JS object (no external file reads, keeps it self-contained)

**File: `Parser.gs` functions:**
- `onOpen()` — adds custom menu: "Parser → Run on Import"
- `parseImportTab()` — reads Import tab, classifies rows, writes to QB Upload + Unclassified Log
- `exportQBUploadAsCSV()` — triggers a CSV download of QB Upload tab
- `addToCategoryMap(pattern, description)` — helper to extend the map (for David to call manually)

**Category map updates:**
- Hardcoded in Apps Script for now (not editable by client)
- When client finds a new pattern that doesn't classify → she sends David the raw description → David adds the rule → republishes the script
- Future: category map as a separate sheet tab she can edit directly (lower priority)

**Runtime:** Apps Script has a 6-minute hard limit. Parsing 364–2000 rows is trivial in <1 second. No issue.

---

## Security Model

| Concern | How we handle it |
|---------|----------------|
| Client owns the data | Sheet lives in client's Drive from day 1 |
| David can access it | Shared as viewer/editor with David's email |
| No third-party exposure | All processing is Google-side (Apps Script runs on Google's servers, data never leaves Drive) |
| No API keys in code | Uses the client's OAuth (already configured in Drive) |
| Category map IP | Hardcoded for now; updates require David to touch the script |
| Raw CSV in shared Drive | David's email has viewer access only — she can turn off sharing if she wants |

---

## Handoff Flow

1. David creates the sheet in his Drive via API (using client's OAuth)
2. Shares with client as owner (transfer ownership to her email)
3. Client opens → sees Import tab with clear instructions
4. She pastes her BAC CSV → clicks "Parser → Run on Import"
5. QB Upload tab populates → she selects the data → drags into QuickBooks
6. If unclassified rows exist → she sees them in Unclassified Log and contacts David with the details

**Alternative handoff if she needs to own it from creation:**
- David creates the Drive folder, shares it with her
- She creates the sheet inside the shared folder
- She adds David as editor
- She then emails David the sheet URL after pasting CSV → David triggers the parse via API call

---

## What to Build (Priority Order)

1. **Google Sheet with 3 tabs** (Import, QB Upload, Unclassified Log)
2. **Apps Script with `parseImportTab()`** — full parser logic ported to JS
3. **Custom menu button** — "Parser → Run on Import"
4. **CSV export function** — downloads QB Upload as CSV
5. **Share the sheet with client** — set her as owner
6. **First test run** — send her the CSV, she pastes it in, verifies output

---

## Technical Notes

- BAC CSV format confirmed: `Month, Fecha, Referencia, Descripción, Débito, Crédito, Saldo, Agencia, Notels`
- Parser must handle: quotes, commas as thousands separators, empty Notels, missing months in some rows
- QB import format: `Date, Description, Amount` (negative = expense, positive = income)
- Google Sheets row limit: 10 million cells — no practical concern for transaction data
- Apps Script `HtmlService` not needed — pure spreadsheet logic is sufficient

---

## What the client never sees or needs to know

- Python code
- JSON category maps
- API integrations
- Git history
- Parsing logic

**Client UX:** Open sheet → paste data → click button → copy results → done.
