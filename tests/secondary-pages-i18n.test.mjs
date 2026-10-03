import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = name => readFileSync(join(root, name), 'utf8');
function translations(source, name) {
  const match = source.match(new RegExp(`const ${name}=(\\{[\\s\\S]*?\\});`));
  assert.ok(match, `${name} dictionary exists`);
  return vm.runInNewContext(`(${match[1]})`);
}

test('prescription language follows URL or saved dashboard preference and translates critical UI', () => {
  const html = read('prescription.html');
  const source = read('prescription.js');
  const dict = translations(source, 'RX_TRANSLATIONS');
  assert.match(source, /params\.get\('lang'\).*bestcare_lang/);
  assert.match(html, /id="languageToggle"/);
  assert.match(source, /document\.documentElement\.dir=language==='en'\?'ltr':'rtl'/);
  assert.match(source, /localStorage\.setItem\('bestcare_lang',language\)/);
  assert.match(source, /function whatsappText\(data\).*const en=language==='en'/);
  for (const key of ['المراجعة الطبية', 'اسم العلاج *', 'لا توجد وصفات سابقة محفوظة.', 'وصفة طبية', 'المريض:', 'رقم الملف:', 'تنبيه إلزامي']) assert.ok(dict[key], `missing ${key}`);
  assert.match(source, /esc\(patient\?\.name\|\|data\.patient\?\.name/);
});

test('treatment-plan registry translates statuses, filters, warnings and passes language to plans', () => {
  const html = read('treatment-plans.html');
  const source = read('treatment-plans.js');
  const dict = translations(source, 'PLAN_TRANSLATIONS');
  assert.match(html, /id="languageToggle"/);
  assert.match(source, /bestcare_lang/);
  assert.match(source, /view:'admin',lang:language/);
  assert.match(source, /formatDate\(record\.updatedAt\)/);
  assert.match(source, /esc\(record\.fullName/);
  for (const key of ['مركز الخطط العلاجية', 'جاهزة لمشاركة وتوقيع المريض', 'المريض لم يوقّع على موافقة التصوير', 'حالة الاعتماد', 'مشاركة الخطة والتوقيع', 'لا توجد خطط مطابقة للتصفية.']) assert.ok(dict[key], `missing ${key}`);
});
