const Stripe = require('stripe');
const { getStore } = require('@netlify/blobs');

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

async function claimFounderSlot(store) {
  // Optimistic decrement. Race-tolerant: with 10 slots and low concurrency,
  // at-worst we issue one extra founder slot per simultaneous race; Tom can
  // reconcile. If contention becomes an issue later, switch to ETag-based CAS.
  let state = await store.get(FOUNDER_KEY, { type: 'json' });
  if (!state) {
    state = { remaining: TOTAL_FOUNDER_SLOTS, total: TOTAL_FOUNDER_SLOTS };
  }
  if (state.remaining <= 0) return { claimed: false, remaining: 0 };
  state.remaining = state.remaining - 1;
  await store.setJSON(FOUNDER_KEY, state);
  return { claimed: true, remaining: state.remaining };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY env var missing');
    return { statusCode: 500, body: JSON.stringify({ error: 'Payment system not configured' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { waiver_id, tier, people, mode } = payload;

  if (!waiver_id || !PRICES[people]?.[tier]) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid checkout params' }) };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  // Verify waiver exists
  const waiverStore = getStore('fob-waivers');
  const waiver = await waiverStore.get(waiver_id, { type: 'json' });
  if (!waiver) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Waiver not found — please complete the waiver form' }) };
  }
  if (waiver.status === 'paid') {
    return { statusCode: 400, body: JSON.stringify({ error: 'This waiver has already been used for a paid membership' }) };
  }

  // Determine final pricing — re-check founder availability server-side
  let finalMode = mode;
  let founderClaimed = false;
  const founderStore = getStore(FOUNDER_STORE);

  if (mode === 'founder') {
    const claim = await claimFounderSlot(founderStore);
    if (!claim.claimed) {
      finalMode = 'presale';
    } else {
      founderClaimed = true;
    }
  }

  const amount = PRICES[people][tier][finalMode];
  if (!amount) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Pricing lookup failed' }) };
  }

  const productName = `Moonshot 24/7 Key Fob — ${TIER_LABELS[tier]} (${people === 'couple' ? 'Couple' : 'Solo'})`;
  const productDesc = finalMode === 'founder'
    ? `Founders Club — Annual prepay. $100 off pre-sale + Founder status.`
    : (finalMode === 'presale' ? 'Pre-sale annual prepay.' : 'Annual prepay.');

  // Update waiver record with final mode/amount BEFORE creating session
  await waiverStore.setJSON(waiver_id, {
    ...waiver,
    final_mode: finalMode,
    final_amount_usd: amount / 100,
    founder_claimed: founderClaimed
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: waiver.member.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: productName,
            description: productDesc
          },
          unit_amount: amount
        },
        quantity: 1
      }],
      metadata: {
        waiver_id,
        tier,
        people,
        mode: finalMode,
        founder_claimed: String(founderClaimed),
        member_email: waiver.member.email,
        member_name: waiver.member.full_name
      },
      payment_intent_data: {
        description: `${productName} — ${waiver.member.full_name}`,
        metadata: {
          waiver_id,
          tier,
          people,
          mode: finalMode
        }
      },
      success_url: `${SITE_URL}/fob/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/fob/cancel.html`,
      automatic_tax: { enabled: false },
      billing_address_collection: 'required',
      allow_promotion_codes: false
    });

    console.log(`[checkout:created] waiver=${waiver_id} session=${session.id} amount=${amount} mode=${finalMode} founder_claimed=${founderClaimed}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url, session_id: session.id, final_mode: finalMode })
    };
  } catch (err) {
    console.error('Stripe session create failed', err);
    // If founder was claimed but Stripe failed, restore the slot
    if (founderClaimed) {
      const cur = await founderStore.get(FOUNDER_KEY, { type: 'json' });
      if (cur && cur.remaining < TOTAL_FOUNDER_SLOTS) {
        cur.remaining = cur.remaining + 1;
        await founderStore.setJSON(FOUNDER_KEY, cur);
      }
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not create checkout session. Please try again.' })
    };
  }
};
