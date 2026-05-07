const { getStore } = require('@netlify/blobs');

const TOTAL_FOUNDER_SLOTS = 10;
const STORE_NAME = 'fob';
const KEY = 'founder-count';

async function getFounderState(store) {
  const data = await store.get(KEY, { type: 'json' });
  if (!data) {
    const init = { remaining: TOTAL_FOUNDER_SLOTS, total: TOTAL_FOUNDER_SLOTS };
    await store.setJSON(KEY, init);
    return init;
  }
  return data;
}

exports.handler = async () => {
  try {
    const store = getStore(STORE_NAME);
    const state = await getFounderState(store);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(state)
    };
  } catch (err) {
    console.error('founder-count error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to read founder count', detail: String(err && (err.message || err)), stack: err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : null })
    };
  }
};

exports.STORE_NAME = STORE_NAME;
exports.KEY = KEY;
exports.TOTAL_FOUNDER_SLOTS = TOTAL_FOUNDER_SLOTS;
