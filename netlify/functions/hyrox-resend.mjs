// GET /.netlify/functions/hyrox-resend?key=<HYROX_ADMIN_KEY>&team=<team_id|demo>&which=registrant|partner|team|all[&to=email]
// Resend any HYROX email for a paid team (lost confirmation, partner never got the invite),
// or preview all three with team=demo (sample data, [TEST]-tagged, sent to `to`).
import crypto from 'node:crypto';
import { HEATS, teamsStore, issueCertificates, emailRegistrantConfirmation, emailPartnerInvite, emailTeamNotification, json, bad, isEmail } from './_shared/hyrox.mjs';

function demoTeam() {
  const t = {
    team_id: 'demo-' + crypto.randomUUID().slice(0, 8), created_at: new Date().toISOString(), status: 'paid', paid_at: new Date().toISOString(),
    heat_id: HEATS[2].id, test_mode: true, amount_cents: 56400, member_code_valid: true,
    athletes: {
      registrant: { name: 'Tom Kashul', email: 'tom@moonshotmp.com', phone: '(847) 850-7360', member: true, shirt_size: 'L', addons: { shirt: true, dexa: true, labs: true }, emergency_name: 'Jill Kashul', emergency_phone: '(847) 850-7360', waiver: { signed_at: new Date().toISOString() }, confirmed_at: new Date().toISOString() },
      partner: { name: 'Sample Partner', email: 'partner@example.com', phone: '(847) 555-0100', member: false, shirt_size: null, addons: { dexa: true }, waiver: null, confirmed_at: null }
    },
    certificates: [], partner_orders: []
  };
  issueCertificates(t, 'registrant', t.athletes.registrant.addons, 'cs_demo');
  issueCertificates(t, 'partner', t.athletes.partner.addons, 'cs_demo');
  return t;
}

export default async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || '', expected = process.env.HYROX_ADMIN_KEY || '';
  const ok = expected && key.length === expected.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  if (!ok) return new Response('Not found', { status: 404 });

  const teamId = url.searchParams.get('team') || '';
  const which = url.searchParams.get('which') || 'registrant';
  const to = url.searchParams.get('to') || undefined;
  if (to && !isEmail(to)) return bad('Bad `to` address');

  let team;
  if (teamId === 'demo') {
    if (!to) return bad('team=demo requires &to=<email> so sample emails never go to a real partner address');
    team = demoTeam();
  } else {
    team = await teamsStore().get(teamId, { type: 'json' });
    if (!team) return bad('Team not found', 404);
    if (team.status !== 'paid') return bad(`Team is ${team.status}, not paid`, 409);
  }

  const sent = {};
  if (which === 'registrant' || which === 'all') sent.registrant = await emailRegistrantConfirmation(team, { to });
  if (which === 'partner' || which === 'all') sent.partner = await emailPartnerInvite(team, { to });
  if (which === 'team' || which === 'all') sent.team = await emailTeamNotification(team, { kind: 'register', sessionId: team.stripe?.session_id || 'cs_demo', amountCents: team.amount_cents || 0, to });
  console.log(`[hyrox:resend] team=${team.team_id} which=${which} to=${to || 'default'} result=${JSON.stringify(sent)}`);
  return json({ ok: true, team_id: team.team_id, sent, note: teamId === 'demo' ? 'Sample data; the partner link inside points at a non-existent team.' : undefined });
};

export const config = { path: '/.netlify/functions/hyrox-resend' };
