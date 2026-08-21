# Wander Boutique Hotel — Parser User Guide

**Client:** Wander Boutique Hotel
**Email:** wanderboutiquehotel@gmail.com
**Prepared by:** Axiom Shift
**Document Type:** User Guide
**Version:** 1.0

---

## What You're Getting

A custom Google Apps Script attached to your Google Sheet that reads your BAC bank statement and automatically categorizes each transaction — lodging, food & beverage, utilities, transfers, and more — based on the merchant description and amount.

The script runs inside your Google Sheet. You paste your data in, click a button, and the categorized output is ready to download.

---

## How It Works

```
You paste your BAC statement CSV into the "Import - Statement" tab
        ↓
(Optional) Paste detailed ACH batch CSV into "Import - Detailed" tab
        ↓
You click "▶️ Run on Import Tabs" from the Parser menu
        ↓
Script reads and classifies every row
        ↓
You download the QB Upload tab as a CSV file
        ↓
Import the CSV into QuickBooks
```

---

## Sheet Tabs — What Each One Does

| Tab | What it's for |
|---|---|
| **Import - Statement** | Paste your raw BAC bank statement CSV here (all columns) |
| **Import - Detailed** | Paste your detailed ACH batch CSV here if you have one — this enriches debit descriptions. Skip this tab if you only have the main statement. |
| **QB Upload** | Output tab. After running the parser, this contains the categorized, QB-ready data. |
| **Unclassified Log** | Any rows the script couldn't categorize are logged here for review. |

---

## Step-by-Step Instructions

### Step 1 — Open Your Google Sheet

Open the Google Sheet shared with you by Axiom Shift. Make sure you are logged in with the Google account that has access.

> If you don't have the sheet link anymore, contact David at Axiom Shift.

---

### Step 2 — Paste Your BAC Statement CSV

**In the "Import - Statement" tab:**

1. Click on cell **A1** of that tab
2. Paste your raw BAC CSV export (all columns including Fecha, Descripción, Débito, Crédito, etc.)
3. The header row should be in row 1 — the script reads data starting from row 3

> **Important:** Do not add or remove columns. Paste the full raw export including all original columns. The script reads specific column positions.

---

### Step 3 — (Optional) Paste Your Detailed ACH CSV

If you have a separate detailed ACH batch file (with columns like Lote, Concepto, Monto):

1. Go to the **"Import - Detailed"** tab
2. Paste the detailed CSV starting at row 1 (with headers)

This step is optional. If you skip it, debits that can't be matched will go into the Unclassified Log.

---

### Step 4 — Run the Parser

1. At the top of your Google Sheet, look for the **🔄 Parser** menu
2. Click **▶️ Run on Import Tabs**
3. Wait a moment — a popup will appear with the classification results

The popup will tell you:
- How many rows were classified automatically
- How many couldn't be categorized (and need review)
- Whether the detailed lookup found matches

---

### Step 5 — Review the QB Upload Tab

Open the **QB Upload** tab. You should see columns:

| Date | Description | Amount | … |
|---|---|---|---|
| 2024-01-15 | Restaurant/Bar Sales | -250.00 | |

**Date** and **Amount** are ready for QuickBooks. The **Description** column contains the enriched category description.

---

### Step 6 — Download as CSV for QuickBooks

1. Go to the **🔄 Parser** menu again
2. Click **📥 Download QB Upload as CSV**
3. A file named `qb_upload.csv` will be saved to your Google Drive root folder
4. Open that file in QuickBooks using your normal CSV import process

> The downloaded file contains only **Date**, **Description**, and **Amount** — the three columns QuickBooks needs.

---

### Step 7 — Review the Unclassified Log (if applicable)

If the parser popup shows unclassified rows, open the **Unclassified Log** tab.

For each row:
- Note the raw description
- Manually assign the correct QuickBooks category
- Or contact David at Axiom Shift with the details and he'll update the rules

---

## What to Do If Something Looks Wrong

**The parser shows 0 rows classified:**
- Make sure you pasted the CSV data starting at row 3 in the Import - Statement tab (row 1 = headers, row 2 = first blank/spacer row, row 3+ = data)
- Check that the column headers in row 1 match the BAC export format

**A lot of rows are in the Unclassified Log:**
- This means the script encountered transaction types it doesn't have rules for yet
- Email the sheet link or screenshot to David and he'll add the rules

**The QB Upload tab is empty after running:**
- Check that the Import - Statement tab has data starting at row 3
- Make sure the date format in the CSV matches DD/MM/YYYY

**Wrong category on a transaction:**
- Note the row number and what it should say
- Email David and he'll fix the rule

---

## What the Script Does NOT Do

- It does **not** connect to your bank account directly
- It does **not** modify or delete your original pasted data
- It does **not** automatically send data to QuickBooks — you download and import manually
- It does **not** share your data with any third parties

---

## Quick Reference Card

| Task | How |
|---|---|
| Paste statement data | "Import - Statement" tab → paste at row 1 |
| Paste detailed ACH data | "Import - Detailed" tab → paste at row 1 (optional) |
| Run the parser | 🔄 Parser → ▶️ Run on Import Tabs |
| Download for QB | 🔄 Parser → 📥 Download QB Upload as CSV |
| Clear output | 🔄 Parser → 🗑️ Clear QB Upload |

---

## Need Help?

**Primary contact:** David — Axiom Shift
**Email:** davidhoff5008@gmail.com
**Response time:** Within 1 business day

---

*This tool was built and is maintained by Axiom Shift. Unauthorized reproduction or distribution of the underlying code is prohibited.*
