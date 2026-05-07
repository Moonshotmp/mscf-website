const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

const VALID_TIERS = ['class-fob', 'fob-only'];
const VALID_PEOPLE = ['solo', 'couple'];
const VALID_MODES = ['founder', 'presale', 'regular'];

const REQUIRED_MEMBER_FIELDS = [
  'full_name', 'dob', 'email', 'phone',
  'address', 'city', 'state', 'zip',
  'emergency_name', 'emergency_phone',
  'signature'
];

const REQUIRED_ACK = ['ack_read', 'ack_risk', 'ack_release', 'ack_rules', 'ack_age'];
const REQUIRED_COUPLE_FIELDS = ['member2_full_name', 'member2_dob', 'member2_email', 'member2_phone', 'member2_signature'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { tier, people, mode, price_usd, member, signed_at, user_agent } = payload;

  if (!VALID_TIERS.includes(tier) || !VALID_PEOPLE.includes(people) || !VALID_MODES.includes(mode)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid tier/people/mode' }) };
  }

  if (!member || typeof member !== 'object') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing member info' }) };
  }

  for (const f of REQUIRED_MEMBER_FIELDS) {
    if (!member[f] || String(member[f]).trim() === '') {
      return { statusCode: 400, body: JSON.stringify({ error: `Missing required field: ${f}` }) };
    }
  }

  for (const a of REQUIRED_ACK) {
    if (!member[a]) {
      return { statusCode: 400, body: JSON.stringify({ error: `Missing acknowledgment: ${a}` }) };
    }
  }

  if (member.signature.trim().toLowerCase() !== member.full_name.trim().toLowerCase()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Signature must match full legal name' }) };
  }

  if (people === 'couple') {
    for (const f of REQUIRED_COUPLE_FIELDS) {
      if (!member[f] || String(member[f]).trim() === '') {
        return { statusCode: 400, body: JSON.stringify({ error: `Missing required couple field: ${f}` }) };
      }
    }
    if (member.member2_signature.trim().toLowerCase() !== member.member2_full_name.trim().toLowerCase()) {
      return { statusCode: 400, body: JSON.stringify({ error: "Second member's signature must match their full legal name" }) };
    }
  }

  // Capture network metadata
  const ip = event.headers['x-nf-client-connection-ip']
    || event.headers['client-ip']
    || (event.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || 'unknown';

  const waiver_id = crypto.randomUUID();

  const record = {
    waiver_id,
    tier, people, mode, price_usd,
    member,
    signed_at: signed_at || new Date().toISOString(),
    user_agent: user_agent || null,
    ip,
    status: 'pending_payment',
    stripe_session_id: null,
    paid_at: null,
    received_at: new Date().toISOString()
  };

  try {
    const store = getStore('fob-waivers');
    await store.setJSON(waiver_id, record);
    console.log(`[waiver:saved] id=${waiver_id} tier=${tier} people=${people} mode=${mode} email=${member.email}`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waiver_id })
    };
  } catch (err) {
    console.error('save-waiver error', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save waiver' }) };
  }
};
