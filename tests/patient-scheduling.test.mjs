import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('patient record and search results expose the existing-patient appointment action', async () => {
  const [html, dashboard, styles] = await Promise.all([read('index.html'), read('dashboard.js'), read('dashboard.css')]);
  assert.match(html, /id="patientProfileScheduleBtn"/);
  assert.match(html, /id="patientFormDirectorySearchBtn"/);
  assert.match(html, /id="patientScheduleModal"/);
  assert.match(html, /id="patientScheduleDate" type="date"/);
  assert.match(dashboard, /data-identity-schedule/);
  assert.match(dashboard, /function openPatientSchedule\(/);
  assert.match(dashboard, /function confirmPatientSchedule\(/);
  assert.match(dashboard, /bestcare_appointment_entry_draft_v1/);
  assert.match(dashboard, /appointment-entry\.html\?date=/);
  assert.match(dashboard, /if\(!wasEditing&&targetDate!==selectedDate\)await setDate\(targetDate\)/);
  assert.match(dashboard, /name:draft\.fullName,file:draft\.fileNo,phone:draft\.mobile/);
  assert.match(styles, /\.patient-profile-schedule-action/);
  assert.match(styles, /\.patient-schedule-card/);
  assert.match(styles, /#savePatientBtn\.patient-form-ready/);
});

test('patient scheduling requires a complete identity before opening the appointment form', async () => {
  const dashboard = await read('dashboard.js');
  assert.match(dashboard, /completeName:patient\.fullName\.split/);
  assert.match(dashboard, /completeFile:\/\^\\d\+\$\/.test\(patient\.fileNo\)/);
  assert.match(dashboard, /completeMobile:\/\^05\\d\{8\}\$\//);
  assert.match(dashboard, /أكمل بيانات المريض أولًا/);
});

test('directory import reports file-number name corrections and completed fields', async () => {
  const [source, dashboard] = await Promise.all([read('netlify/functions/lib/patient-directory.mjs'), read('dashboard.js')]);
  assert.match(source, /matchedByFile/);
  assert.match(source, /correctedNames/);
  assert.match(source, /completedFields/);
  assert.match(dashboard, /أسماء صُححت/);
  assert.match(dashboard, /بيانات استُكملت/);
});
