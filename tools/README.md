# Local CAS conversion

This optional command-line tool converts original CAMS or KFintech CAS PDFs into a holdings-only JSON file for EverestFinTracker. The PDF and password are processed on your own computer. MF Central PDFs are not supported by the underlying parser. A JSON file can still contain sensitive investment details, so keep it private and delete it when no longer needed.

Install Python 3 and run these commands in a terminal from this folder:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install 'casparser==1.4.1'
.venv/bin/python convert_cas.py /path/to/original-statement.pdf /path/to/new-holdings.json
```

Enter the statement password at the hidden prompt. Open EverestFinTracker, choose **Import CAS data**, select the new JSON and review the candidates. The app flags duplicates and does not import unsupported or incomplete holdings automatically. Cost and units should be checked against the original statement. Delete the temporary JSON after use.

The tool was tested with synthetic parser output and its parser dependency was installed successfully. It has not been tested with a real statement. Documentation and supported formats: https://github.com/codereverser/casparser#supported-inputs
