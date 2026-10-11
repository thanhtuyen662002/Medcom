"""Generate fixed inputs for the source-backed remaining CUD/workflow forms."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'inventories/erp/20261011/cud-workflow-catalog.json'
OUTPUT = ROOT / 'src/backend/Medcom.Contracts/ErpWorkflowInputs.cs'


def name(module, section):
    return 'Erp' + ''.join(word.title() for word in module.split('-')) + section.title() + 'Input'


def generate():
    screens = json.loads(SOURCE.read_text(encoding='utf-8'))['screens']
    lines = ['// Generated from inventories/erp/20261011/cud-workflow-catalog.json.',
             'using System.Text.Json.Serialization;', 'namespace Medcom.Contracts;', '',
             'public static class ErpWorkflowInputs', '{',
             '    public static Type? Type(string module, string section) => (module, section) switch', '    {']
    for screen in screens:
        for section in screen['fields']:
            if section not in ('history', 'discrepancies', 'requests'):
                lines.append(f'        ("{screen["id"]}","{section}") => typeof({name(screen["id"],section)}),')
    lines += ['        _ => null', '    };', '}', '']
    for screen in screens:
        for section, fields in screen['fields'].items():
            if section in ('history', 'discrepancies', 'requests'):
                continue
            lines += ['[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]',
                      f'public sealed record {name(screen["id"],section)}', '{']
            for field in fields:
                if not field['writable']:
                    continue
                sql_type = field['type']
                value_type = {'bit': 'bool', 'int': 'int', 'smallint': 'short', 'tinyint': 'byte',
                              'bigint': 'long', 'float': 'double', 'real': 'float'}.get(sql_type, 'string')
                nullable = '?' if field['nullable'] else ''
                required = '' if field['nullable'] else 'required '
                prop = field['name'][0].upper() + field['name'][1:]
                lines += [f'    [JsonPropertyName("{field["name"]}")]',
                          f'    public {required}{value_type}{nullable} {prop} {{ get; init; }}']
            lines += ['}', '']
    return '\n'.join(lines)


if __name__ == '__main__':
    OUTPUT.write_text(generate(), encoding='utf-8', newline='\n')
    print('Generated finite workflow inputs; no SQL, private source or business rows.')
