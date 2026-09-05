// POST /.netlify/functions/hyrox-partner
// Partner confirms contact info + signs the waiver (always saved), then optionally
// buys add-ons for themselves → returns a Stripe Checkout URL.
import {
  SITE_URL, EVENT, SHIRT_SIZES, HOLD_MINUTES,
  teamsStore, ordersStore, registrationOpen, heatById, verifyTeamToken, signTeam,
  athleteLineItems, sumItems, toStripeLineItems, normalizeAddons,
  stripeClient, json, bad, clean, isEmail
} from './_shared/hyrox.mjs';

const REQUIRED_ACK = ['ack_read', 'ack_risk', 'ack_release', 'ack_rules', 'ack_age'];

export default async (req) => {
  if (req.method !== 'POST') return bad('Method not allowed', 405);
  let body;
  try { body = await req.json(); } catch { return bad('Invalid JSON'); }

  const { team_id, t } = body;
  if (!verifyTeamToken(team_id, t)) return bad('This link is not valid', 403);

  const store = teamsStore();
  const team = await store.get(team_id, { type: 'json' });
  if (!team) return bad('Team not found', 404);
  if (!team.athletes.partner) return bad('This registration has no partner', 404);
  if (team.status !== 'paid') return bad('This registration is not complete yet', 409);

  const p = team.athletes.partner;
  const name = clean(body.name, 80), email = clean(body.email, 120).toLowerCase(), phone = clean(body.phone, 40);
  if (name.length < 2 || !name.includes(' ')) return bad('Full name (first and last) is required');
  if (!isEmail(email)) return bad('Email looks invalid');
  if (phone.replace(/\D/g, '').length < 10) return bad('Phone number is required');
  const emergency_name = clean(body.emergency_name, 80), emergency_phone = clean(body.emergency_phone, 40);
  if (emergency_name.length < 2 || emergency_phone.replace(/\D/g, '').length < 10) return bad('Emergency contact name and phone are required');

  const w = body.waiver || {};
  const alreadySigned = !!p.waiver?.signed_at;
  if (!alreadySigned) {
    for (const k of REQUIRED_ACK) if (!w[k]) return bad('Please check every waiver acknowledgment');
    const signature = clean(w.signature, 80);
    if (signature.toLowerCase() !== name.toLowerCase()) return bad('Signature must match your full name exactly');
    const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('client-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    p.waiver = { signed_at: new Date().toISOString(), signature, ip, user_agent: clean(req.headers.get('user-agent'), 300), acks: REQUIRED_ACK };
  }
  Object.assign(p, { name, email, phone, emergency_name, emergency_phone, confirmed_at: p.confirmed_at || new Date().toISOString() });
  await store.setJSON(team_id, team);
  console.log(`[hyrox:partner:confirmed] team=${team_id} email=${email} waiver=${!!p.waiver}`);

  // Optional add-on purchase — only things the partner doesn't already have.
  const cur = normalizeAddons(p.addons);
  const want = normalizeAddons(body.addons);
  const buy = {
    shirt: want.shirt && !cur.shirt,
    dexa: (want.dexa || want.baseline) && !(cur.dexa || cur.baseline),
    labs: (want.labs || want.baseline) && !(cur.labs || cur.baseline),
    nutrition: want.nutrition && !cur.nutrition
  };
  if (!buy.shirt && !buy.dexa && !buy.labs && !buy.nutrition) {
    return json({ ok: true, checkout: false, message: 'Confirmed. See you on race day.' });
  }
  if (!registrationOpen()) return bad(`Add-on purchases closed ${EVENT.registration_closes_label}. Your confirmation was saved.`, 410);

  let shirt_size = null;
  if (buy.shirt) {
    shirt_size = clean(body.shirt_size, 5).toUpperCase();
    if (!SHIRT_SIZES.includes(shirt_size)) return bad('Pick a T-shirt size');
  }

  const isTestMode = !!(body.test_token && process.env.HYROX_TEST_TOKEN && body.test_token === process.env.HYROX_TEST_TOKEN);
  const items = athleteLineItems({ ...p, addons: buy, shirt_size }, 'partner', { includeRace: false });
  const amount = isTestMode ? 100 : sumItems(items);
  const heat = heatById(team.heat_id);
  const desc = `${EVENT.name} add-ons · Heat ${heat?.label} · ${p.name}`;

  try {
    const stripe = stripeClient();
    const metadata = { kind: 'hyrox_partner_addons', team_id, heat_id: team.heat_id, test_mode: String(isTestMode), partner_email: p.email, description: desc };
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: p.email,
      line_items: toStripeLineItems(items, { testMode: isTestMode }),
      metadata,
      payment_intent_data: { description: desc, metadata },
      success_url: `${SITE_URL}/hyrox/simulation/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/hyrox/simulation/partner.html?team=${team_id}&t=${signTeam(team_id)}&canceled=1`,
      expires_at: Math.floor(Date.now() / 1000) + HOLD_MINUTES * 60 - 5 * 60,
      billing_address_collection: 'auto',
      allow_promotion_codes: false,
      automatic_tax: { enabled: false }
    });
    await ordersStore().setJSON(session.id, { session_id: session.id, team_id, role: 'partner', addons: buy, shirt_size, line_items: items, amount_cents: amount, status: 'pending_payment', created_at: new Date().toISOString(), test_mode: isTestMode });
    console.log(`[hyrox:partner:checkout] team=${team_id} session=${session.id} amount=${amount}`);
    return json({ ok: true, checkout: true, url: session.url });
  } catch (err) {
    console.error('[hyrox:partner:checkout:failed]', err);
    return bad('Your info was saved, but checkout could not start. Please try again.', 500);
  }
};

export const config = { path: '/.netlify/functions/hyrox-partner' };
