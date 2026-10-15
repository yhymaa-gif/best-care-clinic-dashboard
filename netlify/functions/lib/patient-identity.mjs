const cleanText = (value, max = 120) => String(value ?? '').trim().slice(0, max);

export const normalizePatientFile = value => {
  const latinDigits = cleanText(value, 40)
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  const compact = latinDigits.toUpperCase().replace(/[\s,،٬-]+/g, '');
  const normalized = /^\d+\.0+$/.test(compact) ? compact.replace(/\.0+$/, '') : compact;
  return normalized && !/^0+$/.test(normalized) ? normalized : '';
};

export const normalizePatientPhone = value => {
  const digits = cleanText(value, 20).replace(/\D/g, '');
  if (/^009665\d{8}$/.test(digits)) return `0${digits.slice(5)}`;
  if (/^9665\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^5\d{8}$/.test(digits)) return `0${digits}`;
  return digits;
};

export const normalizePatientNationalId = value => {
  const digits = cleanText(value, 20).replace(/\D/g, '').slice(0, 10);
  return digits.length === 10 ? digits : '';
};

export const patientIdentityKeys = patient => {
  const file = normalizePatientFile(patient?.fileNo ?? patient?.file);
  const nationalId = normalizePatientNationalId(patient?.nationalId);
  // A household may share a phone. Contact details must never join records.
  return [...new Set([
    file ? `file:${file}` : '',
    nationalId ? `national:${nationalId}` : ''
  ].filter(Boolean))];
};

const duplicatePairKey = (left, right) => [String(left || ''), String(right || '')].sort().join('|');

export const duplicatePatientIdentityPairs = patients => {
  const owners = new Map(), pairs = new Set();
  for (const patient of Array.isArray(patients) ? patients : []) {
    const id = String(patient?.id || '').trim();
    if (!id) continue;
    for (const alias of patientIdentityKeys(patient)) {
      if (!owners.has(alias)) owners.set(alias, new Set());
      owners.get(alias).add(id);
    }
  }
  for (const [alias, identityOwners] of owners) {
    const ids = [...identityOwners].sort();
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        pairs.add(`${alias}|${duplicatePairKey(ids[left], ids[right])}`);
      }
    }
  }
  return pairs;
};

export const newlyIntroducedDuplicateIdentity = (before, after) => {
  const previous = duplicatePatientIdentityPairs(before);
  return [...duplicatePatientIdentityPairs(after)].find(pair => !previous.has(pair)) || '';
};

export const cleanDeletedPatientIds = values => [...new Set((Array.isArray(values) ? values : [])
  .map(value => String(value || '').trim().slice(0, 80))
  .filter(Boolean))];

export const isPlaceholderFileAlias = value => /^file:0+$/i.test(String(value || '').trim());
