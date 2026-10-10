"""Generate technical FE tables from the finite sanitized catalog, with no DB access."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'inventories/erp/20261010/six-screen-catalog.json'
OUTPUT = ROOT / 'docs/backend/ERP_SCREEN_FIELDS_AND_LOOKUPS_20261010.md'


def cell(value):
    return ('—' if value is None or value == '' else str(value)).replace('|', '\\|').replace('\r', ' ').replace('\n', ' ')


def lookup_id(grid, column):
    return {None: 'header', '': 'header', 'grdChitiet': 'lines', 'grdListDoc': 'list'}.get(grid, grid) + '.' + column


def generate():
    catalog = json.loads(SOURCE.read_text(encoding='utf-8'))
    lines = ['# Phụ lục field và dropdown của 7 form ERP', '',
             'Generated from `inventories/erp/20261010/six-screen-catalog.json` by '
             '`tools/source/generate_erp_screen_handoff.py`. No SQL definitions or real rows.', '',
             '417 fields / 106 lookup bindings. `writable` means accepted in the fixed module draft input; '
             'state, permission and target acceptance still apply. Parameters are exact native names separated by `;`. '
             'Pass only declared context keys. NULL is not a missing JSON field in full read responses.', '',
             'See [integration guide](BE_FE_SIX_SCREEN_COMMANDS_20261010.md) for routes, actions, payloads and UNKNOWN gates.', '']
    for screen in catalog['screens']:
        lines += [f"## {screen['id']} — {screen['caption']}", '',
                  f"Evidence: catalog `screens[id={screen['id']}]`; menu `{screen['menuId']}`, form `{screen['formId']}`.", '']
        for section, fields in screen['fields'].items():
            table = screen.get({'header': 'headerTable', 'lines': 'lineTable', 'history': 'historyTable', 'comparison': 'comparisonTable'}[section])
            lines += [f'### {section} — dbo.{table}', '',
                      '| JSON field | SQL column | SQL type | Nullable | Writable |',
                      '|---|---|---|---|---|']
            for field in fields:
                lines += [f"| `{field['name']}` | `{field['column']}` | {cell(field['type'] + (field.get('typeArguments') or ''))} | {str(field['nullable']).lower()} | {str(field['writable']).lower()} |"]
            lines += ['']
        lines += ['### Dropdown / dropselect', '',
                  '| lookupId | Value | Label | Context parameters | Required context | Linked columns | Multi | Disabled |',
                  '|---|---|---|---|---|---|---|---|']
        for row in screen['lookups']:
            lines += ['| ' + ' | '.join(cell(value) for value in [
                lookup_id(row.get('GridName'), row['ColumnID']), row['ValueColumn'], row['DisplayColumn'],
                row.get('ParaArr'), row.get('ParaRequireArr'), row.get('LinkColumn'),
                str(bool(row.get('IsMultiSelect'))).lower(), str(bool(row.get('IsDisable'))).lower()]) + ' |']
        lines += ['']
    return '\n'.join(lines)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    options = parser.parse_args()
    text = generate()
    if options.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8') != text:
            raise SystemExit('ERP FE appendix drift')
        print('PASS: current ERP FE appendix')
    else:
        OUTPUT.write_text(text, encoding='utf-8', newline='\n')
        print('ERP FE appendix generated from sanitized metadata')
