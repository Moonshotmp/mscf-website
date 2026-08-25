// GET /.netlify/functions/hyrox-cancel?team=<id>&t=<token>
// Stripe cancel_url target: releases the heat hold immediately instead of waiting
// for the 30-minute session expiry, then bounces back to the registration form.
import { SITE_URL, teamsStore, verifyTeamToken } from './_shared/hyrox.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const team_id = url.searchParams.get('team'), t = url.searchParams.get('t');
  try {
    if (verifyTeamToken(team_id, t)) {
      const store = teamsStore();
      const team = await store.get(team_id, { type: 'json' });
      if (team && team.status === 'pending_payment') {
        await store.setJSON(team_id, { ...team, status: 'canceled', canceled_at: new Date().toISOString() });
        console.log(`[hyrox:canceled] team=${team_id} heat=${team.heat_id}`);
      }
    }
  } catch (err) { console.error('[hyrox-cancel]', err); }
  return Response.redirect(`${SITE_URL}/hyrox/simulation/?canceled=1#register`, 302);
};

export const config = { path: '/.netlify/functions/hyrox-cancel' };
