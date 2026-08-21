/**
 * Wander Hotel - Bank Reconciliation Parser
 * Google Apps Script v3 — August 2026
 * 
 * TWO IMPORT TABS:
 * - "Import - Statement": paste raw BAC CSV export
 * - "Import - Detailed":  paste detailed ACH batch CSV (with Monto + Concepto columns)
 * 
 * How to install:
 * 1. Open the Wander Hotel pilot sheet
 * 2. Extensions > Apps Script
 * 3. Replace the default Code.gs with this entire file
 * 4. Save (Ctrl+S)
 * 5. Refresh the sheet — a "Parser" menu will appear
 */

// ============================================================
// CATEGORY MAP
// ============================================================
const CATEGORY_MAP = {
  "rules": [
    {
      "id": "card_sales",
      "patterns": ["VISANET AF:", "NEONET AF:", "ACEPTA AF:"],
      "match_on": "descripcion_startswith",
      "description": "Restaurant/Bar Sales"
    },
    {
      "id": "cash_deposit",
      "patterns": ["DEPOSITO EN EFECTIVO"],
      "match_on": "descripcion_contains",
      "description": "Cash Deposit"
    },
    {
      "id": "transfer_between_accounts",
      "patterns": ["TRANSFERENCIA DE FONDOS BC"],
      "match_on": "descripcion_contains",
      "description": "Transfer between accounts"
    },
    {
      "id": "ach_debit",
      "patterns": ["DEBITO ACH"],
      "match_on": "descripcion_startswith",
      "description": null
    },
    {
      "id": "electric_bill",
      "patterns": ["Pago de Empresa Electrica"],
      "match_on": "descripcion_contains",
      "description": "Electric Bill"
    },
    {
      "id": "taxes",
      "patterns": ["DECLARAGUATE TESORERIA NAC."],
      "match_on": "descripcion_contains",
      "description": "Taxes"
    },
    {
      "id": "returned_check_fee",
      "patterns": ["ND x Rechazos"],
      "match_on": "descripcion_contains",
      "description": "Fee for returned check"
    }
  ],

  "vendor_to_notels": {
    "VISANET AF:": "Restaurant/Bar Sales",
    "NEONET AF:": "Restaurant/Bar Sales",
    "ACEPTA AF:": "Restaurant/Bar Sales",
    "PROVENET": "Restaurant/Bar Sales",
    "CREDITO ACH": "Restaurant/Bar Sales",
    "Crédito Pago Diario": "Restaurant/Bar Sales"
  }
};

// ============================================================
// JULY 2026 CREDIT RULES (amount-based)
// ============================================================
const CREDIT_RULES = [
  {
    type: 'cash_sale',
    descriptionContains: 'DEPOSITO EN EFECTIVO',
    amountCondition: '<',
    threshold: 1500,
    result: 'tour sale'
  },
  {
    type: 'cash_deposit_large',
    descriptionContains: 'DEPOSITO EN EFECTIVO',
    amountCondition: '>=',
    threshold: 1500,
    result: 'Restaurant and Bar Sales'
  },
  {
    type: 'ach_credit_small',
    descriptionContains: 'CREDITO ACH',
    amountCondition: '<',
    threshold: 1500,
    result: 'tour sale'
  },
  {
    type: 'ach_credit_large',
    descriptionContains: 'CREDITO ACH',
    amountCondition: '>=',
    threshold: 1500,
    result: 'bank transfer'
  },
  {
    type: 'ach_receptor_small',
    descriptionContains: 'CREDITO RECEPTOR ACH',
    amountCondition: '<',
    threshold: 1500,
    result: 'tour sale'
  },
  {
    type: 'ach_receptor_large',
    descriptionContains: 'CREDITO RECEPTOR ACH',
    amountCondition: '>=',
    threshold: 1500,
    result: 'bank transfer'
  }
];

// ============================================================
// PARSER CLASS
// ============================================================
class BankCSVParser {
  constructor() {
    this.rules = CATEGORY_MAP.rules;
    this.vendorMap = CATEGORY_MAP.vendor_to_notels;
    this.excludes = 0;
    this.classified = 0;
    this.unclassified = 0;
    this.unclassifiedRows = [];
    this._lastResults = [];
    this._detailedLookup = {}; // keyed by rounded amount string for exact match
  }

  // ---- Load detailed ACH CSV for debit matching ----
  loadDetailedCSV(sheet, dataRows) {
    // Expected columns: Lote, Concepto, <skip cols>, Monto (index 3)
    // Header is in row 1 (index 0 in dataRows after header skip)
    this._detailedLookup = {};
    let loaded = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      // Skip empty rows
      if (!row || row.length < 4 || !row[0]) continue;

      // Try to find Concepto and Monto
      // Row format: [Lote, Concepto, Cuenta, Monto, ...]
      // Detect column indices dynamically
      let montoIdx = -1;
      let conceptoIdx = -1;

      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (cell === null || cell === undefined || cell === '') continue;
        const cellStr = cell.toString().trim().toLowerCase();
        const cellNum = parseFloat(cell.toString().replace(/[",\s]/g, ''));
        if (!isNaN(cellNum) && cellNum > 0 && montoIdx === -1 && c >= 3) {
          // Likely the Monto column (numeric, positive, after first 3 cols)
          montoIdx = c;
        }
        if ((cellStr.includes('concepto') || cellStr.includes('descrip')) && conceptoIdx === -1) {
          conceptoIdx = c;
        }
      }

      // Fallback: fixed positions if headers not found
      if (conceptoIdx === -1) conceptoIdx = 1;  // Col B
      if (montoIdx === -1) montoIdx = 3;        // Col D

      const rawMonto = row[montoIdx];
      const rawConcepto = row[conceptoIdx];

      if (rawMonto === null || rawMonto === undefined || rawMonto === '') continue;

      const monto = parseFloat(rawMonto.toString().replace(/[",\s]/g, ''));
      if (isNaN(monto) || monto <= 0) continue;

      const concepto = rawConcepto ? rawConcepto.toString().trim() : '';
      if (!concepto) continue;

      // Round to 2 decimal places for matching
      const key = Math.round(monto * 100) / 100;
      this._detailedLookup[key] = concepto;
      loaded++;
    }

    return loaded;
  }

  // ---- Get detailed description for a debit amount ----
  _getDetailedDescription(amount) {
    if (!amount || amount <= 0) return null;
    const key = Math.round(amount * 100) / 100;
    return this._detailedLookup[key] || null;
  }

  parseAmount(value) {
    if (!value || value.toString().trim() === '') return null;
    let cleaned = value.toString().trim().replace(/"/g, '').replace(/,/g, '').trim();
    if (cleaned === '') return null;
    let n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }

  parseDate(dateStr, monthOverride) {
    try {
      if (!dateStr) return null;
      dateStr = dateStr.toString().trim();
      if (monthOverride) {
        const parts = dateStr.split('/');
        if (parts.length === 2) {
          let day = parts[0].padStart(2, '0');
          let month = monthOverride.toString().padStart(2, '0');
          let year = parts[1];
          if (year.length === 2) year = '20' + year;
          return `${year}-${month}-${day}`;
        }
      }
      // DD/MM/YYYY or D/M/YYYY
      const parts = dateStr.split('/');
      if (parts.length !== 3) return null;
      let [day, month, year] = parts;
      day = day.padStart(2, '0');
      month = month.padStart(2, '0');
      if (year.length === 2) year = '20' + year;
      const m = parseInt(month, 10);
      const d = parseInt(day, 10);
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      return `${year}-${month}-${day}`;
    } catch (e) {
      return null;
    }
  }

  getNetAmount(debito, credito) {
    // BAC CSV: Débito and Crédito are both positive numbers.
    // Net = Crédito - Débito (negative = outflow, positive = inflow)
    const debit = this.parseAmount(debito) || 0.0;
    const credit = this.parseAmount(credito) || 0.0;
    const net = credit - debit;
    return net !== 0 ? net : null;
  }

  applyCreditRules(descripcion, amount) {
    if (!amount || amount <= 0) return null;
    const descUpper = descripcion.toUpperCase();

    for (const rule of CREDIT_RULES) {
      if (!descUpper.includes(rule.descriptionContains)) continue;
      const threshold = rule.threshold;
      let matches = false;
      if (rule.amountCondition === '<' && amount < threshold) matches = true;
      if (rule.amountCondition === '>=' && amount >= threshold) matches = true;
      if (matches) {
        return {
          result: 'classified',
          description: rule.result,
          rule_id: `credit_${rule.type}`
        };
      }
    }
    return null;
  }

  matchRule(descripcion, agencia, notels, amount) {
    const descripcionUpper = descripcion.toUpperCase();

    // ---- Credits: use amount-based rules FIRST ----
    if (amount && amount > 0) {
      const creditResult = this.applyCreditRules(descripcion, amount);
      if (creditResult) return creditResult;
    }

    // ---- Vendor exact match ----
    for (const [vendor, qbDesc] of Object.entries(this.vendorMap)) {
      if (descripcionUpper.startsWith(vendor.toUpperCase())) {
        return { result: 'classified', description: qbDesc, rule_id: 'vendor_exact' };
      }
    }

    // ---- Standard rules ----
    for (const rule of this.rules) {
      if (rule.id === 'excludes' || rule.id === 'ach_debit') continue;
      if (rule.description === null) continue;

      for (const pattern of rule.patterns) {
        const patternUpper = pattern.toUpperCase();
        let matched = false;

        if (rule.match_on === 'descripcion_startswith' && descripcionUpper.startsWith(patternUpper)) {
          matched = true;
        } else if (rule.match_on === 'descripcion_contains' && descripcionUpper.includes(patternUpper)) {
          matched = true;


        if (matched) {
          return { result: 'classified', description: rule.description, rule_id: rule.id };
        }
      }
    }

    // ---- No match ----
    return {
      result: 'unclassified',
      description: notels ? notels.trim() : descripcion.trim(),
      rule_id: null
    };
  }

  // ---- NEW: match debit against detailed lookup first ----
  matchDebitWithDetailed(amount, descripcion, agencia, notels) {
    if (!amount || amount >= 0) return null;  // Only for debits

    const debitAmount = Math.abs(amount);
    const detailedDesc = this._getDetailedDescription(debitAmount);

    if (detailedDesc) {
      return {
        result: 'classified',
        description: detailedDesc,
        rule_id: 'detailed_match'
      };
    }

    // Fall back to standard ACH classification
    return this.matchRule(descripcion, agencia, notels, amount);
  }

  parseStatementRow(row, monthOverride) {
    const descripcion = row['Descripción'] || row['Descripción'] || '';
    const agencia = row['Agencia'] || '';
    const notels = row['Notels'] || '';
    const debito = row['Débito'] || '';
    const credito = row['Crédito'] || '';
    const fecha = row['Fecha'] || '';
    const referencia = row['Referencia'] || '';

    const parsedDate = this.parseDate(fecha, monthOverride);
    if (!parsedDate) return null;

    const amount = this.getNetAmount(debito, credito);
    if (amount === null) return null;

    let match;
    if (amount < 0) {
      // DEBIT: try detailed lookup first, then fall back
      match = this.matchDebitWithDetailed(amount, descripcion, agencia, notels);
    } else {
      // CREDIT: use standard credit rules
      match = this.matchRule(descripcion, agencia, notels, amount);
    }

    if (match.result === 'exclude') {
      this.excludes++;
      return null;
    }

    if (match.result === 'unclassified') {
      this.unclassified++;
      this.unclassifiedRows.push({
        date: parsedDate,
        description: match.description,
        amount: amount,
        raw_descripcion: descripcion,
        agencia: agencia,
        referencia: referencia
      });
    } else {
      this.classified++;
    }

    return {
      date: parsedDate,
      description: match.description,
      amount: amount,
      raw_descripcion: descripcion,
      agencia: agencia,
      referencia: referencia,
      rule_id: match.rule_id
    };
  }

  printSummary() {
    const total = this.excludes + this.classified + this.unclassified;
    let msg = `\nClassification Summary:\n`;
    msg += `  Excluded:     ${this.excludes}\n`;
    msg += `  Classified:   ${this.classified}\n`;
    msg += `  Unclassified: ${this.unclassified}\n`;
    msg += `  Total:        ${total}\n`;
    if (total > 0) {
      msg += `  Auto-match rate: ${(this.classified / total * 100).toFixed(1)}%\n`;
    }
    if (this.unclassifiedRows.length > 0) {
      msg += `\nUnclassified (${this.unclassifiedRows.length}):\n`;
      const show = this.unclassifiedRows.slice(0, 10);
      for (const r of show) {
        msg += `  [${r.date}] ${r.description} / ${r.raw_descripcion.substring(0, 40)} / ${r.agencia}\n`;
      }
      if (this.unclassifiedRows.length > 10) msg += `  ...and ${this.unclassifiedRows.length - 10} more\n`;
    }
    return msg;
  }
}

// ============================================================
// GOOGLE SHEETS INTEGRATION
// ============================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔄 Parser')
    .addItem('▶️  Run on Import Tabs', 'runParser')
    .addItem('🗑️  Clear QB Upload', 'clearQBUpload')
    .addSeparator()
    .addItem('📥 Download QB Upload as CSV', 'downloadQBUploadCSV')
    .addToUi();
}

function runParser() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ---- Find all required sheets ----
  const allSheets = ss.getSheets();
  const sheetNames = allSheets.map(s => s.getName());

  const stmtSheet = ss.getSheetByName('Import - Statement');
  const detSheet  = ss.getSheetByName('Import - Detailed');
  const qbSheet   = ss.getSheetByName('QB Upload');
  const unclSheet = ss.getSheetByName('Unclassified Log');

  const missing = [];
  if (!stmtSheet) missing.push('"Import - Statement"');
  if (!detSheet)  missing.push('"Import - Detailed"');
  if (!qbSheet)   missing.push('"QB Upload"');
  if (!unclSheet) missing.push('"Unclassified Log"');
  if (missing.length > 0) {
    SpreadsheetApp.getUi().alert('Error: Missing required tabs:\n' + missing.join(', ') + '\n\nMake sure your sheet has all 4 tabs.');
    return;
  }

  // ---- Load detailed ACH data into lookup ----
  const parser = new BankCSVParser();
  const detLastRow = detSheet.getLastRow();
  let detailedLoaded = 0;
  if (detLastRow > 1) {
    const detData = detSheet.getRange(2, 1, detLastRow - 1, detSheet.getMaxColumns()).getValues();
    detailedLoaded = parser.loadDetailedCSV(detSheet, detData);
  }

  // ---- Parse statement ----
  const stmtLastRow = stmtSheet.getLastRow();
  if (stmtLastRow < 3) {
    SpreadsheetApp.getUi().alert('No data in "Import - Statement" tab. Paste BAC CSV starting at row 3.');
    return;
  }

  // Read up to 9 columns (BAC standard format)
  const stmtData = stmtSheet.getRange(3, 1, stmtLastRow - 2, 9).getValues();
  const rows = stmtData.map(row => ({
    'Month':        row[0],
    'Fecha':        row[1],
    'Referencia':   row[2],
    'Descripción':  row[3],
    'Débito':       row[4],
    'Crédito':      row[5],
    'Saldo':        row[6],
    'Agencia':      row[7],
    'Notels':       row[8]
  }));

  const results = [];
  let monthOverride = null;

  for (const row of rows) {
    if (row['Month'] && row['Month'].toString().trim()) {
      monthOverride = row['Month'].toString().trim().replace(/^0+/, '');
    }
    const parsed = parser.parseStatementRow(row, monthOverride);
    if (parsed) results.push(parsed);
  }
  parser._lastResults = results;

  // ---- Write QB Upload ----
  if (results.length > 0) {
    const qbData = results.map(r => [
      r.date,
      r.description,
      r.amount.toFixed(2),
      r.rule_id || 'UNCLASSIFIED',
      r.raw_descripcion,
      ''
    ]);
    qbSheet.getRange(2, 1, qbData.length, 6).setValues(qbData);
    qbSheet.getRange(2, 3, qbData.length, 1).setNumberFormat('#,##0.00');
    qbSheet.getRange(2, 1, qbData.length, 1).setNumberFormat('YYYY-MM-DD');
  }

  // ---- Write Unclassified Log ----
  if (parser.unclassifiedRows.length > 0) {
    const unclData = parser.unclassifiedRows.map(r => [
      r.date,
      r.raw_descripcion,
      r.amount.toFixed(2),
      r.agencia,
      '',
      'NEEDS REVIEW'
    ]);
    unclSheet.getRange(2, 1, unclData.length, 6).setValues(unclData);
    unclSheet.getRange(2, 3, unclData.length, 1).setNumberFormat('#,##0.00');
    unclSheet.getRange(2, 1, unclData.length, 1).setNumberFormat('YYYY-MM-DD');
  }

  // ---- Summary ----
  const total = parser.excludes + parser.classified + parser.unclassified;
  let creditBreakdown = '';
  if (results.length > 0) {
    const creditRules = {};
    for (const r of results) {
      if (r.rule_id && r.rule_id.startsWith('credit_')) {
        creditRules[r.rule_id] = (creditRules[r.rule_id] || 0) + 1;
      }
    }
    if (Object.keys(creditRules).length > 0) {
      creditBreakdown = '\nCredit Rules Applied:\n';
      for (const [rule, count] of Object.entries(creditRules)) {
        creditBreakdown += `  ${rule}: ${count}\n`;
      }
    }
  }

  const detailedNote = detailedLoaded > 0
    ? `\nDetailed lookup: ${detailedLoaded} debit records loaded`
    : '\nDetailed lookup: No data found in "Import - Detailed" tab';

  const msg = `Done!${detailedNote}\n\n${parser.printSummary()}${creditBreakdown}\nQB Upload: ${results.length} rows\nUnclassified Log: ${parser.unclassifiedRows.length} rows`;

  SpreadsheetApp.getUi().alert(msg);
}

function clearQBUpload() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qbSheet   = ss.getSheetByName('QB Upload');
  const unclSheet = ss.getSheetByName('Unclassified Log');
  if (qbSheet)   qbSheet.getRange(2,   1, qbSheet.getLastRow(),   6).clearContent();
  if (unclSheet) unclSheet.getRange(2, 1, unclSheet.getLastRow(), 6).clearContent();
  SpreadsheetApp.getUi().alert('QB Upload and Unclassified Log cleared.');
}

function downloadQBUploadCSV() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qbSheet = ss.getSheetByName('QB Upload');
  if (!qbSheet) {
    SpreadsheetApp.getUi().alert('QB Upload tab not found.');
    return;
  }
  const lastRow = qbSheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('No data in QB Upload tab yet. Run the parser first.');
    return;
  }
  // QB-ready: Date, Description, Amount (cols 1-3)
  const data = qbSheet.getRange(1, 1, lastRow, 3).getValues();
  let csv = 'Date,Description,Amount\n';
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let desc = row[1] ? row[1].toString().replace(/"/g, '""') : '';
    if (desc.includes(',') || desc.includes('\n')) desc = '"' + desc + '"';
    csv += `${row[0]},${desc},${row[2]}\n`;
  }
  const blob = Utilities.newBlob(csv, 'text/csv', 'qb_upload.csv');
  DriveApp.createFile(blob);
  SpreadsheetApp.getUi().alert("CSV file 'qb_upload.csv' saved to your Drive root.");
}
