// HYROX Race Simulation — shared module for all hyrox-* functions + the Stripe webhook.
//
// SINGLE SOURCE OF TRUTH for event constants (date, heats, pricing, clinic links).
// The public page fetches `/.netlify/functions/hyrox-config` and overwrites its
// static copy with these values, so edit HERE, not in the HTML.
//
// Not a Netlify function: lives under `_shared/` so the bundler does not treat it
// as an endpoint (only `<name>.mjs`, `<name>/<name>.mjs`, `<name>/index.mjs` are).

import Stripe from 'stripe';
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export const SITE_URL = process.env.URL || 'https://moonshotcrossfit.com';
export const PAGE_URL = `${SITE_URL}/hyrox/simulation/`;

// ─── Event ──────────────────────────────────────────────────────────────────
export const EVENT = {
  name: 'Moonshot HYROX Race Simulation',
  date_iso: '2026-10-03',
  date_label: 'Saturday, October 3, 2026',
  short_date: 'Sat, Oct 3',
  location_name: 'Moonshot CrossFit',
  address: '542 Busse Hwy, Park Ridge, IL 60068',
  timezone: 'America/Chicago',
  doors_open: '7:30 AM',
  briefing: '7:45 AM',
  warmup: '8:00 AM',
  // Per-division race-morning schedule. Singles run the first hour (Tom, 9/1),
  // so their doors/briefing are earlier; the legacy doors_open/briefing/warmup
  // above are the Doubles times and stay for any copy that predates divisions.
  schedule: {
    singles: { doors: '6:30 AM', briefing: '6:45 AM', first_heat: '7:00 AM' },
    doubles: { doors: '7:30 AM', briefing: '7:45 AM', warmup: '8:00 AM', first_heat: '8:10 AM' }
  },
  // Registration + partner add-on purchases close at end of day Oct 2 (Central).
  registration_closes_iso: '2026-10-03T04:59:59.000Z',
  registration_closes_label: 'Friday, October 2 at 11:59 PM',
  // Clinic certificates issued for this event are honored through this date.
  certificate_expires_label: 'December 31, 2026',
  contact_email: 'info@moonshotcrossfit.com',
  contact_phone: '(847) 850-7360'
};

// Heats: a new heat every 10 minutes, TWO entries per heat (one entry = one
// lane: a Singles athlete or a Doubles team). Times are Central (UTC-5 in Oct).
// Singles run the first hour, 7:00–7:50 (Tom, 9/1); Doubles from 8:10 as before.
export const HEATS = [
  { id: 's01', label: '7:00 AM',   start_iso: '2026-10-03T12:00:00.000Z', capacity: 2, division: 'singles' },
  { id: 's02', label: '7:10 AM',   start_iso: '2026-10-03T12:10:00.000Z', capacity: 2, division: 'singles' },
  { id: 's03', label: '7:20 AM',   start_iso: '2026-10-03T12:20:00.000Z', capacity: 2, division: 'singles' },
  { id: 's04', label: '7:30 AM',   start_iso: '2026-10-03T12:30:00.000Z', capacity: 2, division: 'singles' },
  { id: 's05', label: '7:40 AM',   start_iso: '2026-10-03T12:40:00.000Z', capacity: 2, division: 'singles' },
  { id: 's06', label: '7:50 AM',   start_iso: '2026-10-03T12:50:00.000Z', capacity: 2, division: 'singles' },
  { id: 'h01', label: '8:10 AM',   start_iso: '2026-10-03T13:10:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h02', label: '8:20 AM',   start_iso: '2026-10-03T13:20:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h03', label: '8:30 AM',   start_iso: '2026-10-03T13:30:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h04', label: '8:40 AM',   start_iso: '2026-10-03T13:40:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h05', label: '8:50 AM',   start_iso: '2026-10-03T13:50:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h06', label: '9:00 AM',   start_iso: '2026-10-03T14:00:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h07', label: '9:10 AM',   start_iso: '2026-10-03T14:10:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h08', label: '9:20 AM',   start_iso: '2026-10-03T14:20:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h09', label: '9:30 AM',   start_iso: '2026-10-03T14:30:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h10', label: '9:40 AM',   start_iso: '2026-10-03T14:40:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h11', label: '9:50 AM',   start_iso: '2026-10-03T14:50:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h12', label: '10:00 AM',  start_iso: '2026-10-03T15:00:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h13', label: '10:10 AM',  start_iso: '2026-10-03T15:10:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h14', label: '10:20 AM',  start_iso: '2026-10-03T15:20:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h15', label: '10:30 AM',  start_iso: '2026-10-03T15:30:00.000Z', capacity: 2, division: 'doubles' },
  { id: 'h16', label: '10:40 AM',  start_iso: '2026-10-03T15:40:00.000Z', capacity: 2, division: 'doubles' }
];

// ─── Pricing (cents) ────────────────────────────────────────────────────────
// Race entry is per athlete (MJ's doc: $25/athlete, members 60% off with code).
// Clinic add-ons are sold as CERTIFICATES at $25 under the clinic's regular price
// (regular clinic prices on prod 2026-08-25: DEXA $149, Comprehensive Blood Panel $285, Performance Baseline $405).
export const PRICES = {
  race_athlete:        2500,
  race_member_athlete: 1000,
  shirt:               2500,
  dexa:               12400,
  labs:               26000,
  baseline:           38000   // DEXA + Blood Panel for the same athlete (auto-applied)
};
export const REGULAR_PRICES = { dexa: 14900, labs: 28500, baseline: 40500 };

export const MEMBER_CODE = process.env.HYROX_MEMBER_CODE || 'MoonRox60';
export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];

// Clinic booker deep links. These slugs must exist as booking_configs on the
// Moonshot Medical tenant with requires_prepayment = FALSE (certificate holders
// already paid here). The certificate code rides in utm_campaign, which the
// clinic persists on the appointment row.
export const CLINIC_NAME = 'Moonshot Medical + Performance';
export const CLINIC_BOOK_BASE = process.env.HYROX_CLINIC_BOOK_BASE || 'https://moonshot.moonshotclinic.com/book';
export const BOOK_SLUGS = {
  dexa:     process.env.HYROX_BOOK_SLUG_DEXA     || 'hyrox-dexa',
  labs:     process.env.HYROX_BOOK_SLUG_LABS     || 'hyrox-labs',
  baseline: process.env.HYROX_BOOK_SLUG_BASELINE || 'hyrox-baseline'
};

export const ADDON_LABELS = {
  shirt: 'Event T-Shirt',
  dexa: 'DEXA Body Composition Scan',
  labs: 'Comprehensive Blood Panel',
  baseline: 'Performance Baseline (DEXA + Blood Panel)'
};

// How long an unpaid registration holds its heat slot (Stripe Checkout min expiry is 30 min).
export const HOLD_MINUTES = 35;

// ─── Stores ─────────────────────────────────────────────────────────────────
// Strong consistency: heat capacity is computed from list() in a different function
// instance than the one that wrote the team; Blobs' default (eventual) can lag ~60s.
export const teamsStore = () => getStore({ name: 'hyrox-teams', consistency: 'strong' });
export const ordersStore = () => getStore({ name: 'hyrox-orders', consistency: 'strong' });   // partner add-on purchases, keyed by Stripe session id

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra }
  });
}
export const bad = (msg, status = 400) => json({ error: msg }, status);

export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY missing');
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
}

// ─── Helpers ────────────────────────────────────────────────────────────────
export const fmt = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clean = (s, max = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
export const firstName = (name) => clean(name).split(' ')[0] || 'there';

export function heatById(id) { return HEATS.find(h => h.id === id) || null; }

// Division helpers. Teams created before divisions existed have no `division`
// field and always had a partner → treat them as doubles.
export const DIVISION_LABELS = { singles: 'Singles', doubles: 'Doubles' };
export function teamDivision(team) { return team?.division === 'singles' ? 'singles' : 'doubles'; }
export function isSingles(team) { return teamDivision(team) === 'singles'; }

// "doors 6:30 AM, athlete briefing 6:45 AM" / adds group warm-up when the division has one.
export function scheduleLine(division) {
  const s = EVENT.schedule[division] || EVENT.schedule.doubles;
  return `doors ${s.doors}, athlete briefing ${s.briefing}${s.warmup ? `, group warm-up ${s.warmup}` : ''}`;
}
export function divisionCopy(division) {
  return division === 'singles'
    ? 'Singles (full course solo, HYROX Open weights)'
    : 'Doubles (all teams race at HYROX Mixed Doubles weights)';
}

export function registrationOpen() {
  return Date.now() < Date.parse(EVENT.registration_closes_iso);
}

function linkSecret() {
  const s = process.env.HYROX_LINK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) throw new Error('HYROX_LINK_SECRET (or STRIPE_WEBHOOK_SECRET) missing');
  return s;
}
export function signTeam(team_id) {
  return crypto.createHmac('sha256', linkSecret()).update(`team:${team_id}`).digest('base64url').slice(0, 24);
}
export function verifyTeamToken(team_id, token) {
  if (!team_id || !token) return false;
  const expected = signTeam(team_id);
  const a = Buffer.from(expected), b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function partnerLink(team_id) {
  return `${SITE_URL}/hyrox/simulation/partner.html?team=${encodeURIComponent(team_id)}&t=${signTeam(team_id)}`;
}

export function certificateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[bytes[i] % alphabet.length];
  return `HYRX-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function bookingLink(type, code) {
  const slug = BOOK_SLUGS[type] || BOOK_SLUGS.dexa;
  const q = new URLSearchParams({ utm_source: 'hyrox_sim', utm_medium: 'certificate', utm_campaign: code });
  return `${CLINIC_BOOK_BASE}/${slug}?${q.toString()}`;
}

// Normalizes an athlete's add-on selection; DEXA + labs for the same athlete collapse to `baseline`.
export function normalizeAddons(a = {}) {
  const shirt = !!a.shirt, dexa = !!a.dexa, labs = !!a.labs;
  return { shirt, dexa: dexa && !labs, labs: labs && !dexa, baseline: dexa && labs };
}

// Builds priced line items for one athlete. `includeRace` false for partner add-on purchases.
export function athleteLineItems(athlete, role, { includeRace = true, memberCodeValid = false } = {}) {
  const items = [];
  const who = clean(athlete.name, 60) || (role === 'partner' ? 'Partner' : 'Athlete');
  if (includeRace) {
    const member = !!athlete.member && memberCodeValid;
    items.push({
      key: member ? 'race_member' : 'race', role,
      label: `Race Entry${member ? ' (Member)' : ''} — ${who}`,
      amount: member ? PRICES.race_member_athlete : PRICES.race_athlete
    });
  }
  const ad = normalizeAddons(athlete.addons);
  if (ad.shirt) items.push({ key: 'shirt', role, label: `${ADDON_LABELS.shirt} (${athlete.shirt_size || '?'}) — ${who}`, amount: PRICES.shirt });
  if (ad.baseline) items.push({ key: 'baseline', role, label: `${ADDON_LABELS.baseline} Certificate — ${who}`, amount: PRICES.baseline });
  else if (ad.dexa) items.push({ key: 'dexa', role, label: `${ADDON_LABELS.dexa} Certificate — ${who}`, amount: PRICES.dexa });
  else if (ad.labs) items.push({ key: 'labs', role, label: `${ADDON_LABELS.labs} Certificate — ${who}`, amount: PRICES.labs });
  return items;
}

export const sumItems = (items) => items.reduce((s, i) => s + i.amount, 0);

export function toStripeLineItems(items, { testMode = false } = {}) {
  if (testMode) {
    return [{
      price_data: { currency: 'usd', product_data: { name: 'TEST — HYROX Race Simulation', description: 'TEST MODE $1 smoke test. Refund after verification.' }, unit_amount: 100 },
      quantity: 1
    }];
  }
  return items.map(i => ({
    price_data: { currency: 'usd', product_data: { name: i.label }, unit_amount: i.amount },
    quantity: 1
  }));
}

// ─── Capacity ───────────────────────────────────────────────────────────────
export async function listTeams() {
  const store = teamsStore();
  const list = await store.list();
  const out = [];
  for (const b of (list?.blobs || [])) {
    const t = await store.get(b.key, { type: 'json' });
    if (t) out.push(t);
  }
  return out;
}

export function teamHoldsSlot(t, now = Date.now()) {
  if (t.status === 'paid') return true;
  if (t.status === 'pending_payment') {
    return now - Date.parse(t.created_at) < HOLD_MINUTES * 60 * 1000;
  }
  return false;
}

export async function heatAvailability(teams) {
  const all = teams || await listTeams();
  const now = Date.now();
  return HEATS.map(h => {
    const taken = all.filter(t => t.heat_id === h.id && teamHoldsSlot(t, now)).length;
    return { id: h.id, label: h.label, start_iso: h.start_iso, capacity: h.capacity, division: h.division, taken, remaining: Math.max(0, h.capacity - taken) };
  });
}

// Public config payload consumed by app.js / partner.js
export async function publicConfig() {
  return {
    event: EVENT,
    open: registrationOpen(),
    heats: await heatAvailability(),
    prices: PRICES,
    regular_prices: REGULAR_PRICES,
    shirt_sizes: SHIRT_SIZES,
    addon_labels: ADDON_LABELS,
    clinic_name: CLINIC_NAME
  };
}

// Sanitized team view for the success + partner pages (no emergency contacts, IPs, or tokens).
export function publicTeamView(team, { forRole = 'registrant' } = {}) {
  const heat = heatById(team.heat_id);
  const ath = (r) => {
    const a = team.athletes[r];
    if (!a) return null;
    return {
      role: r,
      name: a.name, email: a.email, phone: a.phone,
      member: !!a.member,
      shirt_size: a.shirt_size || null,
      addons: normalizeAddons(a.addons),
      waiver_signed: !!a.waiver?.signed_at,
      confirmed: !!a.confirmed_at
    };
  };
  const certs = (team.certificates || []).filter(c => forRole === 'registrant' || c.role === forRole)
    .map(c => ({ code: c.code, role: c.role, type: c.type, label: ADDON_LABELS[c.type], name: c.name, book_url: bookingLink(c.type, c.code) }));
  return {
    team_id: team.team_id,
    status: team.status,
    division: teamDivision(team),
    heat: heat ? { id: heat.id, label: heat.label, start_iso: heat.start_iso, division: heat.division } : null,
    registrant: ath('registrant'),
    partner: ath('partner'),
    certificates: certs,
    amount_cents: team.amount_cents || 0,
    paid_at: team.paid_at || null,
    test_mode: !!team.test_mode
  };
}

// ─── Certificates ───────────────────────────────────────────────────────────
export function issueCertificates(team, role, addons, sessionId) {
  const a = team.athletes[role];
  const ad = normalizeAddons(addons);
  const types = ad.baseline ? ['baseline'] : [ad.dexa && 'dexa', ad.labs && 'labs'].filter(Boolean);
  team.certificates = team.certificates || [];
  for (const type of types) {
    // Idempotent per (role, type)
    if (team.certificates.some(c => c.role === role && c.type === type)) continue;
    team.certificates.push({ code: certificateCode(), role, type, name: a.name, email: a.email, issued_at: new Date().toISOString(), session_id: sessionId, redeemed_at: null });
  }
  return team.certificates.filter(c => c.role === role);
}

// ─── Email (SES; same creds as the fob flow) ────────────────────────────────
const sesClient = (process.env.SES_ACCESS_KEY_ID && process.env.SES_SECRET_ACCESS_KEY)
  ? new SESClient({ region: process.env.SES_REGION || 'us-east-1', credentials: { accessKeyId: process.env.SES_ACCESS_KEY_ID, secretAccessKey: process.env.SES_SECRET_ACCESS_KEY } })
  : null;

const FROM = process.env.HYROX_NOTIFY_FROM || process.env.FOB_NOTIFY_FROM || 'Moonshot CrossFit <noreply@updates.moonshotclinic.com>';
const TEAM_TO = (process.env.HYROX_NOTIFY_TO || 'info@moonshotcrossfit.com,tom@moonshotmp.com').split(',').map(s => s.trim()).filter(Boolean);

export async function sendEmail({ to, subject, text, html, replyTo = EVENT.contact_email }) {
  const toList = Array.isArray(to) ? to : [to];
  if (!sesClient) { console.log(`[hyrox:email:skipped] SES not configured to=${toList.join(',')} subject="${subject}"`); return false; }
  try {
    const r = await sesClient.send(new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: toList },
      ReplyToAddresses: [replyTo],
      Message: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' }, Html: { Data: html, Charset: 'UTF-8' } } }
    }));
    console.log(`[hyrox:email:sent] id=${r.MessageId} to=${toList.join(',')}`);
    return true;
  } catch (err) {
    console.error('[hyrox:email:failed]', err?.name, err?.message);
    return false;
  }
}

const wrap = (title, inner) => `<!DOCTYPE html><html><body style="margin:0;background:#F0EEE9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#101921;">
<div style="max-width:620px;margin:0 auto;padding:24px 16px;">
  <div style="background:#101921;color:#F0EEE9;border-radius:14px 14px 0 0;padding:22px 24px;">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#B8986E;font-weight:700;">Moonshot CrossFit</div>
    <div style="font-size:24px;font-weight:700;margin-top:4px;">${esc(title)}</div>
  </div>
  <div style="background:#fff;border:1px solid #e5e2dc;border-top:0;border-radius:0 0 14px 14px;padding:24px;line-height:1.55;font-size:15px;">${inner}</div>
  <p style="font-size:12px;color:#888;text-align:center;margin-top:16px;">Moonshot CrossFit · ${esc(EVENT.address)} · ${esc(EVENT.contact_phone)} · <a href="mailto:${EVENT.contact_email}" style="color:#B8986E;">${EVENT.contact_email}</a></p>
</div></body></html>`;

const btn = (href, label) => `<a href="${href}" style="display:inline-block;background:#B8986E;color:#101921;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;margin:6px 0;">${esc(label)}</a>`;

function certBlockHtml(certs) {
  if (!certs.length) return '';
  return `<div style="background:#F7F5F1;border-left:4px solid #B8986E;padding:14px 18px;margin:18px 0;border-radius:6px;">
    <div style="font-weight:700;margin-bottom:6px;">Your ${esc(CLINIC_NAME)} certificates</div>
    <p style="margin:0 0 10px;color:#555;font-size:14px;">Book any date through ${esc(EVENT.certificate_expires_label)}. Your certificate code is attached to the booking automatically; there is nothing to pay at the clinic.</p>
    ${certs.map(c => `<div style="padding:10px 0;border-top:1px solid #e5e2dc;">
      <div><strong>${esc(ADDON_LABELS[c.type])}</strong> — ${esc(c.name)}</div>
      <div style="font-family:Menlo,monospace;font-size:16px;letter-spacing:1px;margin:4px 0;">${esc(c.code)}</div>
      ${btn(bookingLink(c.type, c.code), 'Book this appointment')}
    </div>`).join('')}
  </div>`;
}
function certBlockText(certs) {
  if (!certs.length) return '';
  return `\n${CLINIC_NAME.toUpperCase()} CERTIFICATES (book any date through ${EVENT.certificate_expires_label}):\n` +
    certs.map(c => `  ${ADDON_LABELS[c.type]} — ${c.name}\n  Code: ${c.code}\n  Book: ${bookingLink(c.type, c.code)}`).join('\n\n') + '\n';
}

function addonsSummary(a) {
  const ad = normalizeAddons(a.addons);
  const parts = [];
  if (ad.shirt) parts.push(`${ADDON_LABELS.shirt} (${a.shirt_size || '?'})`);
  if (ad.baseline) parts.push(ADDON_LABELS.baseline);
  if (ad.dexa) parts.push(ADDON_LABELS.dexa);
  if (ad.labs) parts.push(ADDON_LABELS.labs);
  return parts.length ? parts.join(', ') : 'Race entry only';
}

function calendarLink(heat) {
  const start = new Date(heat.start_iso);
  const end = new Date(start.getTime() + 90 * 60000);
  const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const s = EVENT.schedule[heat.division] || EVENT.schedule.doubles;
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: `${EVENT.name} — Heat ${heat.label}`,
    dates: `${f(start)}/${f(end)}`, location: `${EVENT.location_name}, ${EVENT.address}`,
    details: `Doors ${s.doors} · Briefing ${s.briefing}${s.warmup ? ` · Warm-up ${s.warmup}` : ''}. ${PAGE_URL}`
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export async function emailRegistrantConfirmation(team, { to } = {}) {
  const singles = isSingles(team);
  const r = team.athletes.registrant, p = team.athletes.partner;
  const heat = heatById(team.heat_id);
  const certs = (team.certificates || []).filter(c => c.role === 'registrant');
  const partnerCerts = singles ? [] : (team.certificates || []).filter(c => c.role === 'partner');
  const plink = singles ? null : partnerLink(team.team_id);
  const sched = scheduleLine(teamDivision(team));
  const subject = `${team.test_mode ? '[TEST] ' : ''}You're registered — ${EVENT.name}, Heat ${heat?.label}`;

  const text = `Hi ${firstName(r.name)},

You're in. Here are your race details:

Event: ${EVENT.name}
Date: ${EVENT.date_label}
Heat: ${heat?.label} (${sched})
Where: ${EVENT.location_name}, ${EVENT.address}
${singles ? `Athlete: ${r.name}` : `Team: ${r.name} + ${p.name}`}
Division: ${divisionCopy(teamDivision(team))}

Your package: ${addonsSummary(r)}
${singles ? '' : `${p.name}'s package: ${addonsSummary(p)}\n`}${certBlockText(certs)}${partnerCerts.length ? `\n${p.name}'s certificates were emailed to ${p.email}.\n` : ''}${singles ? '' : `
PARTNER NEXT STEP
We emailed ${p.name} at ${p.email} to confirm their info and sign the race waiver. If it doesn't arrive, send them this link:
${plink}
`}
Add to calendar: ${calendarLink(heat)}

Questions? Reply to this email or call ${EVENT.contact_phone}.

See you on the floor,
Moonshot CrossFit
`;

  const schedHtml = (() => {
    const s = EVENT.schedule[teamDivision(team)] || EVENT.schedule.doubles;
    return `Doors ${esc(s.doors)} · Briefing ${esc(s.briefing)}${s.warmup ? ` · Warm-up ${esc(s.warmup)}` : ''}`;
  })();
  const html = wrap("You're registered", `
    <p>Hi ${esc(firstName(r.name))},</p>
    <p>You're in. Here are your race details:</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px;">
      <tr><td style="padding:6px 0;color:#666;width:120px;">Event</td><td style="padding:6px 0;"><strong>${esc(EVENT.name)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Date</td><td style="padding:6px 0;">${esc(EVENT.date_label)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Heat</td><td style="padding:6px 0;"><strong style="font-size:18px;">${esc(heat?.label || '')}</strong><br><span style="color:#666;font-size:13px;">${schedHtml}</span></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Where</td><td style="padding:6px 0;">${esc(EVENT.location_name)}<br>${esc(EVENT.address)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">${singles ? 'Athlete' : 'Team'}</td><td style="padding:6px 0;">${singles ? esc(r.name) : `${esc(r.name)} + ${esc(p.name)}`}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Division</td><td style="padding:6px 0;">${singles ? 'Singles · full course solo · HYROX Open weights' : 'Doubles · HYROX Mixed Doubles weights'}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Your package</td><td style="padding:6px 0;">${esc(addonsSummary(r))}</td></tr>
      ${singles ? '' : `<tr><td style="padding:6px 0;color:#666;">${esc(firstName(p.name))}'s package</td><td style="padding:6px 0;">${esc(addonsSummary(p))}</td></tr>`}
    </table>
    ${certBlockHtml(certs)}
    ${partnerCerts.length ? `<p style="color:#555;font-size:14px;">${esc(p.name)}'s certificate${partnerCerts.length > 1 ? 's were' : ' was'} emailed to ${esc(p.email)}.</p>` : ''}
    ${singles ? '' : `<div style="background:#101921;color:#F0EEE9;border-radius:10px;padding:16px 18px;margin:18px 0;">
      <div style="font-weight:700;color:#B8986E;text-transform:uppercase;letter-spacing:1px;font-size:12px;">Partner next step</div>
      <p style="margin:6px 0 10px;font-size:14px;">We emailed <strong>${esc(p.name)}</strong> at ${esc(p.email)} to confirm their info and sign the race waiver. If it doesn't arrive, send them this link:</p>
      <div style="font-size:12px;word-break:break-all;"><a href="${plink}" style="color:#B8986E;">${plink}</a></div>
    </div>`}
    <p>${btn(calendarLink(heat), 'Add to Google Calendar')}</p>
    <p style="color:#666;font-size:14px;">Questions? Reply to this email or call ${esc(EVENT.contact_phone)}.</p>
    <p>See you on the floor,<br><strong>Moonshot CrossFit</strong></p>`);

  return sendEmail({ to: to || r.email, subject, text, html });
}

export async function emailPartnerInvite(team, { to } = {}) {
  if (isSingles(team)) { console.log(`[hyrox:email:skipped] partner invite for singles team=${team.team_id}`); return false; }
  const r = team.athletes.registrant, p = team.athletes.partner;
  const heat = heatById(team.heat_id);
  const certs = (team.certificates || []).filter(c => c.role === 'partner');
  const plink = partnerLink(team.team_id);
  const hasAllAddons = normalizeAddons(p.addons).baseline && normalizeAddons(p.addons).shirt;
  const subject = `${team.test_mode ? '[TEST] ' : ''}${firstName(r.name)} registered you — ${EVENT.name}, Heat ${heat?.label}`;

  const text = `Hi ${firstName(p.name)},

${r.name} registered you as their Doubles partner for the ${EVENT.name}.

Date: ${EVENT.date_label}
Heat: ${heat?.label} (doors ${EVENT.doors_open}, briefing ${EVENT.briefing}, warm-up ${EVENT.warmup})
Where: ${EVENT.location_name}, ${EVENT.address}
Your package: ${addonsSummary(p)}
${certBlockText(certs)}
ONE THING TO DO NOW
Confirm your contact info and sign the race waiver (2 minutes):
${plink}
${hasAllAddons ? '' : `
Want more from race day? On that same page you can add an event T-shirt, a DEXA body composition scan, or a comprehensive blood panel from ${CLINIC_NAME} (same building) at the event rate: $25 off regular clinic pricing. Available through ${EVENT.registration_closes_label}.
`}
Questions? Reply to this email or call ${EVENT.contact_phone}.

Moonshot CrossFit
`;

  const html = wrap(`${esc(firstName(r.name))} registered you`, `
    <p>Hi ${esc(firstName(p.name))},</p>
    <p><strong>${esc(r.name)}</strong> registered you as their Doubles partner for the ${esc(EVENT.name)}.</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px;">
      <tr><td style="padding:6px 0;color:#666;width:120px;">Date</td><td style="padding:6px 0;">${esc(EVENT.date_label)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Heat</td><td style="padding:6px 0;"><strong style="font-size:18px;">${esc(heat?.label || '')}</strong><br><span style="color:#666;font-size:13px;">Doors ${esc(EVENT.doors_open)} · Briefing ${esc(EVENT.briefing)} · Warm-up ${esc(EVENT.warmup)}</span></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Where</td><td style="padding:6px 0;">${esc(EVENT.location_name)}<br>${esc(EVENT.address)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Your package</td><td style="padding:6px 0;">${esc(addonsSummary(p))}</td></tr>
    </table>
    ${certBlockHtml(certs)}
    <div style="background:#101921;color:#F0EEE9;border-radius:10px;padding:16px 18px;margin:18px 0;">
      <div style="font-weight:700;color:#B8986E;text-transform:uppercase;letter-spacing:1px;font-size:12px;">One thing to do now</div>
      <p style="margin:6px 0 10px;font-size:14px;">Confirm your contact info and sign the race waiver (2 minutes).</p>
      ${btn(plink, 'Confirm + sign waiver')}
    </div>
    ${hasAllAddons ? '' : `<p style="color:#444;font-size:14px;">Want more from race day? On that same page you can add an event T-shirt, a DEXA body composition scan, or a comprehensive blood panel from <strong>${esc(CLINIC_NAME)}</strong> (same building) at the event rate: <strong>$25 off</strong> regular clinic pricing. Available through ${esc(EVENT.registration_closes_label)}.</p>`}
    <p style="color:#666;font-size:14px;">Questions? Reply to this email or call ${esc(EVENT.contact_phone)}.</p>
    <p><strong>Moonshot CrossFit</strong></p>`);

  return sendEmail({ to: to || p.email, subject, text, html });
}

export async function emailPartnerAddonReceipt(team, certs) {
  const p = team.athletes.partner;
  const heat = heatById(team.heat_id);
  const subject = `${team.test_mode ? '[TEST] ' : ''}Your race-day add-ons — ${EVENT.name}`;
  const text = `Hi ${firstName(p.name)},

Your add-ons are confirmed for the ${EVENT.name} (${EVENT.date_label}, Heat ${heat?.label}).

Your package: ${addonsSummary(p)}
${certBlockText(certs)}
Moonshot CrossFit
`;
  const html = wrap('Your add-ons are confirmed', `
    <p>Hi ${esc(firstName(p.name))},</p>
    <p>Your add-ons are confirmed for the ${esc(EVENT.name)} (${esc(EVENT.date_label)}, Heat <strong>${esc(heat?.label || '')}</strong>).</p>
    <p><strong>Your package:</strong> ${esc(addonsSummary(p))}</p>
    ${certBlockHtml(certs)}
    <p><strong>Moonshot CrossFit</strong></p>`);
  return sendEmail({ to: p.email, subject, text, html });
}

export async function emailTeamNotification(team, { kind, sessionId, amountCents, to } = {}) {
  const singles = isSingles(team);
  const r = team.athletes.registrant, p = team.athletes.partner;
  const heat = heatById(team.heat_id);
  const isTest = !!team.test_mode;
  const who = singles ? `${r.name} registered (Singles)` : `${r.name} + ${p.name} registered`;
  const subject = `${isTest ? '[TEST] ' : ''}HYROX Sim: ${kind === 'partner' ? `${p.name} added extras` : who} — Heat ${heat?.label} — ${fmt(amountCents)}`;

  let totals = null;
  try {
    const teams = (await listTeams()).filter(t => !t.test_mode);
    const paid = teams.filter(t => t.status === 'paid');
    const avail = await heatAvailability(teams);
    const certs = paid.flatMap(t => t.certificates || []);
    totals = {
      teams: paid.length,
      revenue: paid.reduce((s, t) => s + (t.amount_cents || 0) + (t.partner_orders || []).reduce((x, o) => x + (o.amount_cents || 0), 0), 0),
      heats: avail,
      shirts: paid.flatMap(t => ['registrant', 'partner'].map(role => t.athletes[role]).filter(Boolean)).filter(a => normalizeAddons(a.addons).shirt).length,
      certs: certs.length,
      certLedger: certs
    };
  } catch (e) { console.error('[hyrox:totals:failed]', e?.message); }

  const certLines = (team.certificates || []).map(c => `  ${c.code}  ${ADDON_LABELS[c.type]}  ${c.name} <${c.email}>`).join('\n');
  const text = `${isTest ? '⚠ TEST MODE — refund in Stripe.\n\n' : ''}${kind === 'partner' ? 'Partner add-on purchase' : `New ${DIVISION_LABELS[teamDivision(team)]} registration`} — ${EVENT.name}

Heat: ${heat?.label}${singles ? ' (Singles)' : ''}
Registrant: ${r.name} <${r.email}> ${r.phone}${r.member ? ' (member)' : ''}
  Emergency: ${r.emergency_name || '?'} ${r.emergency_phone || ''}
  Package: ${addonsSummary(r)}
  Waiver: ${r.waiver?.signed_at ? 'signed ' + r.waiver.signed_at : 'NOT signed'}
${singles ? '' : `Partner: ${p.name} <${p.email}> ${p.phone}${p.member ? ' (member)' : ''}
  Package: ${addonsSummary(p)}
  Waiver: ${p.waiver?.signed_at ? 'signed ' + p.waiver.signed_at : 'pending (invite emailed)'}
`}
Charged: ${fmt(amountCents)}
Stripe session: https://dashboard.stripe.com/payments?query=${sessionId}
Team ID: ${team.team_id}
${certLines ? `\nCLINIC CERTIFICATES ON THIS TEAM (front desk: honor at $0, mark redeemed):\n${certLines}\n` : ''}
${totals ? `═══════════════════════════════════════
EVENT TOTALS (paid, real money only)
═══════════════════════════════════════
  ${totals.teams} teams · ${fmt(totals.revenue)} collected · ${totals.shirts} shirts · ${totals.certs} clinic certificates
  Heats: ${totals.heats.map(h => `${h.label} ${h.taken}/${h.capacity}`).join(' · ')}
${totals.certLedger.length ? `\nCertificate ledger:\n${totals.certLedger.map(c => `  ${c.code}  ${ADDON_LABELS[c.type]}  ${c.name} <${c.email}>${c.redeemed_at ? '  REDEEMED' : ''}`).join('\n')}` : ''}` : ''}

Roster CSV: ${SITE_URL}/.netlify/functions/hyrox-roster?key=<HYROX_ADMIN_KEY>
`;

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.55;color:#101921;max-width:680px;margin:0 auto;padding:20px;">
${isTest ? '<div style="background:#fee2e2;border:2px solid #ef4444;border-radius:8px;padding:12px 16px;margin-bottom:20px;color:#991b1b;font-weight:600;">⚠ TEST MODE — refund this charge in Stripe Dashboard.</div>' : ''}
<h1 style="font-size:20px;margin:0 0 4px;">${kind === 'partner' ? 'Partner add-on purchase' : `New ${DIVISION_LABELS[teamDivision(team)]} entry`} · Heat ${esc(heat?.label || '')}</h1>
<p style="color:#666;margin:0 0 18px;">${esc(EVENT.name)} · charged <strong>${fmt(amountCents)}</strong></p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px;">
<tr><td style="padding:6px 0;color:#666;width:110px;vertical-align:top;">Registrant</td><td style="padding:6px 0;"><strong>${esc(r.name)}</strong> &lt;${esc(r.email)}&gt; · ${esc(r.phone)}${r.member ? ' · <em>member</em>' : ''}<br><span style="color:#666;">Emergency: ${esc(r.emergency_name || '?')} ${esc(r.emergency_phone || '')}</span><br>${esc(addonsSummary(r))}<br><span style="color:${r.waiver?.signed_at ? '#166534' : '#991b1b'};">Waiver ${r.waiver?.signed_at ? 'signed' : 'NOT signed'}</span></td></tr>
${singles ? '' : `<tr><td style="padding:6px 0;color:#666;vertical-align:top;">Partner</td><td style="padding:6px 0;"><strong>${esc(p.name)}</strong> &lt;${esc(p.email)}&gt; · ${esc(p.phone)}${p.member ? ' · <em>member</em>' : ''}<br>${esc(addonsSummary(p))}<br><span style="color:${p.waiver?.signed_at ? '#166534' : '#b45309'};">Waiver ${p.waiver?.signed_at ? 'signed' : 'pending (invite emailed)'}</span></td></tr>`}
<tr><td style="padding:6px 0;color:#666;">Stripe</td><td style="padding:6px 0;"><a href="https://dashboard.stripe.com/payments?query=${esc(sessionId)}" style="color:#B8986E;">${esc(sessionId)}</a></td></tr>
<tr><td style="padding:6px 0;color:#666;">Team ID</td><td style="padding:6px 0;"><code>${esc(team.team_id)}</code></td></tr>
</table>
${(team.certificates || []).length ? `<div style="background:#F0EEE9;border-left:4px solid #B8986E;padding:12px 16px;margin-bottom:18px;"><strong>Clinic certificates on this team</strong> <span style="color:#666;font-size:13px;">(front desk: honor at $0, mark redeemed)</span><table style="width:100%;font-size:13px;margin-top:8px;">${team.certificates.map(c => `<tr><td style="padding:3px 0;font-family:Menlo,monospace;">${esc(c.code)}</td><td style="padding:3px 0;">${esc(ADDON_LABELS[c.type])}</td><td style="padding:3px 0;">${esc(c.name)} &lt;${esc(c.email)}&gt;</td></tr>`).join('')}</table></div>` : ''}
${totals ? `<div style="background:#101921;color:#F0EEE9;border-radius:12px;padding:18px 20px;margin-bottom:18px;">
  <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#B8986E;margin-bottom:6px;">Event totals</div>
  <div style="font-size:28px;font-weight:700;">${fmt(totals.revenue)}</div>
  <div style="color:#B2BFBE;font-size:13px;margin-bottom:12px;">${totals.teams} paid teams · ${totals.shirts} shirts · ${totals.certs} clinic certificates</div>
  <table style="width:100%;font-size:13px;border-collapse:collapse;">${totals.heats.map(h => `<tr><td style="padding:3px 0;color:#B2BFBE;">Heat ${esc(h.label)}</td><td style="padding:3px 0;text-align:right;">${h.taken} / ${h.capacity}</td></tr>`).join('')}</table>
</div>
${totals.certLedger.length ? `<details><summary style="cursor:pointer;color:#B8986E;font-weight:600;font-size:14px;">Certificate ledger (${totals.certLedger.length})</summary><table style="width:100%;font-size:13px;margin-top:8px;border-collapse:collapse;">${totals.certLedger.map(c => `<tr style="border-top:1px solid #eee;"><td style="padding:4px 0;font-family:Menlo,monospace;">${esc(c.code)}</td><td style="padding:4px 0;">${esc(ADDON_LABELS[c.type])}</td><td style="padding:4px 0;">${esc(c.name)} &lt;${esc(c.email)}&gt;</td><td style="padding:4px 0;color:${c.redeemed_at ? '#166534' : '#999'};">${c.redeemed_at ? 'redeemed' : 'open'}</td></tr>`).join('')}</table></details>` : ''}` : ''}
<p style="font-size:12px;color:#888;margin-top:18px;">Roster CSV: <code>${esc(SITE_URL)}/.netlify/functions/hyrox-roster?key=&lt;HYROX_ADMIN_KEY&gt;</code></p>
</body></html>`;

  return sendEmail({ to: to || TEAM_TO, subject, text, html });
}

// ─── Webhook handlers (called from stripe-webhook.mjs) ──────────────────────
export async function handleHyroxCheckoutCompleted(session) {
  const md = session.metadata || {};
  const store = teamsStore();
  const team = await store.get(md.team_id, { type: 'json' });
  if (!team) { console.error(`[hyrox:webhook] team not found team=${md.team_id} session=${session.id}`); return; }

  if (md.kind === 'hyrox_register') {
    if (team.status === 'paid' && team.stripe?.session_id === session.id) { console.log(`[hyrox:webhook] duplicate session=${session.id}`); return; }
    team.status = 'paid';
    team.paid_at = new Date().toISOString();
    team.stripe = { session_id: session.id, payment_intent: session.payment_intent || null, customer: session.customer || null, amount_total: session.amount_total };
    team.billing_details = session.customer_details || null;
    issueCertificates(team, 'registrant', team.athletes.registrant.addons, session.id);
    if (team.athletes.partner) issueCertificates(team, 'partner', team.athletes.partner.addons, session.id);
    await store.setJSON(team.team_id, team);
    console.log(`[hyrox:paid] team=${team.team_id} division=${teamDivision(team)} heat=${team.heat_id} amount=${session.amount_total} certs=${(team.certificates || []).length}`);
    await emailRegistrantConfirmation(team);
    if (team.athletes.partner) await emailPartnerInvite(team);
    await emailTeamNotification(team, { kind: 'register', sessionId: session.id, amountCents: session.amount_total });
    return;
  }

  if (md.kind === 'hyrox_partner_addons') {
    const orders = ordersStore();
    const order = await orders.get(session.id, { type: 'json' });
    if (!order) { console.error(`[hyrox:webhook] partner order not found session=${session.id}`); return; }
    if (order.status === 'paid') { console.log(`[hyrox:webhook] duplicate partner session=${session.id}`); return; }
    if (!team.athletes.partner) { console.error(`[hyrox:webhook] partner order on singles team=${team.team_id} session=${session.id}`); return; }
    const p = team.athletes.partner;
    const cur = normalizeAddons(p.addons);
    const add = normalizeAddons(order.addons);
    // Merge: anything the partner just bought becomes true; bundle recomputed by normalizeAddons.
    p.addons = { shirt: cur.shirt || add.shirt, dexa: cur.dexa || cur.baseline || add.dexa || add.baseline, labs: cur.labs || cur.baseline || add.labs || add.baseline };
    if (add.shirt && order.shirt_size) p.shirt_size = order.shirt_size;
    // If partner already held a single cert and just bought the other half, the older single cert stays valid
    // and the new one is issued for the missing piece (front desk honors both) — avoid re-issuing duplicates.
    const newlyIssued = issueCertificates(team, 'partner', add, session.id);
    team.partner_orders = team.partner_orders || [];
    team.partner_orders.push({ session_id: session.id, amount_cents: session.amount_total, paid_at: new Date().toISOString(), addons: add, shirt_size: order.shirt_size || null });
    await store.setJSON(team.team_id, team);
    await orders.setJSON(session.id, { ...order, status: 'paid', paid_at: new Date().toISOString(), amount_cents: session.amount_total });
    console.log(`[hyrox:partner-paid] team=${team.team_id} session=${session.id} amount=${session.amount_total}`);
    await emailPartnerAddonReceipt(team, newlyIssued.filter(c => c.session_id === session.id));
    await emailTeamNotification(team, { kind: 'partner', sessionId: session.id, amountCents: session.amount_total });
  }
}

export async function handleHyroxCheckoutExpired(session) {
  const md = session.metadata || {};
  if (md.kind === 'hyrox_register') {
    const store = teamsStore();
    const team = await store.get(md.team_id, { type: 'json' });
    if (team && team.status === 'pending_payment') {
      team.status = 'expired';
      team.expired_at = new Date().toISOString();
      await store.setJSON(team.team_id, team);
      console.log(`[hyrox:expired] team=${team.team_id} heat=${team.heat_id}`);
    }
  } else if (md.kind === 'hyrox_partner_addons') {
    const orders = ordersStore();
    const order = await orders.get(session.id, { type: 'json' });
    if (order && order.status !== 'paid') await orders.setJSON(session.id, { ...order, status: 'expired' });
  }
}
