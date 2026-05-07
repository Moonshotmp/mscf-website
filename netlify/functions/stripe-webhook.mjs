import Stripe from 'stripe';
import { getStore } from '@netlify/blobs';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const TIER_LABELS = { 'class-fob': 'Class + Fob', 'fob-only': 'Fob-Only' };

// Netlify reserves AWS_* env names, so we use SES_* for the SES IAM creds.
const sesClient = (process.env.SES_ACCESS_KEY_ID && process.env.SES_SECRET_ACCESS_KEY)
  ? new SESClient({
      region: process.env.SES_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.SES_ACCESS_KEY_ID,
        secretAccessKey: process.env.SES_SECRET_ACCESS_KEY
      }
    })
  : null;

async function notifyTeam({ from, to, subject, text, html }) {
  if (!sesClient) {
    console.log('[email:skipped] SES not configured (need SES_ACCESS_KEY_ID + SES_SECRET_ACCESS_KEY)');
    return;
  }
  try {
    const cmd = new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: to },
      ReplyToAddresses: ['info@moonshotcrossfit.com'],
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: text, Charset: 'UTF-8' },
          Html: { Data: html, Charset: 'UTF-8' }
        }
      }
    });
    const result = await sesClient.send(cmd);
    console.log(`[email:sent] messageId=${result.MessageId} to=${to.join(',')}`);
  } catch (err) {
    console.error('[email:exception]', err.name || '?', err.message || err);
  }
}

async function buildOrdersSummary() {
  // Reads all fob-orders, computes running totals + per-plan breakdown.
  // Excludes test-mode orders. Best-effort: returns null on failure so email still sends.
  try {
    const ordersStore = getStore('fob-orders');
    const list = await ordersStore.list();
    const blobs = list?.blobs || [];
    let total_cents = 0;
    let count = 0;
    let founders = 0;
    const planCounts = new Map();
    const members = [];
    for (const b of blobs) {
      const o = await ordersStore.get(b.key, { type: 'json' });
      if (!o || o.mode === 'test') continue;
      total_cents += o.amount_cents || 0;
      count += 1;
      if (o.founder) founders += 1;
      const planKey = `${TIER_LABELS[o.tier] || o.tier} • ${o.people === 'couple' ? 'Couple' : 'Solo'} • ${o.interval === 'annual' ? 'Annual' : 'Monthly'}${o.founder ? ' (Founder)' : ''}`;
      planCounts.set(planKey, (planCounts.get(planKey) || 0) + 1);
      members.push({ name: o.name, email: o.email, plan: planKey, amount_cents: o.amount_cents, paid_at: o.paid_at });
    }
    members.sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''));
    return { total_cents, count, founders, planCounts, members };
  } catch (err) {
    console.error('[summary:failed]', err);
    return null;
  }
}

function fmtPrice(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function notifyNewSignup(order, waiver) {
  const isTest = order.mode === 'test';
  const tierLabel = TIER_LABELS[order.tier] || order.tier;
  const peopleLabel = order.people === 'couple' ? 'Couple' : 'Solo';
  const intervalLabel = order.interval === 'annual' ? 'Annual' : 'Monthly';
  const founderLabel = order.founder ? ' 🌟 FOUNDER' : '';
  const subject = `${isTest ? '[TEST] ' : ''}New Fob Signup: ${order.name} — ${tierLabel} ${peopleLabel} ${intervalLabel}${founderLabel}`;

  const member = waiver?.member || {};
  const m2 = member.member2_full_name ? `\n  Second Member: ${member.member2_full_name} <${member.member2_email}> ${member.member2_phone}` : '';
  const wodify = member.wodify_email ? `\n  Existing Wodify email: ${member.wodify_email}` : '';

  const summary = await buildOrdersSummary();
  const summaryText = summary ? `

═══════════════════════════════════════
PROGRAM TOTALS (paid signups, real money only)
═══════════════════════════════════════
  ${summary.count} member${summary.count === 1 ? '' : 's'} signed up — ${fmtPrice(summary.total_cents)} collected
  ${summary.founders} of 10 Founder slots claimed

By plan:
${[...summary.planCounts.entries()].map(([k, v]) => `  ${v}× ${k}`).join('\n')}

Recent members:
${summary.members.slice(0, 15).map(m => `  ${(m.paid_at || '').slice(0, 10)} — ${m.name} (${m.plan}) — ${fmtPrice(m.amount_cents)}`).join('\n')}${summary.members.length > 15 ? `\n  …and ${summary.members.length - 15} more` : ''}` : '';

  const text = `${isTest ? '⚠ TEST MODE — refund this in Stripe Dashboard.\n\n' : ''}A new Moonshot 24/7 Key Fob membership signed up.

Member: ${order.name} <${order.email}>
  Phone: ${member.phone || '?'}
  Address: ${member.address || ''}, ${member.city || ''}, ${member.state || ''} ${member.zip || ''}
  DOB: ${member.dob || '?'}
  Emergency: ${member.emergency_name || '?'} <${member.emergency_phone || '?'}>${wodify}${m2}

Plan: ${tierLabel} • ${peopleLabel} • ${intervalLabel}${order.founder ? ' • FOUNDER' : ''}
Charged: ${fmtPrice(order.amount_cents)}${order.interval === 'annual' ? ' / year' : ' / month'} (auto-renews)

Stripe Customer: https://dashboard.stripe.com/customers/${order.customer_id}
Stripe Subscription: https://dashboard.stripe.com/subscriptions/${order.subscription_id}

Waiver record ID: ${order.waiver_id}
IP at signing: ${waiver?.ip || '?'}
Signed at: ${waiver?.signed_at || '?'}

Next steps:
1. When the fob system is installed, schedule pickup + orientation
2. Issue the fob and activate the member
${summaryText}
`;

  const summaryHtml = summary ? `
<div style="background:#101921;color:#F0EEE9;border-radius:12px;padding:20px;margin-bottom:24px;">
  <div style="font-family:'Oswald',-apple-system,sans-serif;text-transform:uppercase;letter-spacing:1.5px;font-size:12px;color:#B8986E;margin-bottom:8px;">Program Totals</div>
  <div style="font-size:32px;font-weight:700;line-height:1;margin-bottom:4px;">${fmtPrice(summary.total_cents)}</div>
  <div style="color:#B2BFBE;font-size:14px;margin-bottom:16px;">${summary.count} paid member${summary.count === 1 ? '' : 's'} · <strong style="color:#B8986E;">${summary.founders}/10 Founder slots</strong> claimed</div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${[...summary.planCounts.entries()].map(([k, v]) => `<tr><td style="padding:4px 0;color:#B2BFBE;">${k}</td><td style="padding:4px 0;text-align:right;color:#F0EEE9;font-weight:600;">${v}</td></tr>`).join('')}
  </table>
</div>
<details style="margin-bottom:24px;">
  <summary style="cursor:pointer;color:#B8986E;font-weight:600;font-size:14px;">All paid members (${summary.members.length})</summary>
  <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;">
    <tr style="border-bottom:1px solid #ddd;"><th style="text-align:left;padding:6px 0;color:#666;">Date</th><th style="text-align:left;padding:6px 0;color:#666;">Member</th><th style="text-align:left;padding:6px 0;color:#666;">Plan</th><th style="text-align:right;padding:6px 0;color:#666;">Paid</th></tr>
    ${summary.members.map(m => `<tr><td style="padding:6px 0;color:#888;">${(m.paid_at || '').slice(0, 10)}</td><td style="padding:6px 0;">${m.name}</td><td style="padding:6px 0;color:#666;">${m.plan}</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmtPrice(m.amount_cents)}</td></tr>`).join('')}
  </table>
</details>` : '';

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.6;color:#101921;max-width:640px;margin:0 auto;padding:20px;">
${isTest ? `<div style="background:#fee2e2;border:2px solid #ef4444;border-radius:8px;padding:12px 16px;margin-bottom:20px;color:#991b1b;font-weight:600;">⚠ TEST MODE — refund this charge in Stripe Dashboard.</div>` : ''}
<h1 style="color:#101921;font-size:22px;margin:0 0 16px;">New Fob Signup${order.founder ? ' 🌟' : ''}</h1>
<p style="font-size:18px;margin:0 0 4px;"><strong>${order.name}</strong> &lt;${order.email}&gt;</p>
<p style="color:#666;margin:0 0 24px;">${member.phone || ''} · ${member.city || ''}, ${member.state || ''}</p>

<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
<tr><td style="padding:8px 0;color:#666;width:140px;">Plan</td><td style="padding:8px 0;"><strong>${tierLabel} • ${peopleLabel} • ${intervalLabel}</strong>${order.founder ? ' <span style="background:#B8986E;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.5px;">FOUNDER</span>' : ''}</td></tr>
<tr><td style="padding:8px 0;color:#666;">Charged</td><td style="padding:8px 0;"><strong>${fmtPrice(order.amount_cents)}${order.interval === 'annual' ? ' / year' : ' / month'}</strong> (auto-renews)</td></tr>
<tr><td style="padding:8px 0;color:#666;">Address</td><td style="padding:8px 0;">${member.address || ''}, ${member.city || ''}, ${member.state || ''} ${member.zip || ''}</td></tr>
<tr><td style="padding:8px 0;color:#666;">DOB</td><td style="padding:8px 0;">${member.dob || '?'}</td></tr>
<tr><td style="padding:8px 0;color:#666;">Emergency</td><td style="padding:8px 0;">${member.emergency_name || ''} &lt;${member.emergency_phone || ''}&gt;</td></tr>
${member.wodify_email ? `<tr><td style="padding:8px 0;color:#666;">Wodify email</td><td style="padding:8px 0;">${member.wodify_email}</td></tr>` : ''}
${member.member2_full_name ? `<tr><td style="padding:8px 0;color:#666;">Second member</td><td style="padding:8px 0;"><strong>${member.member2_full_name}</strong> &lt;${member.member2_email}&gt; · ${member.member2_phone}</td></tr>` : ''}
</table>

<div style="background:#F0EEE9;border-left:4px solid #B8986E;padding:14px 18px;margin-bottom:24px;">
<strong style="color:#101921;">Next steps:</strong>
<ol style="margin:8px 0 0;padding-left:20px;">
<li>When the fob system is installed, schedule pickup + orientation</li>
<li>Issue the fob and activate the member</li>
</ol>
</div>

${summaryHtml}

<p style="font-size:13px;color:#888;">
<a href="https://dashboard.stripe.com/customers/${order.customer_id}" style="color:#B8986E;">Stripe customer</a> ·
<a href="https://dashboard.stripe.com/subscriptions/${order.subscription_id}" style="color:#B8986E;">Subscription</a> ·
Waiver: <code>${order.waiver_id}</code>
</p>
</body></html>`;

  await notifyTeam({
    from: process.env.FOB_NOTIFY_FROM || 'Moonshot CrossFit <noreply@updates.moonshotclinic.com>',
    to: ['info@moonshotcrossfit.com', 'tom@moonshotmp.com'],
    subject,
    text,
    html
  });
}

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
        const { waiver_id, tier, people, interval, mode, founder_claimed } = session.metadata || {};

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
          stripe_subscription_id: session.subscription || null,
          stripe_customer: session.customer,
          amount_paid_cents: session.amount_total,
          paid_at: new Date().toISOString(),
          billing_details: session.customer_details || null
        };
        await waiverStore.setJSON(waiver_id, updated);

        const ordersStore = getStore('fob-orders');
        const orderRecord = {
          session_id: session.id,
          subscription_id: session.subscription || null,
          customer_id: session.customer,
          waiver_id, tier, people, interval, mode,
          founder: founder_claimed === 'true',
          amount_cents: session.amount_total,
          email: session.customer_details?.email || waiver.member.email,
          name: waiver.member.full_name,
          paid_at: updated.paid_at
        };
        await ordersStore.setJSON(session.id, orderRecord);

        console.log(`[order:paid] session=${session.id} sub=${session.subscription} waiver=${waiver_id} tier=${tier} people=${people} interval=${interval} mode=${mode} founder=${founder_claimed} amount=${session.amount_total} email=${updated.billing_details?.email}`);

        // Email Tom + info@ — fire-and-forget; failures are logged but don't break the webhook.
        await notifyNewSignup(orderRecord, updated);
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

      case 'invoice.payment_succeeded': {
        const invoice = stripeEvent.data.object;
        if (invoice.billing_reason === 'subscription_cycle') {
          console.log(`[renewal:succeeded] sub=${invoice.subscription} customer=${invoice.customer} amount=${invoice.amount_paid} email=${invoice.customer_email}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object;
        console.error(`[renewal:failed] sub=${invoice.subscription} customer=${invoice.customer} email=${invoice.customer_email} attempt=${invoice.attempt_count} next_attempt=${invoice.next_payment_attempt}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        const { waiver_id, founder_claimed } = sub.metadata || {};
        console.log(`[subscription:canceled] sub=${sub.id} waiver=${waiver_id} customer=${sub.customer} canceled_at=${sub.canceled_at} founder=${founder_claimed}`);
        if (waiver_id) {
          const waiverStore = getStore('fob-waivers');
          const waiver = await waiverStore.get(waiver_id, { type: 'json' });
          if (waiver) {
            await waiverStore.setJSON(waiver_id, {
              ...waiver,
              status: 'canceled',
              canceled_at: new Date().toISOString()
            });
          }
        }
        // Restore founder slot if a Founder canceled — keeps the 10-slot pool accurate.
        if (founder_claimed === 'true') {
          const founderStore = getStore('fob');
          const cur = await founderStore.get('founder-count', { type: 'json' });
          if (cur && cur.remaining < (cur.total || 10)) {
            cur.remaining = cur.remaining + 1;
            await founderStore.setJSON('founder-count', cur);
            console.log(`[founder:restored-on-cancel] sub=${sub.id} waiver=${waiver_id} new_remaining=${cur.remaining}`);
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
