import { getStore } from '@netlify/blobs';

const TOTAL_FOUNDER_SLOTS = 10;
const STORE_NAME = 'fob';
const KEY = 'founder-count';

export default async () => {
  try {
    const store = getStore(STORE_NAME);
    let data = await store.get(KEY, { type: 'json' });
    if (!data) {
      data = { remaining: TOTAL_FOUNDER_SLOTS, total: TOTAL_FOUNDER_SLOTS };
      await store.setJSON(KEY, data);
    }
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('founder-count error', err);
    return new Response(JSON.stringify({ error: 'Failed to read founder count' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/.netlify/functions/founder-count' };
