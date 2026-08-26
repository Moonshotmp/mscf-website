// GET /.netlify/functions/hyrox-config
// Public event config: dates, heats with live availability, pricing, shirt sizes.
import { publicConfig, json } from './_shared/hyrox.mjs';

export default async () => {
  try {
    return json(await publicConfig(), 200, { 'Access-Control-Allow-Origin': '*' });
  } catch (err) {
    console.error('[hyrox-config]', err);
    return json({ error: 'Config unavailable' }, 500);
  }
};

export const config = { path: '/.netlify/functions/hyrox-config' };
