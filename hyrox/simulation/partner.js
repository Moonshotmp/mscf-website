/* HYROX Race Simulation — partner confirmation + optional add-on purchase */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const params = new URLSearchParams(location.search);
  const team_id = params.get('team'), t = params.get('t');

  function fail(msg) { $('loading').classList.add('hidden'); $('content').classList.add('hidden'); $('error').classList.remove('hidden'); $('error-msg').textContent = msg; }
  if (!team_id || !t) return fail('This link is missing its registration reference.');

  let cfg, team, owned;
  const sel = { shirt: false, dexa: false, labs: false };

  async function load() {
    try {
      const res = await fetch(`/.netlify/functions/hyrox-order?team=${encodeURIComponent(team_id)}&t=${encodeURIComponent(t)}`, { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not load registration');
      cfg = d.config; team = d.team;
    } catch (e) { return fail(e.message); }
    render();
  }

  function render() {
    const r = team.registrant, p = team.partner;
    owned = p.addons;
    $('loading').classList.add('hidden'); $('content').classList.remove('hidden');
    $('reg-first').textContent = r.name.split(' ')[0];
    $('reg-first-2').textContent = r.name.split(' ')[0];
    $('reg-name').textContent = r.name;
    $('heat').textContent = `Heat ${team.heat?.label}`;
    $('name').value = p.name || ''; $('email').value = p.email || ''; $('phone').value = p.phone || '';
    if (params.get('canceled') === '1') $('canceled').classList.remove('hidden');
    if (p.waiver_signed) { $('already').classList.remove('hidden'); $('waiver-card').classList.add('hidden'); }

    const L = cfg.addon_labels;
    const ownedList = [];
    if (owned.shirt) ownedList.push(`${L.shirt} (${p.shirt_size || '?'})`);
    if (owned.baseline) ownedList.push(L.baseline);
    if (owned.dexa) ownedList.push(L.dexa);
    if (owned.labs) ownedList.push(L.labs);
    $('owned').innerHTML = ownedList.length ? ownedList.map(x => `<div class="flex items-center gap-2 text-brand-light"><span class="text-brand-gold">✓</span>${esc(x)} <span class="text-brand-gray text-xs">· already included</span></div>`).join('') : `<div class="text-brand-gray">Race entry · already included</div>`;

    const hasDexa = owned.dexa || owned.baseline, hasLabs = owned.labs || owned.baseline;
    const rows = [
      !owned.shirt && { key: 'shirt', title: L.shirt, sub: 'Race Simulation 2026 tee.', price: cfg.prices.shirt },
      !hasDexa && { key: 'dexa', title: L.dexa, sub: `${cfg.clinic_name} certificate. Book any date through Dec 31.`, price: cfg.prices.dexa, regular: cfg.regular_prices.dexa },
      !hasLabs && { key: 'labs', title: L.labs, sub: `${cfg.clinic_name} certificate. Book any date through Dec 31.`, price: cfg.prices.labs, regular: cfg.regular_prices.labs }
    ].filter(Boolean);
    $('addon-rows').innerHTML = rows.map(row => `<div class="flex items-center justify-between gap-4 py-4"><div><div class="font-semibold text-brand-light">${esc(row.title)}</div><div class="text-brand-gray text-sm">${esc(row.sub)} <span class="text-brand-light">${fmt(row.price)}</span> ${row.regular ? `<span class="price-strike">${fmt(row.regular)}</span>` : ''}</div></div><button type="button" class="toggle" role="switch" aria-checked="false" data-addon="${row.key}" aria-label="${esc(row.title)}"></button></div>`).join('') || '<p class="text-brand-gray text-sm py-2">You already have every add-on. Nice partner.</p>';
    if (!hasDexa && !hasLabs) $('addon-rows').insertAdjacentHTML('beforeend', `<p class="text-brand-gold text-xs pt-3">Add both DEXA + Blood Panel and the Performance Baseline rate (${fmt(cfg.prices.baseline)}, reg. ${fmt(cfg.regular_prices.baseline)}) applies automatically.</p>`);
    $('shirt_size').innerHTML = '<option value="">Pick a size</option>' + cfg.shirt_sizes.map(s => `<option value="${s}">${s}</option>`).join('');

    document.querySelectorAll('.toggle[data-addon]').forEach(btn => btn.addEventListener('click', () => {
      const k = btn.dataset.addon; sel[k] = !sel[k]; btn.setAttribute('aria-checked', String(sel[k]));
      if (k === 'shirt') $('shirt-size-wrap').classList.toggle('hidden', !sel.shirt);
      total(); clearError();
    }));
    total();
    if (!cfg.open) { $('addon-rows').innerHTML = '<p class="text-brand-gray text-sm py-2">Add-on purchases closed October 2.</p>'; }
  }

  function total() {
    const P = cfg.prices, R = cfg.regular_prices;
    const hasDexa = owned.dexa || owned.baseline, hasLabs = owned.labs || owned.baseline;
    let amt = 0, save = 0;
    if (sel.shirt) amt += P.shirt;
    // Only the partner's newly-selected clinic items are priced here; server prices the same way.
    const buyDexa = sel.dexa && !hasDexa, buyLabs = sel.labs && !hasLabs;
    if (buyDexa && buyLabs) { amt += P.baseline; save += R.baseline - P.baseline; }
    else if (buyDexa) { amt += P.dexa; save += R.dexa - P.dexa; }
    else if (buyLabs) { amt += P.labs; save += R.labs - P.labs; }
    $('total').textContent = fmt(amt);
    const sv = $('savings'); if (save > 0) { sv.textContent = `You save ${fmt(save)} vs. regular clinic pricing`; sv.classList.remove('hidden'); } else sv.classList.add('hidden');
    $('submit-btn').textContent = amt > 0 ? `Confirm, Sign & Pay ${fmt(amt)}` : 'Confirm & Sign';
  }

  function showError(msg, el) { const b = $('form-error'); b.textContent = msg; b.classList.remove('hidden'); (el || b).scrollIntoView({ behavior: 'smooth', block: 'center' }); if (el) el.focus({ preventScroll: true }); }
  function clearError() { $('form-error').classList.add('hidden'); }

  $('partner-form').addEventListener('submit', async (e) => {
    e.preventDefault(); clearError();
    const v = (id) => $(id).value.trim();
    const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
    const digits = (s) => s.replace(/\D/g, '').length >= 10;
    if (v('name').split(/\s+/).length < 2) return showError('Enter your full name (first and last).', $('name'));
    if (!isEmail(v('email'))) return showError('Enter a valid email.', $('email'));
    if (!digits(v('phone'))) return showError('Enter your mobile phone.', $('phone'));
    if (v('emergency_name').length < 2) return showError('Add an emergency contact name.', $('emergency_name'));
    if (!digits(v('emergency_phone'))) return showError('Add an emergency contact phone.', $('emergency_phone'));
    if (sel.shirt && !v('shirt_size')) return showError('Pick a T-shirt size.', $('shirt_size'));
    const needWaiver = !team.partner.waiver_signed;
    const waiver = { ack_read: $('ack_read').checked, ack_risk: $('ack_risk').checked, ack_release: $('ack_release').checked, ack_rules: $('ack_rules').checked, ack_age: $('ack_age').checked, signature: v('signature') };
    if (needWaiver) {
      if (!(waiver.ack_read && waiver.ack_risk && waiver.ack_release && waiver.ack_rules && waiver.ack_age)) return showError('Check every waiver acknowledgment.', $('ack_read'));
      if (waiver.signature.toLowerCase() !== v('name').toLowerCase()) return showError('Your signature must match your full name exactly.', $('signature'));
    }
    const btn = $('submit-btn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Saving…';
    try {
      const res = await fetch('/.netlify/functions/hyrox-partner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id, t, name: v('name'), email: v('email'), phone: v('phone'), emergency_name: v('emergency_name'), emergency_phone: v('emergency_phone'), waiver, addons: sel, shirt_size: v('shirt_size'), test_token: params.get('test_token') || undefined }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
      if (d.checkout && d.url) { window.location.href = d.url; return; }
      $('partner-form').classList.add('hidden'); $('already').classList.add('hidden'); $('done').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      showError(err.message); btn.disabled = false; total();
    }
  });

  load();
})();
