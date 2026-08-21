"""
Bank CSV Parser - Wander Boutique Hotel
Reads raw BAC Guatemala CSV export + detailed ACH file → outputs QB-ready CSV

Updated for July 2026 client requirements:
- Statement CSV: bank statement with transactions
- Detailed XLS: ACH batch details (for debit matching by amount)

Credit rules (all credits require review before QB upload):
- Cash sale + < 1500 = tour sale
- Cash deposit + > 1500 = restaurant and bar sale  
- ACH credit + < 1500 = tour sale
- ACH credit + > 1500 = bank transfer

Debit matching:
- Match by amount between statement and detailed file
- Use detailed "Concepto" as enhanced description

Usage:
    python parser.py <statement_csv> [--detailed <detailed_xls>] [--output <output_csv>]
"""

import csv
import json
import re
import sys
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List

try:
    import xlrd
    XLRD_AVAILABLE = True
except ImportError:
    XLRD_AVAILABLE = False


class BankCSVParser:
    """Parser for BAC Guatemala bank CSV exports with detailed ACH file support."""

    # Credit rules from July 2026 client requirements
    CREDIT_RULES = [
        {
            'type': 'cash_sale',
            'description_contains': 'DEPOSITO EN EFECTIVO',
            'amount_condition': '<' ,
            'threshold': 1500,
            'result': 'tour sale'
        },
        {
            'type': 'cash_deposit_large',
            'description_contains': 'DEPOSITO EN EFECTIVO',
            'amount_condition': '>=',
            'threshold': 1500,
            'result': 'Restaurant and Bar Sales'
        },
        {
            'type': 'ach_credit_small',
            'description_contains': 'CREDITO ACH',
            'amount_condition': '<',
            'threshold': 1500,
            'result': 'tour sale'
        },
        {
            'type': 'ach_credit_large',
            'description_contains': 'CREDITO ACH',
            'amount_condition': '>=',
            'threshold': 1500,
            'result': 'bank transfer'
        },
        {
            'type': 'ach_receptor_small',
            'description_contains': 'CREDITO RECEPTOR ACH',
            'amount_condition': '<',
            'threshold': 1500,
            'result': 'tour sale'
        },
        {
            'type': 'ach_receptor_large',
            'description_contains': 'CREDITO RECEPTOR ACH',
            'amount_condition': '>=',
            'threshold': 1500,
            'result': 'bank transfer'
        },
    ]

    def __init__(self, category_map_path: str, detailed_xls_path: str = None):
        with open(category_map_path, 'r') as f:
            self.map_data = json.load(f)
        self.rules = self.map_data['rules']
        self.ach_config = self.map_data.get('ach_subtypes', {})
        self.vendor_map = self.map_data.get('vendor_to_notels', {})
        self.excludes = 0
        self.classified = 0
        self.unclassified = 0
        
        # Detailed ACH file data for debit matching
        self.detailed_debits: Dict[float, dict] = {}
        if detailed_xls_path and XLRD_AVAILABLE:
            self._load_detailed_xls(detailed_xls_path)
        elif detailed_xls_path and not XLRD_AVAILABLE:
            print(f"Warning: xlrd not available, cannot load {detailed_xls_path}")

    def _load_detailed_xls(self, xls_path: str):
        """Load detailed ACH batch file for debit matching."""
        try:
            wb = xlrd.open_workbook(xls_path)
            sh = wb.sheet_by_index(0)
            
            # Find header row
            header_row = None
            for r in range(min(15, sh.nrows)):
                row = [sh.cell_value(r, c) for c in range(sh.ncols)]
                if row and row[0] == 'Lote':
                    header_row = r
                    break
            
            if header_row is None:
                print("Warning: Could not find Lote header in detailed XLS")
                return
            
            # Parse data rows
            for r in range(header_row + 1, sh.nrows):
                row = [sh.cell_value(r, c) for c in range(sh.ncols)]
                if not row or not row[0]:
                    continue
                
                lote = str(row[0]).strip()
                concepto = str(row[1]).strip() if len(row) > 1 else ''
                monto = row[3] if len(row) > 3 else 0
                
                if isinstance(monto, (int, float)) and monto > 0:
                    self.detailed_debits[monto] = {
                        'lote': lote,
                        'concepto': concepto,
                        'amount': monto
                    }
            
            print(f"Loaded {len(self.detailed_debits)} detailed debit records for matching")
        except Exception as e:
            print(f"Error loading detailed XLS: {e}")

    def _get_detailed_description(self, amount: float) -> str:
        """Get detailed description for a debit by matching amount."""
        for amt, detail in self.detailed_debits.items():
            if abs(amt - amount) < 0.01:
                return detail['concepto']
        return None

    def parse_amount(self, value: str) -> Optional[float]:
        """Parse BAC amount format: handles quotes, commas, empty strings."""
        if not value or value.strip() == '':
            return None
        # Remove quotes and thousands-separating commas
        cleaned = value.strip().replace('"', '').replace(',', '').strip()
        if cleaned == '':
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None

    def parse_date(self, date_str: str, month_override: str = None) -> Optional[str]:
        """Parse DD/MM/YYYY → return QB format YYYY-MM-DD."""
        try:
            # If month comes from a separate column
            if month_override:
                parts = date_str.strip().split('/')
                if len(parts) == 2:
                    day = parts[0].zfill(2)
                    month = month_override.zfill(2)
                    year = parts[1]
                    if len(year) == 2:
                        year = '20' + year
                    return f"{year}-{month}-{day}"
            # Standard DD/MM/YYYY
            dt = datetime.strptime(date_str.strip(), '%d/%m/%Y')
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            return None

    def get_net_amount(self, debito: str, credito: str) -> Optional[float]:
        """Parse BAC CSV amounts.
        
        BAC CSV stores Débito and Crédito as separate positive columns.
        Net = Crédito - Débito (negative = outflow, positive = inflow).
        """
        debit = self.parse_amount(debito) or 0.0
        credit = self.parse_amount(credito) or 0.0
        net = credit - debit
        return net if net != 0 else None

    def match_rule(self, descripcion: str, agencia: str, notels: str, amount: float = None) -> dict:
        """Match a row against the category rules. Returns rule + resolved description.
        
        For credits (positive amount): applies credit rules with amount thresholds
        For debits (negative amount): tries to match detailed file for enhanced description
        """
        descripcion_upper = descripcion.upper()
        notels_upper = notels.upper() if notels else ''

        # Handle CREDITS with new amount-based rules
        if amount and amount > 0:
            credit_result = self._apply_credit_rules(descripcion, amount)
            if credit_result:
                return credit_result

        # Check EXCLUDE first
        for rule in self.rules:
            if rule['id'] == 'excludes':
                for pattern in rule['patterns']:
                    if pattern.upper() in notels_upper:
                        return {'result': 'exclude', 'description': notels.strip(), 'rule_id': rule['id']}

        # Check vendor_to_notels first (exact match on full description)
        for vendor, qb_desc in self.vendor_map.items():
            if vendor.upper() in descripcion_upper:
                return {'result': 'classified', 'description': qb_desc, 'rule_id': 'vendor_exact'}

        # Check standard rules
        for rule in self.rules:
            if rule['id'] == 'excludes':
                continue
            if rule['id'] == 'ach_debit':
                continue  # handle separately below

            match_type = rule['match_on']
            for pattern in rule['patterns']:
                pattern_upper = pattern.upper()
                matched = False
                if match_type == 'descripcion_startswith' and descripcion_upper.startswith(pattern_upper):
                    matched = True
                elif match_type == 'descripcion_contains' and pattern_upper in descripcion_upper:
                    matched = True
                elif match_type == 'notels_contains' and pattern_upper in notels_upper:
                    matched = True
                elif match_type == 'notels_equals' and notels_upper == pattern_upper:
                    matched = True

                if matched:
                    return {'result': 'classified', 'description': rule['description'], 'rule_id': rule['id']}

        # Handle DEBITS - try detailed file matching first
        if amount and amount < 0:
            # Convert to positive for matching
            debit_amount = abs(amount)
            detailed_desc = self._get_detailed_description(debit_amount)
            if detailed_desc:
                return {
                    'result': 'classified',
                    'description': detailed_desc,
                    'rule_id': 'detailed_match'
                }

        # ACH sub-type classification for debits
        if descripcion_upper.startswith('DEBITO ACH') or 'ACH' in descripcion_upper:
            result = self._classify_ach(descripcion, agencia, notels)
            if result:
                return result

        # No match
        return {'result': 'unclassified', 'description': notels.strip() if notels else descripcion.strip(), 'rule_id': None}

    def _apply_credit_rules(self, descripcion: str, amount: float) -> dict:
        """Apply the July 2026 credit rules based on description and amount."""
        descripcion_upper = descripcion.upper()
        
        for rule in self.CREDIT_RULES:
            if rule['description_contains'] in descripcion_upper:
                # Check amount condition
                threshold = rule['threshold']
                condition = rule['amount_condition']
                
                matches_condition = False
                if condition == '<' and amount < threshold:
                    matches_condition = True
                elif condition == '>=' and amount >= threshold:
                    matches_condition = True
                
                if matches_condition:
                    return {
                        'result': 'classified',
                        'description': rule['result'],
                        'rule_id': f"credit_{rule['type']}"
                    }
        
        return None

    def _classify_ach(self, descripcion: str, agencia: str, notels: str) -> Optional[dict]:
        """Classify DEBITO ACH transactions by subtype."""
        descripcion_upper = descripcion.upper()
        notels_upper = notels.upper() if notels else ''
        agencia_upper = agencia.upper() if agencia else ''

        # Check payroll names in notels
        if notels:
            for keyword in self.ach_config.get('payroll_keywords', []):
                if keyword.upper() in notels_upper:
                    # Extract name
                    name = self._extract_name_from_notels(notels, keyword)
                    return {'result': 'classified', 'description': notels.strip(), 'rule_id': 'ach_payroll'}

            for keyword in self.ach_config.get('tip_keywords', []):
                if keyword.upper() in notels_upper:
                    return {'result': 'classified', 'description': notels.strip(), 'rule_id': 'ach_tip'}

            for keyword in self.ach_config.get('aguinaldo_keywords', []):
                if keyword.upper() in notels_upper:
                    return {'result': 'classified', 'description': notels.strip(), 'rule_id': 'ach_aguinaldo'}

            for keyword in self.ach_config.get('liquidacion_keywords', []):
                if keyword.upper() in notels_upper:
                    return {'result': 'classified', 'description': notels.strip(), 'rule_id': 'ach_liquidacion'}

            for keyword in self.ach_config.get('inventory_keywords', []):
                if keyword.upper() in notels_upper:
                    return {'result': 'classified', 'description': notels.strip(), 'rule_id': 'ach_inventory'}

            for keyword in self.ach_config.get('trash_keywords', []):
                if keyword.upper() in notels_upper:
                    return {'result': 'classified', 'description': notels.strip(), 'rule_id': 'ach_trash'}

            for keyword in self.ach_config.get('rent_keywords', []):
                if keyword.upper() in notels_upper:
                    return {'result': 'classified', 'description': notels.strip(), 'rule_id': 'ach_rent'}

        # Check vendor-specific patterns in notels (for rows where notels IS the description)
        vendor_specific = self.ach_config.get('vendor_specific', {})
        for vendor_keyword, config in vendor_specific.items():
            if vendor_keyword.upper() in notels_upper or vendor_keyword.upper() in descripcion_upper:
                if 'description' in config:
                    return {'result': 'classified', 'description': config['description'], 'rule_id': 'ach_vendor'}

        # Check employee name patterns directly in descripcion
        if agencia_upper == 'COMPENSACION GUATE ACH':
            for emp_pattern, qb_desc in self.ach_config.get('vendor_specific', {}).items():
                if emp_pattern.title() in notels or emp_pattern.title() in descripcion:
                    if isinstance(qb_desc, dict):
                        return {'result': 'classified', 'description': notels.strip(), 'rule_id': 'ach_employee'}

        return None

    def _extract_name_from_notels(self, notels: str, keyword: str) -> str:
        """Extract employee name adjacent to keyword in notels."""
        # e.g. "Melvin Payroll" → "Melvin Payroll"
        notels_upper = notels.upper()
        keyword_upper = keyword.upper()
        idx = notels_upper.find(keyword_upper)
        if idx > 0:
            # Get everything before the keyword, strip whitespace
            before = notels[:idx].strip()
            return f"{before} {keyword}".strip()
        return keyword

    def parse_row(self, row: dict, month_override: str = None) -> Optional[dict]:
        """Parse a single CSV row and classify it."""
        descripcion = row.get('Descripción', row.get('Descripción', ''))
        agencia = row.get('Agencia', '')
        notels = row.get('Notels', '')
        debito = row.get('Débito', '')
        credito = row.get('Crédito', '')
        fecha = row.get('Fecha', '')
        referencia = row.get('Referencia', '')

        # Parse date
        parsed_date = self.parse_date(fecha, month_override)
        if not parsed_date:
            return None

        # Calculate net amount
        amount = self.get_net_amount(debito, credito)
        if amount is None:
            return None

        # Match to category (pass amount for credit/debit rules)
        match = self.match_rule(descripcion, agencia, notels, amount)

        if match['result'] == 'exclude':
            self.excludes += 1
            return None

        if match['result'] == 'unclassified':
            self.unclassified += 1
        else:
            self.classified += 1

        return {
            'date': parsed_date,
            'description': match['description'],
            'amount': amount,
            'raw_descripcion': descripcion,
            'agencia': agencia,
            'referencia': referencia,
            'rule_id': match['rule_id']
        }

    def parse_file(self, csv_path: str) -> list:
        """Parse the entire CSV file."""
        results = []
        month_override = None

        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            rows = list(reader)
        
        # Find the actual data header row (contains '#', 'Fecha', 'Referencia', etc.)
        header_row = None
        for i, row in enumerate(rows):
            if row and len(row) > 2 and row[0].strip() == '#':
                header_row = i
                break
        
        if header_row is None:
            print("Warning: Could not find data header row, using default parsing")
            # Fall back to DictReader
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if 'Month' in row and row['Month'].strip():
                        month_override = row['Month'].strip().lstrip('0')
                    parsed = self.parse_row(row, month_override)
                    if parsed:
                        results.append(parsed)
            return results
        
        # Get headers
        headers = rows[header_row]
        
        # Find column indices for expected fields
        col_map = {}
        for idx, h in enumerate(headers):
            h_clean = h.strip()
            if h_clean in ['#', 'Fecha', 'Referencia', 'Descripción', 'Débito', 'Crédito', 'Saldo', 'Agencia', 'Notes', 'Notels']:
                col_map[h_clean] = idx
        
        # Also handle case-sensitive variants
        if 'Descripción' not in col_map:
            for h in headers:
                if 'Descripci' in h:  # Handle encoding variations
                    col_map['Descripción'] = headers.index(h)
        
        # Extract month from header area if present
        for row in rows[:header_row]:
            for cell in row:
                if 'Enero' in cell or 'Febrero' in cell or 'Marzo' in cell:
                    # Extract month
                    months = {'Enero': '01', 'Febrero': '02', 'Marzo': '03', 'Abril': '04',
                             'Mayo': '05', 'Junio': '06', 'Julio': '07', 'Agosto': '08',
                             'Septiembre': '09', 'Octubre': '10', 'Noviembre': '11', 'Diciembre': '12'}
                    for m, m_num in months.items():
                        if m in cell:
                            month_override = m_num
                            break
        
        # Parse data rows
        for row in rows[header_row + 1:]:
            if not row or len(row) < 5:
                continue
            
            # Build dict from columns
            row_dict = {}
            for col_name, idx in col_map.items():
                if idx < len(row):
                    row_dict[col_name] = row[idx].strip()
            
            if row_dict:
                parsed = self.parse_row(row_dict, month_override)
                if parsed:
                    results.append(parsed)

        return results

    def write_output(self, results: list, output_path: str):
        """Write QB-ready CSV output."""
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Date', 'Description', 'Amount'])
            for row in results:
                # QB uses negative for expenses, positive for income
                writer.writerow([row['date'], row['description'], f"{row['amount']:.2f}"])

    def write_report(self, results: list, report_path: str):
        """Write detailed classification report for review."""
        with open(report_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Date', 'Description', 'Amount', 'Rule Applied', 'Raw Descripcion', 'Agencia'])
            for row in results:
                writer.writerow([
                    row['date'],
                    row['description'],
                    f"{row['amount']:.2f}",
                    row['rule_id'] or 'UNCLASSIFIED',
                    row['raw_descripcion'],
                    row['agencia']
                ])

    def print_summary(self):
        """Print classification summary."""
        total = self.excludes + self.classified + self.unclassified
        print(f"\nClassification Summary:")
        print(f"  Excluded:  {self.excludes}")
        print(f"  Classified: {self.classified}")
        print(f"  Unclassified: {self.unclassified}")
        print(f"  Total processed: {total}")
        if total > 0:
            print(f"  Auto-match rate: {self.classified/(total)*100:.1f}%")

        unclass = [r for r in getattr(self, '_last_results', []) if not r.get('rule_id')]
        if unclass:
            print(f"\nUnclassified ({len(unclass)}):")
            for r in unclass[:10]:
                print(f"  [{r['date']}] {r['description']} ({r['raw_descripcion'][:40]}) / {r['agencia']}")


def main():
    parser = argparse.ArgumentParser(description='Parse BAC Guatemala bank CSV for QB import')
    parser.add_argument('input', help='Input statement CSV file path')
    parser.add_argument('--detailed', '-d', help='Detailed ACH batch XLS file path (for debit matching)')
    parser.add_argument('--output', '-o', help='Output CSV path (QB import format)')
    parser.add_argument('--report', '-r', help='Classification report CSV path')
    parser.add_argument('--map', '-m', default=None, help='Category map JSON path')

    args = parser.parse_args()

    script_dir = Path(__file__).parent
    map_path = args.map or str(script_dir / 'category_map.json')

    # Initialize parser with optional detailed XLS for debit matching
    p = BankCSVParser(map_path, args.detailed)
    results = p.parse_file(args.input)
    p._last_results = results

    # Determine output paths
    input_stem = Path(args.input).stem
    default_output = script_dir / f"{input_stem}_qbupload.csv"
    default_report = script_dir / f"{input_stem}_report.csv"

    output_path = args.output or str(default_output)
    report_path = args.report or str(default_report)

    p.write_output(results, output_path)
    print(f"QB upload CSV written to: {output_path}")

    p.write_report(results, report_path)
    print(f"Classification report written to: {report_path}")

    p.print_summary()


if __name__ == '__main__':
    main()
