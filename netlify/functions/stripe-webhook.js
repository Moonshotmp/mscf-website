const Stripe = require('stripe');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET env var missing');
    return { statusCode: 500, body: 'Webhook not configured' };
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY env var missing');
    return { statusCode: 500, body: 'Webhook not configured' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  let stripeEvent;
  try {
    // event.body is the raw body when Netlify sets `external_node_modules` correctly,
    // but for webhook signature verification we need the *raw* body. Netlify provides
    // it as a string for non-base64 requests.
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : event.body;
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        const { waiver_id, tier, people, mode, founder_claimed } = session.metadata || {};

        if (!waiver_id) {
          console.warn('checkout.session.completed missing waiver_id metadata', session.id);
          break;
        }

        const waiverStore = getStore('fob-waivers');
        const waiver = await waiverStore.get(waiver_id, { type: 'json' });
        if (!waiver) {
          console.error(`Waiver not found for completed session: ${waiver_id}`);
          break;
        }

        const updated = {
          ...waiver,
          status: 'paid',
          stripe_session_id: session.id,
          stripe_payment_intent: session.payment_intent,
          stripe_customer: session.customer,
          amount_paid_cents: session.amount_total,
          paid_at: new Date().toISOString(),
          billing_details: session.customer_details || null
        };
        await waiverStore.setJSON(waiver_id, updated);

        // Audit log indexed by date for easy retrieval
        const ordersStore = getStore('fob-orders');
        await ordersStore.setJSON(session.id, {
          session_id: session.id,
          waiver_id,
          tier, people, mode,
          founder: founder_claimed === 'true',
          amount_cents: session.amount_total,
          email: session.customer_details?.email || waiver.member.email,
          name: waiver.member.full_name,
          paid_at: updated.paid_at
        });

        console.log(`[order:paid] session=${session.id} waiver=${waiver_id} tier=${tier} people=${people} mode=${mode} founder=${founder_claimed} amount=${session.amount_total} email=${updated.billing_details?.email}`);
        break;
      }

      case 'checkout.session.expired': {
        // Session expired without payment. If a founder slot was claimed, restore it.
        const session = stripeEvent.data.object;
        const { waiver_id, founder_claimed } = session.metadata || {};
        if (founder_claimed === 'true') {
          const founderStore = getStore('fob');
          const cur = await founderStore.get('founder-count', { type: 'json' });
          if (cur && cur.remaining < (cur.total || 10)) {
            cur.remaining = cur.remaining + 1;
            await founderStore.setJSON('founder-count', cur);
            console.log(`[founder:restored] session=${session.id} waiver=${waiver_id} new_remaining=${cur.remaining}`);
          }
        }
        break;
      }

      default:
        // Ignore other event types
        break;
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('Webhook handler error:', err);
    return { statusCode: 500, body: 'Webhook handler failed' };
  }
};
