import importlib.util
import json
from pathlib import Path
from casparser.types import CASData

spec = importlib.util.spec_from_file_location('converter', Path(__file__).parents[1] / 'tools' / 'convert_cas.py')
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)
model = CASData.model_validate({
    'file_type': 'CAMS', 'cas_type': 'DETAILED',
    'statement_period': {'from': '01-Apr-2025', 'to': '31-Mar-2026'},
    'investor_info': {'name': 'SYNTHETIC NAME', 'email': 'private@example.invalid', 'address': 'Private', 'mobile': '123'},
    'folios': [{'folio': 'SECRET', 'amc': 'Example', 'PAN': 'SECRET', 'schemes': [{
        'scheme': 'Example Direct Growth', 'rta_code': 'TEST', 'rta': 'CAMS', 'amfi': '118834',
        'open': '0', 'close': '10.000', 'close_calculated': '10.000',
        'valuation': {'date': '2026-03-31', 'nav': '120', 'cost': '1000', 'value': '1200'}, 'transactions': []
    }]}], 'parse_warnings': ['SECRET']
})
safe = converter.sanitized_statement(json.loads(model.model_dump_json(by_alias=True)))
serialized = json.dumps(safe)
assert 'SECRET' not in serialized and 'private@example.invalid' not in serialized
assert safe['folios'][0]['schemes'][0]['close'] == '10.000'
assert safe['parse_warnings'] == ['Statement parser reported warnings.']
print('PASS: installed CASParser model serializes into a minimized converter output')

# Exercise the command entry point with a synthetic parser result and temporary files.
import contextlib
import io
import os
import sys
import tempfile
from unittest.mock import patch
import casparser

with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    pdf = root / 'synthetic.pdf'
    pdf.write_bytes(b'%PDF-synthetic')
    output = root / 'holdings.json'
    parser_json = model.model_dump_json(by_alias=True)
    with patch.object(sys, 'argv', ['convert_cas.py', str(pdf), str(output)]), \
         patch.object(sys.stdin, 'isatty', return_value=True), \
         patch.object(converter.getpass, 'getpass', return_value='test-password'), \
         patch.object(casparser, 'read_cas_pdf', return_value=parser_json) as read, \
         contextlib.redirect_stdout(io.StringIO()):
        assert converter.main() == 0
        read.assert_called_once_with(str(pdf), 'test-password', output='json')
    assert output.exists() and (output.stat().st_mode & 0o777) == 0o600
    assert 'SECRET' not in output.read_text()
    failed_output = root / 'failed.json'
    with patch.object(sys, 'argv', ['convert_cas.py', str(pdf), str(failed_output)]), \
         patch.object(sys.stdin, 'isatty', return_value=True), \
         patch.object(converter.getpass, 'getpass', return_value='wrong-password'), \
         patch.object(casparser, 'read_cas_pdf', side_effect=ValueError('Sensitive content')), \
         contextlib.redirect_stderr(io.StringIO()) as errors:
        assert converter.main() == 1
        assert 'Sensitive content' not in errors.getvalue()
    assert not failed_output.exists()
print('PASS: command creates a private file and suppresses sensitive parser errors')
