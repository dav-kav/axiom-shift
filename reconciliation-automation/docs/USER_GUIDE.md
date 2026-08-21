# Bank Reconciliation Parser — User Guide
**Wander Boutique Hotel** | Axiom Shift

---

## How It Works

Each time you run the parser, it processes your BAC bank statement in two stages:

**Stage 1 — Load**
Reads the ACH batch detailed CSV into an internal lookup table, keyed by transaction amount.

**Stage 2 — Classify**
For each transaction in the BAC statement:
- **Credits** → classified by amount threshold (tour sale vs. restaurant revenue)
- **Card sales** (VisaNet / Neonet / Acepta) → Restaurant/Bar Sales
- **Cash deposits** → Cash Deposit
- **ACH debits** → matched to the detailed ACH lookup by amount
- **Anything unmatched** → sent to the Unclassified Log for manual review

---

## Step 1 — Prepare Your CSV Files

**BAC Statement Export**
1. Log in to BAC Guatemala online banking
2. Export the account statement as CSV
3. Open the file — delete any rows above the actual transaction data
4. Keep the header row — the parser reads it

**ACH Detailed Batch Export** *(recommended)*
1. Export the detailed ACH batch report from BAC
2. Confirm it includes `Monto` (amount) and `Concepto` (description) columns
3. Save as CSV

> **Tip:** Both files should cover the same date range. The parser matches statement debits to detailed records by amount — matching works best when the date ranges align.

---

## Step 2 — Paste Data Into the Import Tabs

Open the Google Sheet.

**`Import - Statement` tab:**
- Paste the BAC statement CSV starting at **row 3**
- Row 1 = sheet title, Row 2 = CSV header, data begins at Row 3

**`Import - Detailed` tab:**
- Paste the ACH batch detailed CSV starting at **row 3**
- Leave empty if no detailed report is available — the parser still runs

---

## Step 3 — Run the Parser

Click **🔄 Parser → Run on Import Tabs**

A summary alert appears when complete showing:
- Total transactions processed
- How many were auto-classified
- How many went to the Unclassified Log
- How many detailed ACH records were loaded

---

## Step 4 — Review QB Upload

Open the **`QB Upload`** tab.

| Column | Contains |
|---|---|
| A | Transaction date (YYYY-MM-DD) |
| B | QB description — what to enter in QuickBooks |
| C | Amount (negative = debit, positive = credit) |
| D | Rule ID that matched the transaction |
| E | Raw BAC description |

**Columns A through C** are your QuickBooks upload.

To export: select A–C → File → Download → CSV

---

## Step 5 — Handle Unclassified Transactions

Open the **`Unclassified Log`** tab.

These are transactions the parser couldn't match automatically.

For each row:
1. Review the raw BAC description (Column B) and amount
2. Determine the correct QuickBooks category
3. Enter it directly in the QB Upload tab

> **If transactions keep appearing unclassified**, note the raw description and amount and send them to your Axiom Shift consultant — a new classification rule may be needed.

---

## Active Classification Rules

The `Classification Rules` tab (created on first run) shows all active rules. Current v3 rules:

**Amount-Based Rules (Credits)**
- DEPOSITO EN EFECTIVO under Q1,500 → Tour Sale
- DEPOSITO EN EFECTIVO Q1,500 or more → Restaurant and Bar Sales
- CREDITO ACH under Q1,500 → Tour Sale
- CREDITO ACH Q1,500 or more → Bank Transfer
- CREDITO RECEPTOR ACH under Q1,500 → Tour Sale
- CREDITO RECEPTOR ACH Q1,500 or more → Bank Transfer

**Description Pattern Rules**
- VisaNet / Neonet / Acepta → Restaurant/Bar Sales
- DEPOSITO EN EFECTIVO → Cash Deposit
- TRANSFERENCIA DE FONDOS BC → Transfer Between Accounts
- DEBITO ACH → matched via detailed ACH lookup
- Pago de Empresa Electrica → Electric Bill
- DECLARAGUATE TESORERIA NAC. → Taxes
- ND x Rechazos → Fee for Returned Check

---

## Clearing and Re-Running

To start fresh without re-uploading data:

Click **🔄 Parser → Clear QB Upload**

This clears the output and log tabs. Import tabs are preserved.

---

## Exporting QB Upload Directly

Click **🔄 Parser → Download QB Upload as CSV**

A file named `qb_upload.csv` saves to your Google Drive root folder.

---

## Questions or Issues?

Contact your Axiom Shift consultant with:
- The raw BAC description of the problem transaction
- The amount and date
- Any error messages received
