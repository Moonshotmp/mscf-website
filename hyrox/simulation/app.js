/*
 * HYROX Race Simulation — registration + package builder
 * Server is the source of truth for heats/prices (/.netlify/functions/hyrox-config);
 * the static copy in index.html is a fallback for no-JS and gets overwritten on load.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('reg-form');
  if (!form) return;

  const FALLBACK = {
    open: true,
    heats: Array.from({ length: 16 }, (_, i) => { const m = 8 * 60 + 10 + i * 10; return { id: 'h' + String(i + 1).padStart(2, '0'), label: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} AM`, capacity: 2, remaining: null }; }),
    prices: { race_athlete: 2500, race_member_athlete: 1000, shirt: 2500, dexa: 12400, labs: 26000, baseline: 38000, nutrition: 19500 },
    regular_prices: { dexa: 14900, labs: 28500, baseline: 40500, nutrition: 22500 },
    shirt_sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL']
  };
  let cfg = FALLBACK;

  const state = {
    heat_id: null,
    addons: { registrant: { shirt: false, dexa: false, labs: false, nutrition: false }, partner: { shirt: false, dexa: false, labs: false, nutrition: false } }
  };

  const fmt = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const firstName = (s) => (s || '').trim().split(/\s+/)[0] || '';

  // ── Config load ───────────────────────────────────────────────────────────
  async function loadConfig() {
    try {
      const res = await fetch('/.netlify/functions/hyrox-config', { cache: 'no-store' });
      if (!res.ok) throw new Error('config ' + res.status);
      cfg = await res.json();
    } catch (e) {
      console.warn('[hyrox] config fallback', e);
    }
    applyPrices();
    renderHeats();
    renderShirtSizes();
    if (cfg.open === false) {
      $('reg-closed').classList.remove('hidden');
      form.classList.add('hidden');
    }
    const openHeats = (cfg.heats || []).filter(h => h.remaining === null || h.remaining > 0).length;
    const totalRemaining = (cfg.heats || []).reduce((s, h) => s + (h.remaining ?? 0), 0);
    if (cfg.heats && cfg.heats[0].remaining !== null) {
      $('hero-spots').textContent = totalRemaining > 0 ? `${totalRemaining} team spot${totalRemaining === 1 ? '' : 's'} left across ${openHeats} heat${openHeats === 1 ? '' : 's'}.` : 'All heats are full.';
    }
    renderSummary();
  }

  function applyPrices() {
    document.querySelectorAll('[data-price]').forEach(el => { const k = el.dataset.price; if (cfg.prices[k] != null) el.textContent = fmt(cfg.prices[k]); });
    document.querySelectorAll('[data-regular]').forEach(el => { const k = el.dataset.regular; if (cfg.regular_prices[k] != null) el.textContent = fmt(cfg.regular_prices[k]); });
  }

  function renderShirtSizes() {
    ['r_shirt_size', 'p_shirt_size'].forEach((id, i) => {
      const sel = $(id);
      const keep = sel.value;
      sel.innerHTML = `<option value="">${i === 0 ? 'Your size' : "Partner's size"}</option>` + cfg.shirt_sizes.map(s => `<option value="${s}">${s}</option>`).join('');
      if (keep) sel.value = keep;
    });
  }

  // ── Heats ─────────────────────────────────────────────────────────────────
  function renderHeats() {
    const grid = $('heat-grid');
    grid.innerHTML = '';
    cfg.heats.forEach(h => {
      const full = h.remaining !== null && h.remaining <= 0;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'heat-card' + (full ? ' full' : '') + (state.heat_id === h.id ? ' selected' : '');
      el.setAttribute('role', 'radio');
      el.setAttribute('aria-checked', String(state.heat_id === h.id));
      el.disabled = full;
      const [time, ampm] = h.label.split(' ');
      el.innerHTML = `<div class="font-heading font-bold text-brand-light text-xl leading-none">${time}</div><div class="text-xs text-brand-gray mt-0.5">${ampm}</div><div class="text-[11px] mt-2 ${full ? 'text-red-300' : h.remaining !== null && h.remaining <= 2 ? 'text-brand-gold' : 'text-brand-gray'}">${full ? 'Full' : h.remaining === null ? 'Open' : `${h.remaining} left`}</div>`;
      el.addEventListener('click', () => { if (full) return; state.heat_id = h.id; $('heat_id').value = h.id; renderHeats(); renderSummary(); clearError(); });
      grid.appendChild(el);
    });

    // Preview grid in the schedule section mirrors availability
    const preview = $('heat-preview');
    if (preview) {
      preview.innerHTML = cfg.heats.map(h => {
        const full = h.remaining !== null && h.remaining <= 0;
        const [time, ampm] = h.label.split(' ');
        return `<div class="heat-card ${full ? 'full' : ''}" style="cursor:default"><div class="font-heading font-bold text-brand-light text-lg">${time}</div><div class="text-xs text-brand-gray">${ampm}${h.remaining !== null ? ` · ${full ? 'full' : h.remaining + ' left'}` : ''}</div></div>`;
      }).join('');
    }
  }

  // ── Add-on toggles ────────────────────────────────────────────────────────
  document.querySelectorAll('.toggle[data-addon]').forEach(btn => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role, key = btn.dataset.addon;
      state.addons[role][key] = !state.addons[role][key];
      btn.setAttribute('aria-checked', String(state.addons[role][key]));
      if (key === 'shirt') {
        const sel = $(role === 'registrant' ? 'r_shirt_size' : 'p_shirt_size');
        sel.classList.toggle('hidden', !state.addons[role].shirt);
      }
      renderSummary();
      clearError();
    });
  });

  // Member checkboxes reveal the code field
  ['r_member', 'p_member'].forEach(id => $(id).addEventListener('change', () => { syncMemberCode(); renderSummary(); }));
  function syncMemberCode() {
    const any = $('r_member').checked || $('p_member').checked;
    $('member-code-wrap').classList.toggle('hidden', !any);
  }

  // Names flow into the table header + summary
  ['r_name', 'p_name'].forEach(id => $(id).addEventListener('input', () => { updateNames(); renderSummary(); }));
  function updateNames() {
    $('col-r-name').textContent = firstName($('r_name').value) || 'You';
    $('col-p-name').textContent = firstName($('p_name').value) || 'Partner';
  }

  // Signature live hint
  $('signature').addEventListener('input', () => {
    const sig = $('signature').value.trim().toLowerCase(), name = $('r_name').value.trim().toLowerCase();
    const hint = $('sig-hint');
    if (!sig) { hint.textContent = ''; return; }
    hint.textContent = sig === name ? '✓ Signature matches your name' : 'Signature must match your full name exactly';
    hint.className = 'text-xs mt-2 ' + (sig === name ? 'text-green-300' : 'text-brand-gold');
  });

  // ── Pricing / summary ─────────────────────────────────────────────────────
  function athleteLines(role) {
    const P = cfg.prices;
    const name = firstName($(role === 'registrant' ? 'r_name' : 'p_name').value) || (role === 'registrant' ? 'You' : 'Partner');
    const member = $(role === 'registrant' ? 'r_member' : 'p_member').checked;
    const a = state.addons[role];
    const lines = [{ label: `Race entry${member ? ' (member)' : ''} — ${name}`, amount: member ? P.race_member_athlete : P.race_athlete }];
    if (a.shirt) lines.push({ label: `T-shirt — ${name}`, amount: P.shirt });
    if (a.dexa && a.labs) lines.push({ label: `Performance Baseline (DEXA + labs) — ${name}`, amount: P.baseline, regular: cfg.regular_prices.baseline });
    else if (a.dexa) lines.push({ label: `DEXA scan — ${name}`, amount: P.dexa, regular: cfg.regular_prices.dexa });
    else if (a.labs) lines.push({ label: `Blood panel — ${name}`, amount: P.labs, regular: cfg.regular_prices.labs });
    if (a.nutrition) lines.push({ label: `Nutrition Jumpstart with Sarah — ${name}`, amount: P.nutrition, regular: cfg.regular_prices.nutrition });
    return lines;
  }

  function renderSummary() {
    const heat = cfg.heats.find(h => h.id === state.heat_id);
    $('summary-heat').textContent = heat ? `Saturday, Oct 3 · Heat ${heat.label}` : 'Pick a heat to start';
    const lines = [...athleteLines('registrant'), ...athleteLines('partner')];
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const savings = lines.reduce((s, l) => s + (l.regular ? l.regular - l.amount : 0), 0);
    $('summary-lines').innerHTML = lines.map(l => `<div class="flex justify-between gap-3 py-2"><span class="text-brand-gray">${escapeHtml(l.label)}</span><span class="text-brand-light whitespace-nowrap">${fmt(l.amount)}</span></div>`).join('');
    $('summary-total').textContent = fmt(total);
    const sv = $('summary-savings');
    if (savings > 0) { sv.textContent = `You save ${fmt(savings)} vs. regular clinic pricing`; sv.classList.remove('hidden'); } else sv.classList.add('hidden');
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ── Errors ────────────────────────────────────────────────────────────────
  function showError(msg, focusEl) {
    const box = $('form-error');
    box.textContent = msg;
    box.classList.remove('hidden');
    if (focusEl) { focusEl.focus({ preventScroll: true }); focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearError() { $('form-error').classList.add('hidden'); }

  // ── Validation + submit ───────────────────────────────────────────────────
  function payload() {
    const v = (id) => $(id).value.trim();
    return {
      heat_id: state.heat_id,
      registrant: { name: v('r_name'), email: v('r_email'), phone: v('r_phone'), emergency_name: v('r_emergency_name'), emergency_phone: v('r_emergency_phone'), member: $('r_member').checked, addons: state.addons.registrant, shirt_size: v('r_shirt_size') },
      partner: { name: v('p_name'), email: v('p_email'), phone: v('p_phone'), member: $('p_member').checked, addons: state.addons.partner, shirt_size: v('p_shirt_size') },
      member_code: v('member_code'),
      waiver: { ack_read: form.ack_read.checked, ack_risk: form.ack_risk.checked, ack_release: form.ack_release.checked, ack_rules: form.ack_rules.checked, ack_age: form.ack_age.checked, signature: v('signature') },
      test_token: new URLSearchParams(location.search).get('test_token') || undefined
    };
  }

  function validate(p) {
    const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
    const digits = (s) => s.replace(/\D/g, '').length >= 10;
    if (!p.heat_id) return ['Pick a heat time to start.', $('heat-grid')];
    if (p.registrant.name.split(/\s+/).length < 2) return ['Enter your full name (first and last).', $('r_name')];
    if (!isEmail(p.registrant.email)) return ['Enter a valid email for yourself.', $('r_email')];
    if (!digits(p.registrant.phone)) return ['Enter your mobile phone number.', $('r_phone')];
    if (p.registrant.emergency_name.length < 2) return ['Add an emergency contact name.', $('r_emergency_name')];
    if (!digits(p.registrant.emergency_phone)) return ['Add an emergency contact phone.', $('r_emergency_phone')];
    if (p.partner.name.split(/\s+/).length < 2) return ["Enter your partner's full name.", $('p_name')];
    if (!isEmail(p.partner.email)) return ["Enter a valid email for your partner.", $('p_email')];
    if (p.partner.email.toLowerCase() === p.registrant.email.toLowerCase()) return ['Your partner needs their own email address so they can sign their waiver.', $('p_email')];
    if (!digits(p.partner.phone)) return ["Enter your partner's mobile phone.", $('p_phone')];
    if ((p.registrant.member || p.partner.member) && !p.member_code) return ['Enter the Moonshot member code (or uncheck the member box).', $('member_code')];
    if (p.registrant.addons.shirt && !p.registrant.shirt_size) return ['Pick your T-shirt size.', $('r_shirt_size')];
    if (p.partner.addons.shirt && !p.partner.shirt_size) return ["Pick your partner's T-shirt size.", $('p_shirt_size')];
    const w = p.waiver;
    if (!(w.ack_read && w.ack_risk && w.ack_release && w.ack_rules && w.ack_age)) return ['Check every waiver acknowledgment.', form.ack_read];
    if (w.signature.toLowerCase() !== p.registrant.name.toLowerCase()) return ['Your signature must match your full name exactly.', $('signature')];
    return null;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const p = payload();
    const err = validate(p);
    if (err) return showError(err[0], err[1]);

    const btn = $('submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Starting checkout…';
    saveDraft();
    try {
      const res = await fetch('/.netlify/functions/hyrox-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && data.heats) { cfg.heats = data.heats; state.heat_id = null; renderHeats(); renderSummary(); }
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      if (typeof fbq === 'function') fbq('track', 'InitiateCheckout', { value: (data.amount_cents || 0) / 100, currency: 'USD' });
      if (typeof gtag === 'function') gtag('event', 'begin_checkout', { value: (data.amount_cents || 0) / 100, currency: 'USD' });
      window.location.href = data.url;
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Continue to Secure Checkout';
    }
  });

  // ── Draft persistence (survives a canceled Stripe checkout) ──────────────
  const DRAFT_KEY = 'hyrox-sim-draft';
  function saveDraft() {
    try {
      const fields = {};
      form.querySelectorAll('input, select').forEach(el => { if (!el.name) return; fields[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ fields, addons: state.addons, heat_id: state.heat_id }));
    } catch (_) {}
  }
  function restoreDraft() {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      if (!d) return;
      Object.entries(d.fields || {}).forEach(([name, val]) => { const el = form.elements[name]; if (!el) return; if (el.type === 'checkbox') el.checked = !!val; else el.value = val; });
      // Never restore the signature or waiver acks — user re-attests.
      $('signature').value = '';
      ['ack_read', 'ack_risk', 'ack_release', 'ack_rules', 'ack_age'].forEach(n => { if (form.elements[n]) form.elements[n].checked = false; });
      state.addons = d.addons || state.addons;
      state.heat_id = d.heat_id || null;
      $('heat_id').value = state.heat_id || '';
      document.querySelectorAll('.toggle[data-addon]').forEach(btn => btn.setAttribute('aria-checked', String(!!state.addons[btn.dataset.role][btn.dataset.addon])));
      $('r_shirt_size').classList.toggle('hidden', !state.addons.registrant.shirt);
      $('p_shirt_size').classList.toggle('hidden', !state.addons.partner.shirt);
      updateNames(); syncMemberCode();
    } catch (_) {}
  }

  const params = new URLSearchParams(location.search);
  if (params.get('canceled') === '1') {
    $('canceled-banner').classList.remove('hidden');
    restoreDraft();
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) {}
  }

  loadConfig();
})();
