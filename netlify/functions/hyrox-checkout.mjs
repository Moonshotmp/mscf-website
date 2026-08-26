// POST /.netlify/functions/hyrox-checkout
// Creates the Doubles team record (pending_payment, holds the heat slot for HOLD_MINUTES)
// and a single Stripe Checkout session for race entries + every selected add-on.
import crypto from 'node:crypto';
import {
  SITE_URL, EVENT, HEATS, MEMBER_CODE, SHIRT_SIZES, HOLD_MINUTES,
  teamsStore, heatAvailability, registrationOpen, heatById,
  athleteLineItems, sumItems, toStripeLineItems, normalizeAddons,
  stripeClient, signTeam, json, bad, clean, isEmail
} from './_shared/hyrox.mjs';

const REQUIRED_ACK = ['ack_read', 'ack_risk', 'ack_release', 'ack_rules', 'ack_age'];

function parseAthlete(raw, role) {
  if (!raw || typeof raw !== 'object') return { error: `Missing ${role} info` };
  const name = clean(raw.name, 80), email = clean(raw.email, 120).toLowerCase(), phone = clean(raw.phone, 40);
  if (name.length < 2 || !name.includes(' ')) return { error: `${role === 'partner' ? "Partner's" : 'Your'} full name (first and last) is required` };
  if (!isEmail(email)) return { error: `${role === 'partner' ? "Partner's" : 'Your'} email looks invalid` };
  if (phone.replace(/\D/g, '').length < 10) return { error: `${role === 'partner' ? "Partner's" : 'Your'} phone number is required` };
  const addons = normalizeAddons(raw.addons);
  let shirt_size = null;
  if (addons.shirt) {
    shirt_size = clean(raw.shirt_size, 5).toUpperCase();
    if (!SHIRT_SIZES.includes(shirt_size)) return { error: `Pick a T-shirt size for ${name.split(' ')[0]}` };
  }
  const a = { name, email, phone, member: !!raw.member, addons: { shirt: addons.shirt, dexa: addons.dexa || addons.baseline, labs: addons.labs || addons.baseline }, shirt_size };
  if (role === 'registrant') {
    a.emergency_name = clean(raw.emergency_name, 80);
    a.emergency_phone = clean(raw.emergency_phone, 40);
    if (a.emergency_name.length < 2 || a.emergency_phone.replace(/\D/g, '').length < 10) return { error: 'Emergency contact name and phone are required' };
  }
  return { athlete: a };
}

export default async (req) => {
  if (req.method !== 'POST') return bad('Method not allowed', 405);
  if (!process.env.STRIPE_SECRET_KEY) { console.error('STRIPE_SECRET_KEY missing'); return bad('Payment system not configured', 500); }

  let body;
  try { body = await req.json(); } catch { return bad('Invalid JSON'); }

  if (!registrationOpen()) return bad(`Registration closed ${EVENT.registration_closes_label}.`, 410);

  const heat = heatById(body.heat_id);
  if (!heat) return bad('Pick a heat time');

  const r = parseAthlete(body.registrant, 'registrant');
  if (r.error) return bad(r.error);
  const p = parseAthlete(body.partner, 'partner');
  if (p.error) return bad(p.error);
  if (r.athlete.email === p.athlete.email) return bad("Your partner needs their own email address (they'll get their own waiver + confirmation)");

  // Member code: only required if someone is flagged as a member. Wrong code = hard stop, never a silent full charge.
  const anyMember = r.athlete.member || p.athlete.member;
  const code = clean(body.member_code, 40);
  const memberCodeValid = anyMember && code.toLowerCase() === MEMBER_CODE.toLowerCase();
  if (anyMember && !memberCodeValid) return bad(code ? 'That member code is not valid. Check the code or uncheck the member box.' : 'Enter the Moonshot member code to apply the member rate.');

  // Waiver (registrant signs now; partner signs via their invite link)
  const w = body.waiver || {};
  for (const k of REQUIRED_ACK) if (!w[k]) return bad('Please check every waiver acknowledgment');
  const signature = clean(w.signature, 80);
  if (signature.toLowerCase() !== r.athlete.name.toLowerCase()) return bad('Signature must match your full name exactly');

  // Capacity (best-effort; a concurrent double-book resolves at the front desk)
  const avail = await heatAvailability();
  const h = avail.find(x => x.id === heat.id);
  if (!h || h.remaining <= 0) return json({ error: `Heat ${heat.label} just filled up. Pick another heat.`, heats: avail }, 409);

  const isTestMode = !!(body.test_token && process.env.HYROX_TEST_TOKEN && body.test_token === process.env.HYROX_TEST_TOKEN);

  const items = [
    ...athleteLineItems(r.athlete, 'registrant', { includeRace: true, memberCodeValid }),
    ...athleteLineItems(p.athlete, 'partner', { includeRace: true, memberCodeValid })
  ];
  const amount = isTestMode ? 100 : sumItems(items);

  const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('client-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const team_id = crypto.randomUUID();
  const now = new Date().toISOString();
  r.athlete.waiver = { signed_at: now, signature, ip, user_agent: clean(req.headers.get('user-agent'), 300), acks: REQUIRED_ACK };
  r.athlete.confirmed_at = now;
  p.athlete.waiver = null;
  p.athlete.confirmed_at = null;

  const team = {
    team_id, created_at: now, status: 'pending_payment',
    event_date: EVENT.date_iso, heat_id: heat.id,
    athletes: { registrant: r.athlete, partner: p.athlete },
    member_code_valid: memberCodeValid,
    line_items: items, amount_cents: amount,
    test_mode: isTestMode,
    stripe: null, certificates: [], partner_orders: []
  };

  const store = teamsStore();
  await store.setJSON(team_id, team);

  const stripe = stripeClient();
  const desc = `${EVENT.name} · Heat ${heat.label} · ${r.athlete.name} + ${p.athlete.name}`;
  const metadata = { kind: 'hyrox_register', team_id, heat_id: heat.id, test_mode: String(isTestMode), registrant_email: r.athlete.email, partner_email: p.athlete.email, description: desc };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: r.athlete.email,
      line_items: toStripeLineItems(items, { testMode: isTestMode }),
      metadata,
      payment_intent_data: { description: desc, metadata },
      success_url: `${SITE_URL}/hyrox/simulation/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/.netlify/functions/hyrox-cancel?team=${team_id}&t=${signTeam(team_id)}`,
      expires_at: Math.floor(Date.now() / 1000) + HOLD_MINUTES * 60 - 5 * 60, // 30 min (Stripe minimum); hold window is HOLD_MINUTES
      billing_address_collection: 'auto',
      allow_promotion_codes: false,
      automatic_tax: { enabled: false }
    });
    await store.setJSON(team_id, { ...team, stripe: { session_id: session.id } });
    console.log(`[hyrox:checkout:created] team=${team_id} heat=${heat.id} session=${session.id} amount=${amount} test=${isTestMode}`);
    return json({ url: session.url, session_id: session.id, team_id, amount_cents: amount });
  } catch (err) {
    console.error('[hyrox:checkout:failed]', err);
    await store.setJSON(team_id, { ...team, status: 'failed', error: err?.message });
    return bad('Could not start checkout. Please try again.', 500);
  }
};

export const config = { path: '/.netlify/functions/hyrox-checkout' };
