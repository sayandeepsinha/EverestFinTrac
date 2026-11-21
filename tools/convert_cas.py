#!/usr/bin/env python3
"""Convert an original CAMS/KFintech CAS PDF to minimal JSON locally."""
import argparse
import getpass
import json
import os
from pathlib import Path
import sys


def sanitized_statement(document):
    if document.get('file_type') not in ('CAMS', 'KFINTECH'):
        raise ValueError('Only CAMS and KFintech statements are supported.')
    result = {'file_type': document['file_type'], 'folios': [], 'parse_warnings': document.get('parse_warnings', [])}
    for folio in document.get('folios', []):
        schemes = []
        for scheme in folio.get('schemes', []):
            valuation = scheme.get('valuation') or {}
            schemes.append({key: scheme.get(key) for key in ('scheme', 'amfi', 'close', 'close_calculated')} | {
                'valuation': {key: valuation.get(key) for key in ('date', 'cost')}
            })
        result['folios'].append({'schemes': schemes})
    # Warnings may contain personal information. Keep their existence, not their text.
    result['parse_warnings'] = ['Statement parser reported warnings.'] if result['parse_warnings'] else []
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('statement', type=Path, help='Original CAMS or KFintech CAS PDF')
    parser.add_argument('output', type=Path, help='New JSON file for import')
    args = parser.parse_args()
    if not args.statement.is_file() or args.statement.suffix.lower() != '.pdf':
        parser.error('Choose an existing original PDF statement.')
    if args.output.exists():
        parser.error('Output already exists. Choose a new file name.')
    try:
        import casparser
    except ImportError:
        parser.error('Install casparser 1.4.1 in your Python environment first.')
    if not sys.stdin.isatty():
        parser.error('Run this tool in an interactive terminal for hidden password entry.')
    password = getpass.getpass('Statement password (input hidden): ')
    try:
        raw = casparser.read_cas_pdf(str(args.statement), password, output='json')
        safe = sanitized_statement(json.loads(raw))
        data = json.dumps(safe, ensure_ascii=False, indent=2)
        descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(data)
    except Exception as error:
        print(f'Conversion failed: {type(error).__name__}. Check the original statement and password.', file=sys.stderr)
        return 1
    finally:
        password = None
    print('Created a holdings-only JSON file. Review it in the tracker and delete it when finished.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
