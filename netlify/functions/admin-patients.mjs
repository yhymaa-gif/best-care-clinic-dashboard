import { getStore } from '@netlify/blobs';
import { apiHeaders, requireUser } from './lib/session.mjs';
import { enrichPatientNameFromDirectory, getPatientDirectory } from './lib/patient-directory.mjs';

const headers = apiHeaders('GET,OPTIONS');
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const clinicPattern = /^clinic-([1-9]|1[0-5])$/;
const store = name => getStore({ name, consistency: 'strong' });

const defaultClinics = () => Array.from({ length: 15 }, (_, index) => ({
  id: `clinic-${index + 1}`,
  name: `العيادة ${index + 1}`,
  doctorName: '',
  roomNumber: String(index + 1),
  active: index === 0,
}));

function activeClinics(saved) {
  const base = defaultClinics();
  const incoming = new Map((Array.isArray(saved?.clinics) ? saved.clinics : [])
    .filter(item => clinicPattern.test(String(item?.id || '')))
    .map(item => [String(item.id), item]));
  return base.map(fallback => {
    const value = incoming.get(fallback.id);
    return value ? {
      id: fallback.id,
      name: String(value.name || fallback.name).trim().slice(0, 80),
      doctorName: String(value.doctorName || '').trim().slice(0, 80),
      roomNumber: String(value.roomNumber || fallback.roomNumber).trim().slice(0, 20),
      active: fallback.id === 'clinic-1' ? true : Boolean(value.active),
    } : fallback;
  }).filter(clinic => clinic.active);
}

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405);

  const auth = await requireUser(request);
  if (!auth.ok) return reply({ error: auth.error }, auth.status);
  if (auth.user?.role !== 'admin') return reply({ error: 'Admin role required' }, 403);

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  if (!validDate(date)) return reply({ error: 'Invalid date' }, 400);

  const configStore = store('clinic-dashboard-config');
  const dayStore = store('clinic-dashboard-days');
  const [savedClinics, patientDirectory] = await Promise.all([
    configStore.get('clinics', { type: 'json', consistency: 'strong' }),
    getPatientDirectory(),
  ]);
  const clinics = activeClinics(savedClinics);

  const records = await Promise.all(clinics.map(async clinic => {
    const key = clinic.id === 'clinic-1' ? `days/${date}` : `clinics/${clinic.id}/days/${date}`;
    const state = await dayStore.get(key, { type: 'json', consistency: 'strong' });
    return {
      clinic,
      patients: Array.isArray(state?.patients)
        ? state.patients.map(patient => enrichPatientNameFromDirectory(patientDirectory, patient))
        : [],
      revision: Number(state?.revision || 0),
      updatedAt: Number(state?.updatedAt || 0),
    };
  }));

  return reply({
    date,
    records,
    totalPatients: records.reduce((sum, record) => sum + record.patients.length, 0),
    updatedAt: Date.now(),
  });
};
