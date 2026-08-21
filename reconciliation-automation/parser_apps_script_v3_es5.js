/**
 * Wander Hotel - Bank Reconciliation Parser
 * Google Apps Script v3 (ES5) — August 2026
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
var CATEGORY_MAP = {
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
// AUGUST 2026 CREDIT RULES (amount-based)
// ============================================================
var CREDIT_RULES = [
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
// PARSER FUNCTIONS (ES5 compatible)
// ============================================================
function createParser() {
  var parser = {
    rules: CATEGORY_MAP.rules,
    vendorMap: CATEGORY_MAP.vendor_to_notels,
    excludes: 0,
    classified: 0,
    unclassified: 0,
    unclassifiedRows: [],
    _lastResults: [],
    _detailedLookup: {},

    // Load detailed ACH CSV for debit matching
    loadDetailedCSV: function(sheet, dataRows) {
      this._detailedLookup = {};
      var loaded = 0;
      var i, row, montoIdx, conceptoIdx, c, cell, cellStr, cellNum, rawMonto, rawConcepto, monto, concepto, key;

      for (i = 0; i < dataRows.length; i++) {
        row = dataRows[i];
        if (!row || row.length < 4 || !row[0]) continue;

        montoIdx = -1;
        conceptoIdx = -1;

        for (c = 0; c < row.length; c++) {
          cell = row[c];
          if (cell === null || cell === undefined || cell === '') continue;
          cellStr = cell.toString().trim().toLowerCase();
          cellNum = parseFloat(cell.toString().replace(/[",\s]/g, ''));
          if (!isNaN(cellNum) && cellNum > 0 && montoIdx === -1 && c >= 3) {
            montoIdx = c;
          }
          if ((cellStr.includes('concepto') || cellStr.includes('descrip')) && conceptoIdx === -1) {
            conceptoIdx = c;
          }
        }

        if (conceptoIdx === -1) conceptoIdx = 1;
        if (montoIdx === -1) montoIdx = 3;

        rawMonto = row[montoIdx];
        rawConcepto = row[conceptoIdx];

        if (rawMonto === null || rawMonto === undefined || rawMonto === '') continue;

        monto = parseFloat(rawMonto.toString().replace(/[",\s]/g, ''));
        if (isNaN(monto) || monto <= 0) continue;

        concepto = rawConcepto ? rawConcepto.toString().trim() : '';
        if (!concepto) continue;

        key = Math.round(monto * 100) / 100;
        this._detailedLookup[key] = concepto;
        loaded++;
      }
      return loaded;
    },

    // Get detailed description for a debit amount
    getDetailedDescription: function(amount) {
      if (!amount || amount <= 0) return null;
      var key = Math.round(amount * 100) / 100;
      return this._detailedLookup[key] || null;
    },

    parseAmount: function(value) {
      if (!value || value.toString().trim() === '') return null;
      var cleaned = value.toString().trim().replace(/"/g, '').replace(/,/g, '').trim();
      if (cleaned === '') return null;
      var n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    },

    parseDate: function(dateStr, monthOverride) {
      try {
        if (!dateStr) return null;
        dateStr = dateStr.toString().trim();
        if (monthOverride) {
          var parts = dateStr.split('/');
          if (parts.length === 2) {
            var day = parts[0].padStart(2, '0');
            var month = monthOverride.toString().padStart(2, '0');
            var year = parts[1];
            if (year.length === 2) year = '20' + year;
            return year + '-' + month + '-' + day;
          }
        }
        var dateParts = dateStr.split('/');
        if (dateParts.length !== 3) return null;
        var d = dateParts[0].padStart(2, '0');
        var m = dateParts[1].padStart(2, '0');
        var y = dateParts[2];
        if (y.length === 2) y = '20' + y;
        var monthNum = parseInt(m, 10);
        var dayNum = parseInt(d, 10);
        if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
        return y + '-' + m + '-' + d;
      } catch (e) {
        return null;
      }
    },

    getNetAmount: function(debito, credito) {
      var debit = this.parseAmount(debito) || 0.0;
      var credit = this.parseAmount(credito) || 0.0;
      var net = credit - debit;
      return net !== 0 ? net : null;
    },

    applyCreditRules: function(descripcion, amount) {
      if (!amount || amount <= 0) return null;
      var descUpper = descripcion.toUpperCase();
      var i, rule, threshold, matches;

      for (i = 0; i < CREDIT_RULES.length; i++) {
        rule = CREDIT_RULES[i];
        if (descUpper.indexOf(rule.descriptionContains) === -1) continue;
        threshold = rule.threshold;
        matches = false;
        if (rule.amountCondition === '<' && amount < threshold) matches = true;
        if (rule.amountCondition === '>=' && amount >= threshold) matches = true;
        if (matches) {
          return {
            result: 'classified',
            description: rule.result,
            rule_id: 'credit_' + rule.type
          };
        }
      }
      return null;
    },

    matchRule: function(descripcion, agencia, notels, amount) {
      var descripcionUpper = descripcion.toUpperCase();
      var i, rule, pattern, patternUpper, matched, vendor, qbDesc;

      // Credits: use amount-based rules FIRST
      if (amount && amount > 0) {
        var creditResult = this.applyCreditRules(descripcion, amount);
        if (creditResult) return creditResult;
      }

      // Vendor exact match
      for (vendor in this.vendorMap) {
        if (this.vendorMap.hasOwnProperty(vendor)) {
          if (descripcionUpper.indexOf(vendor.toUpperCase()) === 0) {
            return { result: 'classified', description: this.vendorMap[vendor], rule_id: 'vendor_exact' };
          }
        }
      }

      // Standard rules
      for (i = 0; i < this.rules.length; i++) {
        rule = this.rules[i];
        if (rule.id === 'excludes' || rule.id === 'ach_debit') continue;
        if (rule.description === null) continue;

        for (var pi = 0; pi < rule.patterns.length; pi++) {
          pattern = rule.patterns[pi];
          patternUpper = pattern.toUpperCase();
          matched = false;

          if (rule.match_on === 'descripcion_startswith' && descripcionUpper.indexOf(patternUpper) === 0) {
            matched = true;
          } else if (rule.match_on === 'descripcion_contains' && descripcionUpper.indexOf(patternUpper) !== -1) {
            matched = true;
          }

          if (matched) {
            return { result: 'classified', description: rule.description, rule_id: rule.id };
          }
        }
      }

      return {
        result: 'unclassified',
        description: notels ? notels.trim() : descripcion.trim(),
        rule_id: null
      };
    },

    // Match debit against detailed lookup first
    matchDebitWithDetailed: function(amount, descripcion, agencia, notels) {
      if (!amount || amount >= 0) return null;
      var debitAmount = Math.abs(amount);
      var detailedDesc = this.getDetailedDescription(debitAmount);

      if (detailedDesc) {
        return {
          result: 'classified',
          description: detailedDesc,
          rule_id: 'detailed_match'
        };
      }

      return this.matchRule(descripcion, agencia, notels, amount);
    },

    parseStatementRow: function(row, monthOverride) {
      var descripcion = row['Descripción'] || row['Descripción'] || '';
      var agencia = row['Agencia'] || '';
      var notels = row['Notels'] || '';
      var debito = row['Débito'] || '';
      var credito = row['Crédito'] || '';
      var fecha = row['Fecha'] || '';
      var referencia = row['Referencia'] || '';

      var parsedDate = this.parseDate(fecha, monthOverride);
      if (!parsedDate) return null;

      var amount = this.getNetAmount(debito, credito);
      if (amount === null) return null;

      var match;
      if (amount < 0) {
        match = this.matchDebitWithDetailed(amount, descripcion, agencia, notels);
      } else {
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
    },

    printSummary: function() {
      var total = this.excludes + this.classified + this.unclassified;
      var msg = '\nClassification Summary:\n';
      msg += '  Excluded:     ' + this.excludes + '\n';
      msg += '  Classified:   ' + this.classified + '\n';
      msg += '  Unclassified: ' + this.unclassified + '\n';
      msg += '  Total:        ' + total + '\n';
      if (total > 0) {
        msg += '  Auto-match rate: ' + (this.classified / total * 100).toFixed(1) + '%\n';
      }
      if (this.unclassifiedRows.length > 0) {
        msg += '\nUnclassified (' + this.unclassifiedRows.length + '):\n';
        var show = this.unclassifiedRows.slice(0, 10);
        var r;
        for (var si = 0; si < show.length; si++) {
          r = show[si];
          msg += '  [' + r.date + '] ' + r.description + ' / ' + r.raw_descripcion.substring(0, 40) + ' / ' + r.agencia + '\n';
        }
        if (this.unclassifiedRows.length > 10) msg += '  ...and ' + (this.unclassifiedRows.length - 10) + ' more\n';
      }
      return msg;
    }
  };

  return parser;
}

// ============================================================
// GOOGLE SHEETS INTEGRATION
// ============================================================

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🔄 Parser')
    .addItem('▶️  Run on Import Tabs', 'runParser')
    .addItem('🗑️  Clear QB Upload', 'clearQBUpload')
    .addSeparator()
    .addItem('📥 Download QB Upload as CSV', 'downloadQBUploadCSV')
    .addToUi();
}

function runParser() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var allSheets = ss.getSheets();
  var sheetNames = allSheets.map(function(s) { return s.getName(); });

  var stmtSheet = ss.getSheetByName('Import - Statement');
  var detSheet  = ss.getSheetByName('Import - Detailed');
  var qbSheet   = ss.getSheetByName('QB Upload');
  var unclSheet = ss.getSheetByName('Unclassified Log');

  var missing = [];
  if (!stmtSheet) missing.push('"Import - Statement"');
  if (!detSheet)  missing.push('"Import - Detailed"');
  if (!qbSheet)   missing.push('"QB Upload"');
  if (!unclSheet) missing.push('"Unclassified Log"');
  if (missing.length > 0) {
    SpreadsheetApp.getUi().alert('Error: Missing required tabs:\n' + missing.join(', ') + '\n\nMake sure your sheet has all 4 tabs.');
    return;
  }

  // Load detailed ACH data into lookup
  var parser = createParser();
  var detLastRow = detSheet.getLastRow();
  var detailedLoaded = 0;
  if (detLastRow > 1) {
    var detData = detSheet.getRange(2, 1, detLastRow - 1, detSheet.getMaxColumns()).getValues();
    detailedLoaded = parser.loadDetailedCSV(detSheet, detData);
  }

  // Parse statement
  var stmtLastRow = stmtSheet.getLastRow();
  if (stmtLastRow < 3) {
    SpreadsheetApp.getUi().alert('No data in "Import - Statement" tab. Paste BAC CSV starting at row 3.');
    return;
  }

  var stmtData = stmtSheet.getRange(3, 1, stmtLastRow - 2, 9).getValues();
  var rows = stmtData.map(function(row) {
    return {
      'Month':        row[0],
      'Fecha':        row[1],
      'Referencia':   row[2],
      'Descripción':  row[3],
      'Débito':       row[4],
      'Crédito':      row[5],
      'Saldo':        row[6],
      'Agencia':      row[7],
      'Notels':       row[8]
    };
  });

  var results = [];
  var monthOverride = null;
  var i, row, parsed;

  for (i = 0; i < rows.length; i++) {
    row = rows[i];
    if (row['Month'] && row['Month'].toString().trim()) {
      monthOverride = row['Month'].toString().trim().replace(/^0+/, '');
    }
    parsed = parser.parseStatementRow(row, monthOverride);
    if (parsed) results.push(parsed);
  }
  parser._lastResults = results;

  // Write Classification Rules tab
  writeRulesTab();

  // Write QB Upload
  if (results.length > 0) {
    var qbData = results.map(function(r) {
      return [
        r.date,
        r.description,
        r.amount.toFixed(2),
        r.rule_id || 'UNCLASSIFIED',
        r.raw_descripcion,
        ''
      ];
    });
    qbSheet.getRange(2, 1, qbData.length, 6).setValues(qbData);
    qbSheet.getRange(2, 3, qbData.length, 1).setNumberFormat('#,##0.00');
    qbSheet.getRange(2, 1, qbData.length, 1).setNumberFormat('YYYY-MM-DD');
  }

  // Write Unclassified Log
  if (parser.unclassifiedRows.length > 0) {
    var unclData = parser.unclassifiedRows.map(function(r) {
      return [
        r.date,
        r.raw_descripcion,
        r.amount.toFixed(2),
        r.agencia,
        '',
        'NEEDS REVIEW'
      ];
    });
    unclSheet.getRange(2, 1, unclData.length, 6).setValues(unclData);
    unclSheet.getRange(2, 3, unclData.length, 1).setNumberFormat('#,##0.00');
    unclSheet.getRange(2, 1, unclData.length, 1).setNumberFormat('YYYY-MM-DD');
  }

  // Summary
  var total = parser.excludes + parser.classified + parser.unclassified;
  var creditBreakdown = '';
  if (results.length > 0) {
    var creditRules = {};
    for (i = 0; i < results.length; i++) {
      var r = results[i];
      if (r.rule_id && r.rule_id.indexOf('credit_') === 0) {
        creditRules[r.rule_id] = (creditRules[r.rule_id] || 0) + 1;
      }
    }
    if (Object.keys(creditRules).length > 0) {
      creditBreakdown = '\nCredit Rules Applied:\n';
      for (var rule in creditRules) {
        if (creditRules.hasOwnProperty(rule)) {
          creditBreakdown += '  ' + rule + ': ' + creditRules[rule] + '\n';
        }
      }
    }
  }

  var detailedNote = detailedLoaded > 0
    ? '\nDetailed lookup: ' + detailedLoaded + ' debit records loaded'
    : '\nDetailed lookup: No data found in "Import - Detailed" tab';

  var msg = 'Done!' + detailedNote + '\n\n' + parser.printSummary() + creditBreakdown + '\nQB Upload: ' + results.length + ' rows\nUnclassified Log: ' + parser.unclassifiedRows.length + ' rows';

  SpreadsheetApp.getUi().alert(msg);
}

function clearQBUpload() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var qbSheet   = ss.getSheetByName('QB Upload');
  var unclSheet = ss.getSheetByName('Unclassified Log');
  var rulesSheet = ss.getSheetByName('Classification Rules');
  if (qbSheet)   qbSheet.getRange(2,   1, qbSheet.getLastRow(),   6).clearContent();
  if (unclSheet) unclSheet.getRange(2, 1, unclSheet.getLastRow(), 6).clearContent();
  if (rulesSheet) rulesSheet.getRange(2, 1, rulesSheet.getLastRow(), 5).clearContent();
  SpreadsheetApp.getUi().alert('QB Upload, Unclassified Log, and Classification Rules cleared.');
}

// ============================================================
// WRITE RULES TAB
// ============================================================
function writeRulesTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rulesSheet = ss.getSheetByName('Classification Rules');
  if (!rulesSheet) {
    rulesSheet = ss.insertSheet('Classification Rules', 0);
  }
  
  // Header
  var headers = ['Rule ID', 'Description', 'Match On', 'Patterns', 'Notes'];
  var row = 1;
  rulesSheet.getRange(row, 1, 1, 5).setValues([headers]);
  rulesSheet.getRange(row, 1, 1, 5).setFontWeight('bold');
  row++;
  
  // Credit rules
  var i, rule, patterns, matchOn;
  for (i = 0; i < CREDIT_RULES.length; i++) {
    rule = CREDIT_RULES[i];
    patterns = rule.descriptionContains + ' + amount ' + rule.amountCondition + ' ' + rule.threshold;
    rulesSheet.getRange(row, 1, 1, 5).setValues([[
      'credit_' + rule.type,
      rule.result,
      'description + amount threshold',
      patterns,
      'Built-in credit rule'
    ]]);
    row++;
  }
  
  // Category map rules
  var j;
  for (i = 0; i < CATEGORY_MAP.rules.length; i++) {
    rule = CATEGORY_MAP.rules[i];
    if (rule.description === '__EXCLUDE__') continue;
    
    matchOn = rule.match_on.replace(/_/g, ' ');
    patterns = rule.patterns.join(', ');
    
    rulesSheet.getRange(row, 1, 1, 5).setValues([[
      rule.id,
      rule.description || '(no description)',
      matchOn,
      patterns,
      ''
    ]]);
    row++;
  }
  
  // Auto-fit columns
  rulesSheet.autoResizeColumns(1, 5);
}


function downloadQBUploadCSV() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var qbSheet = ss.getSheetByName('QB Upload');
  if (!qbSheet) {
    SpreadsheetApp.getUi().alert('QB Upload tab not found.');
    return;
  }
  var lastRow = qbSheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('No data in QB Upload tab yet. Run the parser first.');
    return;
  }
  var data = qbSheet.getRange(1, 1, lastRow, 3).getValues();
  var csv = 'Date,Description,Amount\n';
  var i, row, desc;
  for (i = 1; i < data.length; i++) {
    row = data[i];
    desc = row[1] ? row[1].toString().replace(/"/g, '""') : '';
    if (desc.indexOf(',') !== -1 || desc.indexOf('\n') !== -1) desc = '"' + desc + '"';
    csv += row[0] + ',' + desc + ',' + row[2] + '\n';
  }
  var blob = Utilities.newBlob(csv, 'text/csv', 'qb_upload.csv');
  DriveApp.createFile(blob);
  SpreadsheetApp.getUi().alert("CSV file 'qb_upload.csv' saved to your Drive root.");
}
