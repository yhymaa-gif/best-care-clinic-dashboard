// Groups individual procedures into clinical types for statistics.
// Known catalog codes map directly; custom names fall back to keyword rules.
export const PROCEDURE_TYPES = Object.freeze([
  { id: 'diagnostic', label: 'الكشف والتشخيص', en: 'Exams & diagnostics' },
  { id: 'fillings', label: 'الحشوات', en: 'Fillings' },
  { id: 'endo', label: 'علاج العصب', en: 'Root canal' },
  { id: 'perio', label: 'التنظيف واللثة', en: 'Cleaning & gums' },
  { id: 'surgery', label: 'الخلع والجراحة', en: 'Extraction & surgery' },
  { id: 'implant', label: 'الزراعة', en: 'Implants' },
  { id: 'prosthetic', label: 'التيجان والتركيبات', en: 'Crowns & prosthetics' },
  { id: 'cosmetic', label: 'التجميل', en: 'Cosmetic' },
  { id: 'other', label: 'إجراءات أخرى', en: 'Other' },
]);

const BY_CODE = Object.freeze({
  examination: 'diagnostic', 'smile-analysis': 'diagnostic', 'cbct-scan': 'diagnostic',
  'cosmetic-filling': 'fillings', 'post-rct-filling': 'fillings',
  'root-canal': 'endo', 'root-canal-retreatment': 'endo', 'remove-post': 'endo',
  'cleaning-standard': 'perio', 'cleaning-gbt': 'perio', 'periodontal-treatment': 'perio',
  extraction: 'surgery', 'bone-graft': 'surgery', 'sinus-lift': 'surgery',
  'implant-surgery': 'implant', 'implant-uncovering': 'implant', 'healing-abutment': 'implant',
  'implant-impression': 'implant', 'implant-temporary': 'implant', 'implant-prosthetic-abutment': 'implant', 'implant-crown': 'implant',
  'place-post': 'prosthetic', 'remove-crown': 'prosthetic', 'recement-crown': 'prosthetic', 'ceramic-crown': 'prosthetic', temporary: 'prosthetic',
  'ceramic-veneer': 'cosmetic', 'smile-design': 'cosmetic', 'whitening-trays': 'cosmetic',
});

// Order matters: the first matching rule wins (implant before crown, etc.).
const KEYWORDS = [
  ['implant', /زراع|implant|fixture|abutment|دعامة/i],
  ['endo', /عصب|endo|rct|root\s*canal|وتد/i],
  ['cosmetic', /فينير|veneer|تبييض|whiten|bleach|ابتسام|smile|lumineer/i],
  ['prosthetic', /تاج|تيجان|crown|bridge|جسر|تركيب|طقم|denture|مؤقت|temporar/i],
  ['fillings', /حشو|filling|composite|restor/i],
  ['perio', /تنظيف|clean|scal|لثة|perio|gbt|polish/i],
  ['surgery', /خلع|extract|جراح|surg|تطعيم|graft|sinus|جيب/i],
  ['diagnostic', /كشف|فحص|exam|consult|استشار|أشعة|اشعة|x-?ray|cbct|تشخيص/i],
];

export function procedureType(code = '', name = '') {
  const cleanCode = String(code || '').trim().toLowerCase();
  if (BY_CODE[cleanCode]) return BY_CODE[cleanCode];
  const text = `${cleanCode} ${String(name || '')}`;
  for (const [type, pattern] of KEYWORDS) if (pattern.test(text)) return type;
  return 'other';
}

export const typeLabel = id => PROCEDURE_TYPES.find(type => type.id === id) || PROCEDURE_TYPES.at(-1);
