/** Prepare review-only candidates from CAMS/KFintech casparser JSON.
 * Never include investor identity or folio identifiers in the result.
 */
export function prepareCasCandidates(document) {
  if (!document || !['CAMS', 'KFINTECH'].includes(document.file_type) || !Array.isArray(document.folios)) {
    throw new Error('Expected a CAMS or KFintech casparser JSON statement.');
  }
  const candidates = [];
  const issues = [];
  const occurrences = new Map();
  for (const folio of document.folios) {
    if (!Array.isArray(folio.schemes)) throw new Error('Invalid schemes in statement.');
    for (const scheme of folio.schemes) {
      const code = String(scheme?.amfi || '');
      if (/^\d{5,8}$/.test(code)) occurrences.set(code, (occurrences.get(code) || 0) + 1);
    }
  }
  const warnedDuplicates = new Set();
  const decimal = value => typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
  for (const folio of document.folios) {
    if (!Array.isArray(folio.schemes)) throw new Error('Invalid schemes in statement.');
    for (const scheme of folio.schemes) {
      if (!scheme || typeof scheme !== 'object') throw new Error('Invalid holding in statement.');
      const units = decimal(scheme.close);
      const cost = decimal(scheme.valuation?.cost);
      const code = String(scheme.amfi || '');
      if (!Number.isFinite(units) || units <= 0 || !Number.isFinite(cost) || cost < 0 || !/^\d{5,8}$/.test(code)) {
        issues.push('A holding needs a valid AMFI code, positive closing units and total purchase cost.');
        continue;
      }
      if (occurrences.get(code) > 1) {
        if (!warnedDuplicates.has(code)) issues.push('A scheme appears in multiple folios. Add these holdings manually after reviewing each folio.');
        warnedDuplicates.add(code);
        continue;
      }
      if (scheme.close_calculated != null) {
        const calculated = decimal(scheme.close_calculated);
        if (!Number.isFinite(calculated) || Math.abs(calculated - units) > 0.001) {
          issues.push('A holding has a closing balance that does not match its calculated balance. Review the statement.');
          continue;
        }
      }
      if (!Number.isFinite(cost / units)) {
        issues.push('A holding has an invalid calculated average cost.');
        continue;
      }
      candidates.push({kind:'fund', symbol:code, name:String(scheme.scheme || code), shares:units, cost:cost / units, statementDate:scheme.valuation?.date || null});
    }
  }
  if (Array.isArray(document.parse_warnings) && document.parse_warnings.length) {
    issues.push('The parser reported reconciliation warnings. Check the original statement before importing.');
  }
  return {candidates, issues};
}
