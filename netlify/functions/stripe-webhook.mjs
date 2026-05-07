import Stripe from 'stripe';
import { getStore } from '@netlify/blobs';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    console.error('Stripe env vars missing');
    return new Response('Webhook not configured', { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  // Stripe needs the raw, unparsed body.
  const rawBody = await req.text();

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
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

        const ordersStore = getStore('fob-orders');
        await ordersStore.setJSON(session.id, {
          session_id: session.id,
          waiver_id, tier, people, mode,
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
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Webhook handler failed', { status: 500 });
  }
};

export const config = { path: '/.netlify/functions/stripe-webhook' };
