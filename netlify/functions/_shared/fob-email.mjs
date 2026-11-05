import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export const TIER_LABELS = { 'class-fob': 'Class + Fob', 'fob-only': 'Fob-Only' };
export const FOB_NOTIFY_TO = ['info@moonshotcrossfit.com', 'tom@moonshotmp.com'];
export const FOB_NOTIFY_FROM = process.env.FOB_NOTIFY_FROM || 'Moonshot CrossFit <noreply@updates.moonshotclinic.com>';

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

export function fmtPrice(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function notifyTeam({ from, to, subject, text, html }) {
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

// Fired by save-waiver when a member signs and chooses to pay cash (no Stripe).
// The money has NOT been collected yet; the email is the collection reminder.
export async function notifyCashSignup(waiver) {
  const member = waiver.member || {};
  const tierLabel = TIER_LABELS[waiver.tier] || waiver.tier;
  const peopleLabel = waiver.people === 'couple' ? 'Couple' : 'Solo';
  const intervalLabel = waiver.interval === 'annual' ? 'Annual' : 'Monthly';
  const per = waiver.interval === 'annual' ? '/ year' : '/ month';
  const amount = `$${Number(waiver.price_usd || 0).toLocaleString()}`;
  const subject = `💵 CASH Fob Signup — collect ${amount}: ${member.full_name} — ${tierLabel} ${peopleLabel} ${intervalLabel}`;

  const m2 = member.member2_full_name ? `\n  Second Member: ${member.member2_full_name} <${member.member2_email}> ${member.member2_phone}` : '';
  const wodify = member.wodify_email ? `\n  Existing Wodify email: ${member.wodify_email}` : '';

  const text = `A member signed the 24/7 Key Fob agreement and chose to PAY CASH. Nothing has been collected yet.

Member: ${member.full_name} <${member.email}>
  Phone: ${member.phone || '?'}
  Address: ${member.address || ''}, ${member.city || ''}, ${member.state || ''} ${member.zip || ''}
  DOB: ${member.dob || '?'}
  Emergency: ${member.emergency_name || '?'} <${member.emergency_phone || '?'}>${wodify}${m2}

Plan: ${tierLabel} • ${peopleLabel} • ${intervalLabel}
TO COLLECT: ${amount} ${per} (cash — no auto-renew; collect again each ${waiver.interval === 'annual' ? 'year' : 'month'})

Waiver record ID: ${waiver.waiver_id}
Agreement version: ${waiver.waiver_version}
IP at signing: ${waiver.ip}
Signed at: ${waiver.signed_at}

Next steps:
1. Collect ${amount} cash from ${member.full_name}
2. Issue the fob and activate the member
3. Note the renewal date — cash members are not billed automatically
`;

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.6;color:#101921;max-width:640px;margin:0 auto;padding:20px;">
<div style="background:#fef3c7;border:2px solid #d97706;border-radius:8px;padding:12px 16px;margin-bottom:20px;color:#92400e;font-weight:600;">💵 CASH signup — nothing collected yet. Collect <strong>${amount} ${per}</strong> before activating the fob.</div>
<h1 style="color:#101921;font-size:22px;margin:0 0 16px;">New Fob Signup (Cash)</h1>
<p style="font-size:18px;margin:0 0 4px;"><strong>${member.full_name}</strong> &lt;${member.email}&gt;</p>
<p style="color:#666;margin:0 0 24px;">${member.phone || ''} · ${member.city || ''}, ${member.state || ''}</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
<tr><td style="padding:8px 0;color:#666;width:140px;">Plan</td><td style="padding:8px 0;"><strong>${tierLabel} • ${peopleLabel} • ${intervalLabel}</strong></td></tr>
<tr><td style="padding:8px 0;color:#666;">To collect</td><td style="padding:8px 0;"><strong>${amount} ${per}</strong> (cash, no auto-renew)</td></tr>
<tr><td style="padding:8px 0;color:#666;">Address</td><td style="padding:8px 0;">${member.address || ''}, ${member.city || ''}, ${member.state || ''} ${member.zip || ''}</td></tr>
<tr><td style="padding:8px 0;color:#666;">DOB</td><td style="padding:8px 0;">${member.dob || '?'}</td></tr>
<tr><td style="padding:8px 0;color:#666;">Emergency</td><td style="padding:8px 0;">${member.emergency_name || ''} &lt;${member.emergency_phone || ''}&gt;</td></tr>
${member.wodify_email ? `<tr><td style="padding:8px 0;color:#666;">Wodify email</td><td style="padding:8px 0;">${member.wodify_email}</td></tr>` : ''}
${member.member2_full_name ? `<tr><td style="padding:8px 0;color:#666;">Second member</td><td style="padding:8px 0;"><strong>${member.member2_full_name}</strong> &lt;${member.member2_email}&gt; · ${member.member2_phone}</td></tr>` : ''}
</table>
<div style="background:#F0EEE9;border-left:4px solid #B8986E;padding:14px 18px;margin-bottom:24px;">
<strong style="color:#101921;">Next steps:</strong>
<ol style="margin:8px 0 0;padding-left:20px;">
<li>Collect ${amount} cash from ${member.full_name}</li>
<li>Issue the fob and activate the member</li>
<li>Note the renewal date — cash members are not billed automatically</li>
</ol>
</div>
<p style="font-size:13px;color:#888;">Waiver: <code>${waiver.waiver_id}</code> · Agreement ${waiver.waiver_version} · signed ${waiver.signed_at} from ${waiver.ip}</p>
</body></html>`;

  await notifyTeam({ from: FOB_NOTIFY_FROM, to: FOB_NOTIFY_TO, subject, text, html });
}
