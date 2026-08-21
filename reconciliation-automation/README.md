# Reconciliation Automation - Wander Boutique Hotel

## What this is

A CSV parser that takes raw BAC Guatemala bank exports and produces a QB-ready upload file.

**Input:** Raw BAC CSV export (multiple months, with headers, formatting artifacts)
**Output:** `Date, Description, Amount` CSV ready for QuickBooks drag-and-drop import

## Quick Start

```bash
python3 parser.py <path_to_bank_csv> [--output <output_path>]
```

Output:
- `*_qbupload.csv` — QB-ready import file
- `*_report.csv` — full classification breakdown

## How it works

1. Parse raw CSV (handle quotes, commas, missing months in some rows)
2. Normalize dates to `YYYY-MM-DD`
3. Combine Débito/Crédito into signed net amount
4. Match each row against the category map (pattern → QB description)
5. Write QB upload CSV

## Category Map

Rules are in `category_map.json`. Key patterns:

| Pattern | QB Description |
|---------|---------------|
| VISANET / NEONET / ACEPTA / Crédito Pago Diario | Restaurant/Bar Sales |
| DEBITO ACH → employee names | [Name] Payroll |
| DEBITO ACH → employee + Tip | [Name] Tip |
| DEBITO ACH → employee + Aguinaldo | [Name] Aguinaldo |
| DEBITO ACH → Pricemart | Inventory - Food |
| DEBITO ACH → Bread | Inventory - Bread |
| DEPOSITO EN EFECTIVO | Cash Deposit |
| TRANSFERENCIA DE FONDOS BC | Transfer between accounts |
| DECLARAGUATE TESORERIA | Taxes |
| Owner cash infusion/deposit | Owner Cash Infusion |
| [rows marked Exclude] | skipped |

## Performance

On Jan-Apr 2024 sample data (364 transactions):
- **99.5% auto-classification rate**
- 2 rows excluded
- 0 unclassified

## Current limitations

- Only tested against BAC Guatemala CSV format (G&T format not yet available)
- Employee names are matched literally — typos in bank data won't match (e.g., "Melving" vs "Melvin")
- Inter-account transfers are flagged but not yet split by source/destination account
- G&T USD account CSV not yet supported (different format expected)

## Next steps

- [ ] Add G&T CSV format support
- [ ] Add email enrichment lookup for unclassified transactions
- [ ] Add QB rules generator (creates .QBJ rules file from category map)
- [ ] Add transfer detection: match debits from one account to credits in another
- [ ] Build web interface (streamlit) for non-technical client use
