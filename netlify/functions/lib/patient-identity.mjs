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
  const phone = normalizePatientPhone(patient?.mobile ?? patient?.phone);
  const nationalId = normalizePatientNationalId(patient?.nationalId);
  return [...new Set([
    file ? `file:${file}` : '',
    phone ? `phone:${phone}` : '',
    nationalId ? `national:${nationalId}` : ''
  ].filter(Boolean))];
};

export const isPlaceholderFileAlias = value => /^file:0+$/i.test(String(value || '').trim());
