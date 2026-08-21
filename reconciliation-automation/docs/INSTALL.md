# Bank Reconciliation Parser — Installation Guide
**Wander Boutique Hotel** | Axiom Shift

---

## Overview

The Bank Reconciliation Parser is a Google Apps Script that runs inside the Wander Hotel Google Sheet. It reads BAC bank CSV exports, classifies transactions automatically, and outputs a QB-ready upload file — reducing reconciliation time from hours to minutes.

---

## Before You Begin

Your Google Sheet must have four tabs before installing:

| Tab Name | Purpose |
|---|---|
| `Import - Statement` | Paste raw BAC CSV export (data starts row 3) |
| `Import - Detailed` | Paste ACH batch detailed CSV (optional — data starts row 3) |
| `QB Upload` | Parser output — ready for QuickBooks |
| `Unclassified Log` | Transactions the parser couldn't classify |

> **Note:** The parser creates the `QB Upload`, `Unclassified Log`, and `Classification Rules` tabs automatically on first run if any are missing.

---

## Installation

### Step 1 — Open the Google Sheet

Open the Wander Hotel pilot Google Sheet.

### Step 2 — Open Apps Script Editor

Click **Extensions → Apps Script**.

A new browser tab opens with the script editor.

### Step 3 — Replace the Default Code

The editor shows a default `Code.gs` file.

1. **Select all** (Ctrl+A)
2. **Delete** everything
3. **Copy and paste** the entire contents of `parser_apps_script_v3_es5.js` into the editor

### Step 4 — Save

Press **Ctrl+S** (or click the save icon).

### Step 5 — Refresh the Google Sheet

Go back to the Google Sheet tab and refresh the page (F5 or Ctrl+R).

### Step 6 — Confirm Installation

Look for a new menu called **🔄 Parser** in the Google Sheet toolbar.

**Installation complete.**

---

## Updating to a New Version

When your Axiom Shift consultant provides a parser update:

1. Open **Extensions → Apps Script**
2. Open `Code.gs`
3. Select all, delete, and paste the new file contents
4. **Ctrl+S** to save
5. Refresh the sheet

---

## Need Help?

Contact your Axiom Shift consultant with a description of the issue and any error messages you see.
