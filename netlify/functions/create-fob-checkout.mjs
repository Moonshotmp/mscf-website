import Stripe from 'stripe';
import { getStore } from '@netlify/blobs';

const SITE_URL = process.env.URL || 'https://moonshotcrossfit.com';

const PRICES = {
  solo: {
    'class-fob': { founder: 50000, presale: 60000, regular: 70000 },
    'fob-only': { founder: 190000, presale: 200000, regular: 220000 }
  },
  couple: {
    'class-fob': { founder: 74000, presale: 84000, regular: 96000 },
    'fob-only': { founder: 320000, presale: 330000, regular: 360000 }
  }
};

const TIER_LABELS = { 'class-fob': 'Class + Fob', 'fob-only': 'Fob-Only' };

const FOUNDER_STORE = 'fob';
const FOUNDER_KEY = 'founder-count';
const TOTAL_FOUNDER_SLOTS = 10;

function bad(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function claimFounderSlot(store) {
  let state = await store.get(FOUNDER_KEY, { type: 'json' });
  if (!state) state = { remaining: TOTAL_FOUNDER_SLOTS, total: TOTAL_FOUNDER_SLOTS };
  if (state.remaining <= 0) return { claimed: false, remaining: 0 };
  state.remaining = state.remaining - 1;
  await store.setJSON(FOUNDER_KEY, state);
  return { claimed: true, remaining: state.remaining };
}

export default async (req) => {
  if (req.method !== 'POST') return bad('Method not allowed', 405);

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY env var missing');
    return bad('Payment system not configured', 500);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return bad('Invalid JSON');
  }

  const { waiver_id, tier, people, mode, test_token } = payload;
  if (!waiver_id || !PRICES[people]?.[tier]) return bad('Missing or invalid checkout params');

  // Test mode: requires server-side token match. $1 charge, no founder slot consumed.
  const isTestMode = test_token && process.env.FOB_TEST_TOKEN && test_token === process.env.FOB_TEST_TOKEN;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  const waiverStore = getStore('fob-waivers');
  const waiver = await waiverStore.get(waiver_id, { type: 'json' });
  if (!waiver) return bad('Waiver not found — please complete the waiver form');
  if (waiver.status === 'paid') return bad('This waiver has already been used for a paid membership');

  let finalMode = mode;
  let founderClaimed = false;
  const founderStore = getStore(FOUNDER_STORE);

  if (!isTestMode && mode === 'founder') {
    const claim = await claimFounderSlot(founderStore);
    if (!claim.claimed) finalMode = 'presale';
    else founderClaimed = true;
  }

  const amount = isTestMode ? 100 : PRICES[people][tier][finalMode];
  if (!amount) return bad('Pricing lookup failed', 500);

  const productName = isTestMode
    ? `TEST — ${TIER_LABELS[tier]} (${people === 'couple' ? 'Couple' : 'Solo'})`
    : `Moonshot 24/7 Key Fob — ${TIER_LABELS[tier]} (${people === 'couple' ? 'Couple' : 'Solo'})`;
  const productDesc = isTestMode
    ? 'TEST MODE — $1 live-mode smoke test. Refund after verification.'
    : (finalMode === 'founder'
        ? 'Founders Club — Annual prepay. $100 off pre-sale + Founder status.'
        : (finalMode === 'presale' ? 'Pre-sale annual prepay.' : 'Annual prepay.'));

  await waiverStore.setJSON(waiver_id, {
    ...waiver,
    final_mode: isTestMode ? 'test' : finalMode,
    final_amount_usd: amount / 100,
    founder_claimed: founderClaimed,
    test_mode: isTestMode
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: waiver.member.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: productName, description: productDesc },
          unit_amount: amount
        },
        quantity: 1
      }],
      metadata: {
        waiver_id, tier, people, mode: isTestMode ? 'test' : finalMode,
        founder_claimed: String(founderClaimed),
        test_mode: String(isTestMode),
        member_email: waiver.member.email,
        member_name: waiver.member.full_name
      },
      payment_intent_data: {
        description: `${productName} — ${waiver.member.full_name}`,
        metadata: { waiver_id, tier, people, mode: isTestMode ? 'test' : finalMode, test_mode: String(isTestMode) }
      },
      success_url: `${SITE_URL}/fob/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/fob/cancel.html`,
      automatic_tax: { enabled: false },
      billing_address_collection: 'required',
      allow_promotion_codes: false
    });

    console.log(`[checkout:created] waiver=${waiver_id} session=${session.id} amount=${amount} mode=${finalMode} founder_claimed=${founderClaimed}`);

    return new Response(JSON.stringify({ url: session.url, session_id: session.id, final_mode: finalMode }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Stripe session create failed', err);
    if (founderClaimed) {
      const cur = await founderStore.get(FOUNDER_KEY, { type: 'json' });
      if (cur && cur.remaining < TOTAL_FOUNDER_SLOTS) {
        cur.remaining = cur.remaining + 1;
        await founderStore.setJSON(FOUNDER_KEY, cur);
      }
    }
    return bad('Could not create checkout session. Please try again.', 500);
  }
};

export const config = { path: '/.netlify/functions/create-fob-checkout' };
