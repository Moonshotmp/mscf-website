// GET /.netlify/functions/hyrox-roster?key=<HYROX_ADMIN_KEY>[&format=json][&all=1]
// Heat sheets for race day: one CSV row per athlete. Paid teams only unless all=1.
import crypto from 'node:crypto';
import { HEATS, ADDON_LABELS, listTeams, normalizeAddons, heatById } from './_shared/hyrox.mjs';

const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || '';
  const expected = process.env.HYROX_ADMIN_KEY || '';
  const ok = expected && key.length === expected.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  if (!ok) return new Response('Not found', { status: 404 });

  const all = url.searchParams.get('all') === '1';
  const teams = (await listTeams()).filter(t => all || t.status === 'paid').filter(t => !t.test_mode || all);
  const heatIdx = Object.fromEntries(HEATS.map((h, i) => [h.id, i]));
  teams.sort((a, b) => (heatIdx[a.heat_id] ?? 99) - (heatIdx[b.heat_id] ?? 99) || a.created_at.localeCompare(b.created_at));

  const rows = [];
  for (const t of teams) {
    const heat = heatById(t.heat_id);
    const certsFor = (role) => (t.certificates || []).filter(c => c.role === role).map(c => `${c.code} (${ADDON_LABELS[c.type]})`).join('; ');
    for (const role of ['registrant', 'partner']) {
      const a = t.athletes[role];
      const ad = normalizeAddons(a.addons);
      rows.push({
        heat: heat?.label || t.heat_id, team_id: t.team_id, status: t.status, role,
        name: a.name, email: a.email, phone: a.phone, member: a.member ? 'Y' : '',
        emergency_contact: a.emergency_name ? `${a.emergency_name} ${a.emergency_phone || ''}` : '',
        shirt: ad.shirt ? (a.shirt_size || '?') : '',
        dexa: (ad.dexa || ad.baseline) ? 'Y' : '', blood_panel: (ad.labs || ad.baseline) ? 'Y' : '',
        certificates: certsFor(role),
        waiver_signed: a.waiver?.signed_at || '',
        partner_confirmed: role === 'partner' ? (a.confirmed_at || '') : '',
        paid_at: t.paid_at || '', team_total_usd: ((t.amount_cents || 0) + (t.partner_orders || []).reduce((s, o) => s + (o.amount_cents || 0), 0)) / 100,
        test_mode: t.test_mode ? 'Y' : ''
      });
    }
  }

  if (url.searchParams.get('format') === 'json') {
    return new Response(JSON.stringify({ count_teams: teams.length, rows }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  const cols = Object.keys(rows[0] || { heat: 1 });
  const out = [cols.join(','), ...rows.map(r => cols.map(c => csv(r[c])).join(','))].join('\n');
  return new Response(out, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="hyrox-sim-roster.csv"', 'Cache-Control': 'no-store' } });
};

export const config = { path: '/.netlify/functions/hyrox-roster' };
