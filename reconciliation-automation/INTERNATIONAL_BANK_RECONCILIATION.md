# International Bank Reconciliation — Google Sheets Automation
# Wander Boutique Hotel — Bank Reconciliation Automation

> Supersedes: GSHEETS_DESIGN.md (old single-tab design)

---

## Overview

Client downloads two separate files from the bank each period:
1. **Statement CSV** — the standard BAC account export with all transactions
2. **Detailed ACH CSV** — the per-transaction enriched descriptions (with batch IDs, authorization dates, and the actual Concepto/description for each debit)

Goal: she pastes both into a Google Sheet → clicks a button → gets QB-ready output → drags into QuickBooks.

**Data stays in Google Drive at all times.** Already her ecosystem.

---

## Sheet Structure

**4 tabs:**

### Tab 1: "Import - Statement"
- Client pastes raw BAC export CSV here (columns as-is: Month, Fecha, Referencia, Descripción, Débito, Crédito, Saldo, Agencia, Notes)
- Data starts at row 3 (row 2 is the header row with column names)
- Parser reads FROM this tab

### Tab 2: "Import - Detailed"
- Client pastes the ACH batch detailed export CSV here
- Expected columns: Lote, Concepto, <skip>, Monto (at minimum)
- Header at row 2, data at row 3+
- Parser builds an amount→Concepto lookup from this tab and applies it to matching debits in the statement

### Tab 3: "QB Upload" (Output)
- Parser writes classified output here: Date, Description, Amount, Rule Applied, Raw Descripcion, Notes
- QB drag-drop-ready — she can select columns 1–3 and drag directly into QB
- Also includes a summary (via alert after parsing): total transactions, total income, total expenses, unclassified count

### Tab 4: "Unclassified Log" (Error handling)
- Any rows the parser can't classify land here automatically
- She can review them, manually fill in the Description, then move them to QB Upload herself
- This is the feedback loop: every time she does this, she tells David what pattern was missing

---

## Debit Matching Logic

**How the two files link:** Statement `Débito` amount = Detailed `Monto` amount (matched by exact amount, rounded to 2 decimal places).

For each debit row in the statement:
1. Look up the amount in the detailed lookup table
2. If found → use the `Concepto` value as the QB description
3. If not found → fall back to ACH sub-type classification (employee name patterns in `Notels`, etc.)

---

## Apps Script Design

**File: `Parser.gs`** — contains the full parser logic, ported from `parser.py`

**Category map updates:**
- Hardcoded in Apps Script for now (not editable by client)
- When client finds a new pattern that doesn't classify → she sends David the raw description → David adds the rule → republishes the script

**Runtime:** Apps Script has a 6-minute hard limit. Parsing is trivial in <1 second. No issue.

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

## What to Build (Priority Order)

1. **Google Sheet with 4 tabs** (Import - Statement, Import - Detailed, QB Upload, Unclassified Log)
2. **Apps Script with `parseImportTab()`** — full parser logic ported to JS with two-tab support
3. **Custom menu button** — "Parser → Run on Import Tabs"
4. **CSV export function** — downloads QB Upload as CSV
5. **Share the sheet with client** — set her as owner
6. **First test run** — send her the CSV, she pastes it in, verifies output

---

## Technical Notes

- **BAC CSV format confirmed:** `Month, Fecha, Referencia, Descripción, Débito, Crédito, Saldo, Agencia, Notes`
  - **Débito and Crédito are both POSITIVE numbers** (separate columns). Net = Crédito - Débito.
- **Detailed ACH format (CSV export):** `Lote, Concepto, Cuenta, Monto, Etapa actual, Autorización, ...`
- **Detailed XLS (original):** Same data in Excel format. Client can export as CSV from Excel.
- Parser must handle: quotes, commas as thousands separators, empty Notels, missing months in some rows
- QB import format: `Date, Description, Amount` (negative = expense, positive = income)
- Google Sheets row limit: 10 million cells — no practical concern for transaction data
- Apps Script `HtmlService` not needed — pure spreadsheet logic is sufficient

---

## Change Log

- **2026-07-05:** v2 — Added two-tab import support. Parser now reads "Import - Statement" + "Import - Detailed" separately. Fixed sign bug (net = credit - debit, not credit + debit). New Apps Script emailed to David.
- **2026-07-03:** Client emailed sample data. Statement (Jan 2026 CSV) + Detailed (Jul 2026 XLS) received and analyzed.
