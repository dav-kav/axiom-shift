/**
 * Wander Hotel - Bank Reconciliation Parser
 * Google Apps Script version of parser.py
 * Updated: July 2026 — adds amount-based credit rules
 * 
 * How to install:
 * 1. Open the Wander Hotel pilot sheet
 * 2. Extensions > Apps Script
 * 3. Replace the default Code.gs with this entire file
 * 4. Save (Ctrl+S)
 * 5. Refresh the sheet — a "Parser" menu will appear
 */

// ============================================================
// CATEGORY MAP (mirrors category_map.json from parser.py)
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
      "id": "accounting_fee",
      "patterns": ["Accounting Fee", "Accounting services"],
      "match_on": "notels_contains",
      "description": "Accounting Services"
    },
    {
      "id": "owner_cash_infustion",
      "patterns": ["Owner cash infusion", "Owner deposit", "cash infustion", "cash infusion"],
      "match_on": "notels_contains",
      "description": "Owner Cash Infusion"
    },
    {
      "id": "reimbursement",
      "patterns": ["Reimbursement", "reimburesement"],
      "match_on": "notels_contains",
      "description": "Reimbursement"
    },
    {
      "id": "excludes",
      "patterns": ["Exclude"],
      "match_on": "notels_equals",
      "description": "__EXCLUDE__"
    },
    {
      "id": "returned_check_fee",
      "patterns": ["ND x Rechazos"],
      "match_on": "descripcion_contains",
      "description": "Fee for returned check"
    }
  ],

  "ach_subtypes": {
    "payroll_keywords": ["Payroll", "salary", "Salary", "Payr"],
    "tip_keywords": ["Tip"],
    "aguinaldo_keywords": ["Aguinaldo"],
    "liquidacion_keywords": ["Liquidacion"],
    "inventory_keywords": ["Inventory", "Pricemart", "Bread", "COGS", "Food", "Bar"],
    "trash_keywords": ["Trash", "Service"],
    "rent_keywords": ["Rent", "Ops mgr"],
    "vendor_specific": {
      "Compensacion Guate ACH": {
        "Sergi": "Sergio Payroll",
        "Melvin": "Melvin Payroll",
        "Melving": "Melvin Payroll",
        "Lesli": "Lesli Payroll",
        "Eslin": "Eslin Payroll",
        "Evelin": "Evelin Payroll",
        "Ana": "Ana Payroll",
        "Edgar": "Edgar Payroll",
        "Pablo": "Pablo Payroll",
        "Marisol": "Marisol Payroll",
        "Jefferson": "Jefferson Payroll",
        "Ani": "Ani Payroll",
        "Juli": "Juli Payroll",
        "Pricemart": "Inventory - Food",
        "Bread": "Inventory - Bread",
        "COGS": "COGS",
        "Pool": "Pool Supplies",
        "Gabriel Muniz": "Furniture Repair",
        "Saran": "Outdoor Supplies",
        "Tuk": "Transportation",
        "Jimmy Javier": "Supplies",
        "Jaquelin Carol": "Supplies",
        "Onsite Music": "Entertainment",
        "Septic": "Septic Service",
        "La Torre": "Reimbursement",
        "Byron": "Electrical Work",
        "Airport": "Airport Transfer",
        "ConstructionAutosu": "Construction",
        "Polos": "Staff Uniforms",
        "Jose Letran": "Contractor Deposit",
        "Wander cups": "Wander Branding",
        "AC": "AC Maintenance",
        "Petty": "Petty Cash"
      }
    }
  },

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
// These fire BEFORE standard rules for positive-amount (credit) rows
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
    this.achConfig = CATEGORY_MAP.ach_subtypes;
    this.vendorMap = CATEGORY_MAP.vendor_to_notels;
    this.excludes = 0;
    this.classified = 0;
    this.unclassified = 0;
    this.unclassifiedRows = [];
    this._lastResults = [];
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
      // DD/MM/YYYY
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
    const debit = this.parseAmount(debito) || 0.0;
    const credit = this.parseAmount(credito) || 0.0;
    const net = credit + debit;
    return net !== 0 ? net : null;
  }

  // ---- July 2026: amount-based credit rules ----
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
    const notelsUpper = notels ? notels.toUpperCase() : '';
    const agenciaUpper = agencia ? agencia.toUpperCase() : '';

    // ---- July 2026: credits (positive amount) use amount-based rules FIRST ----
    if (amount && amount > 0) {
      const creditResult = this.applyCreditRules(descripcion, amount);
      if (creditResult) return creditResult;
    }

    // Check EXCLUDE first
    const excludeRule = this.rules.find(r => r.id === 'excludes');
    if (excludeRule) {
      for (const pattern of excludeRule.patterns) {
        if (notelsUpper === pattern.toUpperCase()) {
          return { result: 'exclude', description: notels.trim(), rule_id: 'excludes' };
        }
      }
    }

    // Vendor exact match
    for (const [vendor, qbDesc] of Object.entries(this.vendorMap)) {
      if (descripcionUpper.startsWith(vendor.toUpperCase())) {
        return { result: 'classified', description: qbDesc, rule_id: 'vendor_exact' };
      }
    }

    // Standard rules
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
        } else if (rule.match_on === 'notels_contains' && notelsUpper.includes(patternUpper)) {
          matched = true;
        } else if (rule.match_on === 'notels_equals' && notelsUpper === patternUpper) {
          matched = true;
        }

        if (matched) {
          return { result: 'classified', description: rule.description, rule_id: rule.id };
        }
      }
    }

    // ACH sub-type classification
    if (descripcionUpper.startsWith('DEBITO ACH') || descripcionUpper.includes('ACH')) {
      const achResult = this.classifyAch(descripcion, agencia, notels);
      if (achResult) return achResult;
    }

    // No match
    return {
      result: 'unclassified',
      description: notels ? notels.trim() : descripcion.trim(),
      rule_id: null
    };
  }

  classifyAch(descripcion, agencia, notels) {
    const descripcionUpper = descripcion.toUpperCase();
    const notelsUpper = notels ? notels.toUpperCase() : '';
    const agenciaUpper = agencia ? agencia.toUpperCase() : '';

    if (!notels) return null;

    const vs = this.achConfig.vendor_specific;

    const checks = [
      { key: 'payroll_keywords', result: 'ach_payroll', extractor: (kw, idx) => {
        const before = notels.slice(0, idx).trim();
        return before ? `${before} ${kw}` : kw;
      }},
      { key: 'tip_keywords', result: 'ach_tip' },
      { key: 'aguinaldo_keywords', result: 'ach_aguinaldo' },
      { key: 'liquidacion_keywords', result: 'ach_liquidacion' },
      { key: 'inventory_keywords', result: 'ach_inventory' },
      { key: 'trash_keywords', result: 'ach_trash' },
      { key: 'rent_keywords', result: 'ach_rent' }
    ];

    for (const check of checks) {
      for (const keyword of this.achConfig[check.key]) {
        const idx = notelsUpper.indexOf(keyword.toUpperCase());
        if (idx >= 0) {
          const desc = check.extractor ? check.extractor(keyword, idx) : notels.trim();
          return { result: 'classified', description: desc, rule_id: check.result };
        }
      }
    }

    // Check vendor_specific entries
    if (vs[agenciaUpper]) {
      const vsa = vs[agenciaUpper];
      for (const [key, qbDesc] of Object.entries(vsa)) {
        if (typeof qbDesc === 'string' && (notelsUpper.includes(key.toUpperCase()) || descripcionUpper.includes(key.toUpperCase()))) {
          if (key === 'description') continue;
          return { result: 'classified', description: notels.trim(), rule_id: 'ach_vendor_specific' };
        }
      }
    }

    // Check all vendor_specific across agencies
    for (const [vendorKey, config] of Object.entries(vs)) {
      if (typeof config === 'object' && !Array.isArray(config)) {
        for (const [key, qbDesc] of Object.entries(config)) {
          if (key === 'description') continue;
          if (notelsUpper.includes(key.toUpperCase())) {
            return { result: 'classified', description: notels.trim(), rule_id: 'ach_vendor_specific' };
          }
        }
      }
    }

    return null;
  }

  parseRow(row, monthOverride) {
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

    // ---- July 2026: pass amount to matchRule for credit rules ----
    const match = this.matchRule(descripcion, agencia, notels, amount);

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
    .addItem('▶️  Run on Import Tab', 'runParser')
    .addItem('🗑️  Clear QB Upload', 'clearQBUpload')
    .addSeparator()
    .addItem('📥 Download QB Upload as CSV', 'downloadQBUploadCSV')
    .addToUi();
}

function runParser() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const importSheet = ss.getSheetByName('Import');
  const qbSheet = ss.getSheetByName('QB Upload');
  const unclSheet = ss.getSheetByName('Unclassified Log');

  if (!importSheet || !qbSheet || !unclSheet) {
    SpreadsheetApp.getUi().alert('Error: Required tabs not found. Make sure the sheet has Import, QB Upload, and Unclassified Log tabs.');
    return;
  }

  const lastRow = importSheet.getLastRow();
  if (lastRow < 3) {
    SpreadsheetApp.getUi().alert('No data found in Import tab. Paste BAC CSV starting at row 3.');
    return;
  }

  const allData = importSheet.getRange(3, 1, lastRow - 2, 9).getValues();

  const rows = [];
  for (let i = 1; i < allData.length; i++) {
    rows.push({
      'Month': allData[i][0],
      'Fecha': allData[i][1],
      'Referencia': allData[i][2],
      'Descripción': allData[i][3],
      'Débito': allData[i][4],
      'Crédito': allData[i][5],
      'Saldo': allData[i][6],
      'Agencia': allData[i][7],
      'Notels': allData[i][8]
    });
  }

  const parser = new BankCSVParser();
  const results = [];
  let monthOverride = null;

  for (const row of rows) {
    if (row['Month'] && row['Month'].toString().trim()) {
      monthOverride = row['Month'].toString().trim().replace(/^0+/, '');
    }
    const parsed = parser.parseRow(row, monthOverride);
    if (parsed) results.push(parsed);
  }
  parser._lastResults = results;

  // Write QB Upload results — 6 columns: Date, Description, Amount, Rule Applied, Raw Desc, Notes
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

  // Write Unclassified Log — same 6 columns
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

  // Summary — now includes credit rule breakdown
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

  const msg = `Done!\n\n${parser.printSummary()}${creditBreakdown}\nQB Upload: ${results.length} rows\nUnclassified Log: ${parser.unclassifiedRows.length} rows\n\nQB Upload tab ready. QB Upload + Unclassified Log both have 6 columns — Rule Applied column shows which rule fired (e.g. credit_cash_deposit_large).`;

  SpreadsheetApp.getUi().alert(msg);
}

function clearQBUpload() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qbSheet = ss.getSheetByName('QB Upload');
  const unclSheet = ss.getSheetByName('Unclassified Log');
  if (qbSheet) qbSheet.getRange(2, 1, qbSheet.getLastRow(), 6).clearContent();
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

  // Get QB-ready columns only: Date, Description, Amount (cols 1-3)
  const data = qbSheet.getRange(1, 1, lastRow, 3).getValues();

  let csv = 'Date,Description,Amount\n';
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let desc = row[1] ? row[1].toString().replace(/"/g, '""') : '';
    if (desc.includes(',') || desc.includes('\n')) {
      desc = '"' + desc + '"';
    }
    csv += `${row[0]},${desc},${row[2]}\n`;
  }

  const blob = Utilities.newBlob(csv, 'text/csv', 'qb_upload.csv');
  DriveApp.createFile(blob);

  SpreadsheetApp.getUi().alert(`CSV file 'qb_upload.csv' saved to your Drive root. Move it to the desired location.`);
}
