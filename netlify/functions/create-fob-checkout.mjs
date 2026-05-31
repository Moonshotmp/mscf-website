import Stripe from 'stripe';
import { getStore } from '@netlify/blobs';

const SITE_URL = process.env.URL || 'https://moonshotcrossfit.com';

// Cents. Standard pricing only — founder/pre-sale tiers retired 2026-05-31.
const PRICES = {
  solo: {
    'class-fob': { monthly: 6500,  annual: 70000 },
    'fob-only':  { monthly: 20500, annual: 220000 }
  },
  couple: {
    'class-fob': { monthly: 9000,  annual: 96000 },
    'fob-only':  { monthly: 33500, annual: 360000 }
  }
};

const TIER_LABELS = { 'class-fob': 'Class + Fob', 'fob-only': 'Fob-Only' };

function bad(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
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

  const { waiver_id, tier, people, interval, test_token } = payload;
  if (!waiver_id
      || !['monthly','annual'].includes(interval)
      || !PRICES[people]?.[tier]?.[interval]) {
    return bad('Missing or invalid checkout params');
  }

  // Test mode: token-gated. $1 subscription matching the chosen interval.
  const isTestMode = test_token && process.env.FOB_TEST_TOKEN && test_token === process.env.FOB_TEST_TOKEN;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  const waiverStore = getStore('fob-waivers');
  const waiver = await waiverStore.get(waiver_id, { type: 'json' });
  if (!waiver) return bad('Waiver not found — please complete the waiver form');
  if (waiver.status === 'paid') return bad('This waiver has already been used for a paid membership');

  // Standard pricing for all live signups.
  const finalMode = 'regular';

  const amount = isTestMode ? 100 : PRICES[people][tier][interval];
  if (!amount) return bad('Pricing lookup failed', 500);

  const stripeInterval = interval === 'annual' ? 'year' : 'month';
  const intervalLabel = interval === 'annual' ? 'Annual' : 'Monthly';

  const productName = isTestMode
    ? `TEST — ${TIER_LABELS[tier]} (${people === 'couple' ? 'Couple' : 'Solo'}, ${intervalLabel})`
    : `Moonshot 24/7 Key Fob — ${TIER_LABELS[tier]} (${people === 'couple' ? 'Couple' : 'Solo'}, ${intervalLabel})`;

  const productDesc = isTestMode
    ? `TEST MODE — $1/${stripeInterval} smoke test. Cancel + refund after verification.`
    : (interval === 'annual'
        ? `Auto-renews yearly. Cancel anytime.`
        : `Auto-renews monthly. Cancel anytime.`);

  await waiverStore.setJSON(waiver_id, {
    ...waiver,
    final_mode: isTestMode ? 'test' : finalMode,
    final_interval: interval,
    final_amount_usd: amount / 100,
    founder_claimed: false,
    test_mode: isTestMode
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: waiver.member.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: productName, description: productDesc },
          unit_amount: amount,
          recurring: { interval: stripeInterval }
        },
        quantity: 1
      }],
      metadata: {
        waiver_id, tier, people, interval,
        mode: isTestMode ? 'test' : finalMode,
        founder_claimed: 'false',
        test_mode: String(isTestMode),
        member_email: waiver.member.email,
        member_name: waiver.member.full_name
      },
      subscription_data: {
        description: `${productName} — ${waiver.member.full_name}`,
        metadata: {
          waiver_id, tier, people, interval,
          mode: isTestMode ? 'test' : finalMode,
          founder_claimed: 'false',
          test_mode: String(isTestMode)
        }
      },
      success_url: `${SITE_URL}/fob/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/fob/cancel.html`,
      automatic_tax: { enabled: false },
      billing_address_collection: 'required',
      allow_promotion_codes: false
    });

    console.log(`[checkout:created] waiver=${waiver_id} session=${session.id} amount=${amount} mode=${finalMode}`);

    return new Response(JSON.stringify({ url: session.url, session_id: session.id, final_mode: finalMode }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Stripe session create failed', err);
    return bad('Could not create checkout session. Please try again.', 500);
  }
};

export const config = { path: '/.netlify/functions/create-fob-checkout' };
