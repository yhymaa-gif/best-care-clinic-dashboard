import { getStore } from "@netlify/blobs";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate",
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

export default async (request) => {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!validDate(date)) return response({ error: "Invalid date" }, 400);

  const store = getStore({ name: "clinic-dashboard-days", consistency: "strong" });
  const key = `days/${date}`;

  if (request.method === "GET") {
    const state = await store.get(key, { type: "json", consistency: "strong" });
    if (!state) return response({ exists: false, date, patients: [], notes: "", revision: 0, updatedAt: 0 });
    return response({ exists: true, ...state });
  }

  if (request.method === "PUT" || request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return response({ error: "Invalid JSON" }, 400); }
    if (!Array.isArray(body.patients)) return response({ error: "patients must be an array" }, 400);
    if (body.patients.length > 250) return response({ error: "Too many patients" }, 400);

    const existing = await store.get(key, { type: "json", consistency: "strong" });
    const state = {
      date,
      patients: body.patients.map((p) => ({
        id: p.id,
        name: String(p.name || "").slice(0, 80),
        file: String(p.file || "").slice(0, 40),
        start: String(p.start || "").slice(0, 8),
        end: String(p.end || "").slice(0, 8),
        procedure: String(p.procedure || "").slice(0, 160),
        status: ["waiting", "active", "done", "late", "cancel"].includes(p.status) ? p.status : "waiting",
      })),
      notes: String(body.notes || "").slice(0, 5000),
      clientId: String(body.clientId || "").slice(0, 100),
      revision: Number(existing?.revision || 0) + 1,
      updatedAt: Date.now(),
    };

    await store.setJSON(key, state);
    return response({ ok: true, revision: state.revision, updatedAt: state.updatedAt });
  }

  return response({ error: "Method not allowed" }, 405);
};
