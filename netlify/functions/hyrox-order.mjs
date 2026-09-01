// GET /.netlify/functions/hyrox-order?session_id=cs_...   → success page (registrant or partner purchase)
// GET /.netlify/functions/hyrox-order?team=<id>&t=<token> → partner page (HMAC-signed link)
import { teamsStore, ordersStore, publicConfig, publicTeamView, verifyTeamToken, partnerLink, stripeClient, json, bad } from './_shared/hyrox.mjs';

export default async (req) => {
  if (req.method !== 'GET') return bad('Method not allowed', 405);
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id');
  const teamId = url.searchParams.get('team');
  const token = url.searchParams.get('t');

  try {
    if (sessionId) {
      if (!/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) return bad('Invalid session');
      const stripe = stripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const md = session.metadata || {};
      if (!md.team_id || !String(md.kind || '').startsWith('hyrox')) return bad('Not a race order', 404);
      const team = await teamsStore().get(md.team_id, { type: 'json' });
      if (!team) return bad('Order not found', 404);
      const forRole = md.kind === 'hyrox_partner_addons' ? 'partner' : 'registrant';
      let order = null;
      if (forRole === 'partner') order = await ordersStore().get(sessionId, { type: 'json' });
      return json({
        kind: md.kind,
        payment_status: session.payment_status,           // 'paid' | 'unpaid'
        webhook_processed: forRole === 'partner' ? order?.status === 'paid' : team.status === 'paid',
        amount_total: session.amount_total,
        team: publicTeamView(team, { forRole }),
        // Signed server-side: the success URL only carries the (unguessable) Stripe
        // session id, so the registrant is entitled to their partner's invite link.
        partner_link: forRole === 'registrant' && team.athletes.partner ? partnerLink(team.team_id) : null,
        config: await publicConfig()
      });
    }

    if (teamId && token) {
      if (!verifyTeamToken(teamId, token)) return bad('This link is not valid', 403);
      const team = await teamsStore().get(teamId, { type: 'json' });
      if (!team) return bad('Team not found', 404);
      if (!team.athletes.partner) return bad('This registration has no partner', 404);
      if (team.status !== 'paid') return bad('This registration is not complete yet', 409);
      return json({ team: publicTeamView(team, { forRole: 'partner' }), config: await publicConfig() });
    }

    return bad('Missing parameters');
  } catch (err) {
    console.error('[hyrox-order]', err);
    return bad('Could not load order', 500);
  }
};

export const config = { path: '/.netlify/functions/hyrox-order' };
