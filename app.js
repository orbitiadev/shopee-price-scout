(() => {
  const SUPABASE_URL = 'https://msjnvqwtguakmoaqlhvo.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_fO2-R7IHb7juhewrFinkKA_uC_LShmZ';
  const OFFERS_KEY = 'shopee-price-scout-offers-v3';
  const HISTORY_KEY = 'shopee-price-scout-history-v1';

  const $ = (selector) => document.querySelector(selector);
  const q = $('#query');
  const results = $('#results');
  const empty = $('#empty');
  const dialog = $('#offerDialog');
  const form = $('#offerForm');
  const canvas = $('#promoCanvas');
  const ctx = canvas.getContext('2d');

  const state = {
    offers: safeJson(localStorage.getItem(OFFERS_KEY), []),
    history: safeJson(localStorage.getItem(HISTORY_KEY), []),
    client: null,
    session: null,
    userId: null,
    cloud: false,
    promo: null,
  };

  q.value = window.PRODUCT_NAME || '';

  function safeJson(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  }

  const num = (value) => Number(value || 0);
  const money = (value) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[char]));

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function setStatus(text, detail) {
    $('#syncStatus').textContent = text;
    $('#ownerStatus').textContent = detail || 'Supabase + fallback local';
  }

  function persistLocal() {
    localStorage.setItem(OFFERS_KEY, JSON.stringify(state.offers));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  }

  function productSearchUrl() {
    return `https://shopee.com.br/search?keyword=${encodeURIComponent(q.value.trim() || window.PRODUCT_NAME || '')}`;
  }

  function listingKey(input) {
    const url = String(input.url || '').trim().toLowerCase();
    if (url) return url.slice(0, 1800);
    return `${String(input.seller || '').trim()}::${String(input.title || '').trim()}`
      .toLowerCase().replace(/\s+/g, ' ').slice(0, 900);
  }

  function snapshotsFor(key) {
    return state.history
      .filter((item) => item.listing_key === key)
      .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
  }

  function promoMath(offer) {
    const history = snapshotsFor(offer.listing_key);
    const historyPrices = history.map((item) => num(item.price)).filter((value) => value > 0);
    const previous = history.find((item) => num(item.price) !== num(offer.price));
    const historicalHigh = historyPrices.length ? Math.max(...historyPrices) : 0;
    const historicalLow = historyPrices.length ? Math.min(...historyPrices) : num(offer.price);

    let reference = num(offer.reference_price);
    if (!(reference > num(offer.price))) reference = previous ? num(previous.price) : 0;
    if (!(reference > num(offer.price))) reference = historicalHigh > num(offer.price) ? historicalHigh : 0;

    const savings = reference > num(offer.price) ? reference - num(offer.price) : 0;
    const discount = reference > 0 ? (savings / reference) * 100 : 0;
    let key = 'preco_normal';
    let label = '🟡 Preço normal';
    if (discount >= 15) { key = 'imperdivel'; label = '🔥 Imperdível'; }
    else if (discount >= 5) { key = 'boa_oferta'; label = '🟢 Boa oferta'; }

    return { reference, savings, discount, key, label, historicalHigh, historicalLow, captures: history.length };
  }

  function decoratedOffers() {
    const min = num($('#minFilter').value);
    const max = $('#maxFilter').value === '' ? Infinity : num($('#maxFilter').value);
    const includeShipping = $('#includeShipping').checked;
    const sort = $('#sort').value;

    return state.offers
      .map((offer) => {
        const promo = promoMath(offer);
        return {
          ...offer,
          computedTotal: num(offer.price) + (includeShipping ? num(offer.shipping) : 0),
          promo,
        };
      })
      .filter((offer) => offer.computedTotal >= min && offer.computedTotal <= max)
      .sort((a, b) => {
        if (sort === 'discount') return b.promo.discount - a.promo.discount;
        if (sort === 'rating') return num(b.rating) - num(a.rating);
        if (sort === 'sold') return num(b.sold) - num(a.sold);
        if (sort === 'price') return num(a.price) - num(b.price);
        return a.computedTotal - b.computedTotal;
      });
  }

  async function initCloud() {
    try {
      if (!window.supabase?.createClient) throw new Error('Supabase client indisponível');
      state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      });

      let { data } = await state.client.auth.getSession();
      if (!data.session) {
        const signed = await state.client.auth.signInAnonymously();
        if (signed.error) throw signed.error;
        data = { session: signed.data.session };
      }

      state.session = data.session;
      state.userId = state.session?.user?.id || null;
      if (!state.userId) throw new Error('Sessão sem usuário');

      state.cloud = true;
      setStatus('Sincronizado com Supabase', `ID: ${state.userId.slice(0, 8)}…`);
      await loadCloud();
      await saveProfile();
    } catch (error) {
      state.cloud = false;
      setStatus('Modo local ativo', 'Ative Anonymous Sign-Ins para sincronizar');
      console.warn('Supabase fallback:', error);
      render();
    }
  }

  async function loadCloud() {
    const [offersRes, historyRes] = await Promise.all([
      state.client.from('price_scout_offers')
        .select('id,user_id,listing_key,product_name,title,seller,price,shipping,reference_price,rating,sold,url,source,created_at,last_seen_at')
        .eq('user_id', state.userId).order('last_seen_at', { ascending: false }),
      state.client.from('price_scout_price_history')
        .select('id,user_id,listing_key,product_name,title,seller,price,shipping,reference_price,rating,sold,url,source,captured_at')
        .eq('user_id', state.userId).order('captured_at', { ascending: false }).limit(1000),
    ]);
    if (offersRes.error) throw offersRes.error;
    if (historyRes.error) throw historyRes.error;
    state.offers = (offersRes.data || []).map(normalizeOffer);
    state.history = (historyRes.data || []).map(normalizeHistory);
    persistLocal();
    render();
  }

  function normalizeOffer(item) {
    return {
      ...item,
      price: num(item.price),
      shipping: num(item.shipping),
      reference_price: item.reference_price == null ? 0 : num(item.reference_price),
      rating: item.rating == null ? 0 : num(item.rating),
      sold: item.sold == null ? 0 : num(item.sold),
    };
  }

  function normalizeHistory(item) {
    return {
      ...item,
      price: num(item.price),
      shipping: num(item.shipping),
      reference_price: item.reference_price == null ? 0 : num(item.reference_price),
      rating: item.rating == null ? 0 : num(item.rating),
      sold: item.sold == null ? 0 : num(item.sold),
    };
  }

  async function saveProfile() {
    if (!state.cloud) return;
    const { error } = await state.client.from('price_scout_profiles').upsert({
      user_id: state.userId,
      product_name: q.value.trim() || window.PRODUCT_NAME || 'Produto',
      sort_by: $('#sort').value === 'discount' ? 'total' : $('#sort').value,
      min_price: $('#minFilter').value === '' ? null : num($('#minFilter').value),
      max_price: $('#maxFilter').value === '' ? null : num($('#maxFilter').value),
      include_shipping: $('#includeShipping').checked,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) console.warn('Profile:', error);
  }

  async function saveCapture(capture) {
    const key = listingKey(capture);
    const productName = q.value.trim() || window.PRODUCT_NAME || capture.title;
    const localNow = new Date().toISOString();

    if (state.cloud) {
      const row = {
        user_id: state.userId,
        listing_key: key,
        product_name: productName,
        title: capture.title,
        seller: capture.seller || null,
        price: capture.price,
        shipping: capture.shipping,
        reference_price: capture.reference_price || null,
        rating: capture.rating || null,
        sold: capture.sold || null,
        url: capture.url || null,
        source: 'manual',
        last_seen_at: localNow,
      };
      const { data, error } = await state.client.from('price_scout_offers')
        .upsert(row, { onConflict: 'user_id,listing_key' })
        .select('id,user_id,listing_key,product_name,title,seller,price,shipping,reference_price,rating,sold,url,source,created_at,last_seen_at')
        .single();
      if (error) throw error;

      const historyRow = {
        user_id: state.userId,
        listing_key: key,
        product_name: productName,
        title: capture.title,
        seller: capture.seller || null,
        price: capture.price,
        shipping: capture.shipping,
        reference_price: capture.reference_price || null,
        rating: capture.rating || null,
        sold: capture.sold || null,
        url: capture.url || null,
        source: 'manual',
      };
      const historyInsert = await state.client.from('price_scout_price_history')
        .insert(historyRow)
        .select('id,user_id,listing_key,product_name,title,seller,price,shipping,reference_price,rating,sold,url,source,captured_at')
        .single();
      if (historyInsert.error) throw historyInsert.error;

      const normalized = normalizeOffer(data);
      const existingIndex = state.offers.findIndex((item) => item.listing_key === key);
      if (existingIndex >= 0) state.offers[existingIndex] = normalized;
      else state.offers.unshift(normalized);
      state.history.unshift(normalizeHistory(historyInsert.data));
    } else {
      const existingIndex = state.offers.findIndex((item) => item.listing_key === key);
      const existing = existingIndex >= 0 ? state.offers[existingIndex] : null;
      const localOffer = {
        id: existing?.id || crypto.randomUUID(),
        user_id: null,
        listing_key: key,
        product_name: productName,
        ...capture,
        source: 'manual',
        created_at: existing?.created_at || localNow,
        last_seen_at: localNow,
      };
      if (existingIndex >= 0) state.offers[existingIndex] = localOffer;
      else state.offers.unshift(localOffer);
      state.history.unshift({ ...localOffer, id: crypto.randomUUID(), captured_at: localNow });
    }
    persistLocal();
    render();
  }

  async function removeOffer(id) {
    const offer = state.offers.find((item) => item.id === id);
    if (!offer) return;
    if (state.cloud) {
      const { error } = await state.client.from('price_scout_offers')
        .delete().eq('id', id).eq('user_id', state.userId);
      if (error) throw error;
    }
    state.offers = state.offers.filter((item) => item.id !== id);
    persistLocal();
    if (state.promo?.offer?.id === id) resetPromo();
    render();
  }

  async function clearOffers() {
    if (!confirm('Remover todas as ofertas atuais? O histórico de capturas será mantido.')) return;
    if (state.cloud && state.offers.length) {
      const { error } = await state.client.from('price_scout_offers')
        .delete().eq('user_id', state.userId);
      if (error) throw error;
    }
    state.offers = [];
    persistLocal();
    resetPromo();
    render();
  }

  function render() {
    const list = decoratedOffers();
    results.innerHTML = '';
    empty.hidden = list.length > 0;
    $('#resultCount').textContent = `${list.length} ${list.length === 1 ? 'oferta' : 'ofertas'} · ${state.history.length} capturas no histórico`;

    if (list.length) {
      const totals = list.map((offer) => offer.computedTotal);
      const savings = list.map((offer) => offer.promo.savings);
      $('#minPrice').textContent = money(Math.min(...totals));
      $('#avgPrice').textContent = money(totals.reduce((sum, value) => sum + value, 0) / totals.length);
      $('#maxPrice').textContent = money(Math.max(...totals));
      $('#saving').textContent = money(Math.max(...savings));
    } else {
      ['#minPrice', '#avgPrice', '#maxPrice', '#saving'].forEach((id) => $(id).textContent = '—');
    }

    const bestId = list.length ? [...list].sort((a, b) => a.computedTotal - b.computedTotal)[0].id : null;

    list.forEach((offer, index) => {
      const item = document.createElement('article');
      item.className = `offer ${offer.id === bestId ? 'best' : ''}`;
      item.innerHTML = `
        <div class="rank">${index + 1}</div>
        <div class="offer-title">
          <strong>${escapeHtml(offer.title)}</strong>
          <small>${escapeHtml(offer.seller || 'Loja não informada')} · ${offer.promo.captures} captura(s)</small>
          <span class="discount-chip">${offer.promo.label}${offer.promo.discount ? ` · ${offer.promo.discount.toFixed(1)}%` : ''}</span>
        </div>
        <div class="price"><small>Produto</small><strong>${money(offer.price)}</strong></div>
        <div class="shipping"><small>Frete</small><strong>${money(offer.shipping)}</strong></div>
        <div class="rating"><small>Avaliação</small><strong>${offer.rating ? `${offer.rating.toFixed(1)} ★` : '—'}</strong></div>
        <div class="total"><small>Total</small><strong>${money(offer.computedTotal)}</strong></div>
        <div class="offer-actions">
          <button class="promo-btn" data-promo="${offer.id}">Gerar promoção</button>
          ${offer.url ? `<a href="${escapeHtml(offer.url)}" target="_blank" rel="noopener noreferrer">Abrir</a>` : ''}
          <button data-remove="${offer.id}" title="Remover">×</button>
        </div>`;
      results.appendChild(item);
    });

    results.querySelectorAll('[data-promo]').forEach((button) => {
      button.onclick = () => generatePromotion(button.dataset.promo);
    });
    results.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = async () => {
        try { await removeOffer(button.dataset.remove); toast('Oferta removida.'); }
        catch (error) { console.error(error); toast('Não foi possível remover a oferta.'); }
      };
    });
  }

  function makeCaption(offer, promo) {
    const lines = [
      `${promo.label.toUpperCase()}`,
      '',
      `📦 ${offer.title}`,
      promo.reference ? `💰 De ${money(promo.reference)} por ${money(offer.price)}` : `💰 Agora por ${money(offer.price)}`,
      promo.discount ? `📉 Desconto: ${promo.discount.toFixed(1)}%` : null,
      promo.savings ? `💸 Economia: ${money(promo.savings)}` : null,
      offer.shipping ? `🚚 Frete informado: ${money(offer.shipping)}` : null,
      offer.seller ? `🏪 Loja: ${offer.seller}` : null,
      offer.rating ? `⭐ Avaliação: ${offer.rating.toFixed(1)}/5` : null,
      offer.url ? `🛒 ${offer.url}` : null,
      '',
      '⚠️ Preço e disponibilidade podem mudar na Shopee.',
    ].filter(Boolean);
    return lines.join('\n');
  }

  function hashtagsFor(offer, promo) {
    const productWords = String(offer.product_name || q.value || '')
      .toLowerCase().replace(/[^a-z0-9áàâãéèêíïóôõöúçñ ]/gi, ' ')
      .split(/\s+/).filter((word) => word.length > 2).slice(0, 3)
      .map((word) => `#${word.replace(/\s/g, '')}`);
    const classTag = promo.key === 'imperdivel' ? '#imperdivel' : promo.key === 'boa_oferta' ? '#boaoferta' : '#precobom';
    return ['#promocao', '#shopee', '#ofertas', '#desconto', classTag, ...productWords].join(' ');
  }

  async function generatePromotion(id) {
    const offer = state.offers.find((item) => item.id === id);
    if (!offer) return;
    const promo = promoMath(offer);
    const caption = makeCaption(offer, promo);
    const hashtags = hashtagsFor(offer, promo);
    state.promo = { offer, promo, caption, hashtags };

    $('#promoHint').textContent = `${offer.title} · ${promo.captures} captura(s) no histórico`;
    const badge = $('#promoClass');
    badge.className = `promo-class ${promo.key}`;
    badge.textContent = promo.label.replace(/^[^\s]+\s/, '');
    $('#promoOld').textContent = promo.reference ? money(promo.reference) : 'Sem referência';
    $('#promoCurrent').textContent = money(offer.price);
    $('#promoDiscount').textContent = promo.discount ? `${promo.discount.toFixed(1)}%` : '0%';
    $('#promoSavings').textContent = money(promo.savings);
    $('#promoCaption').value = caption;
    $('#promoHashtags').value = hashtags;
    $('#copyCaptionBtn').disabled = false;
    $('#downloadCardBtn').disabled = false;
    $('#telegramBtn').disabled = false;

    drawPromoCard(offer, promo);
    await savePromotionDraft();
    $('#promoStudio').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function savePromotionDraft() {
    if (!state.cloud || !state.promo) return;
    const { offer, promo } = state.promo;
    const { error } = await state.client.from('price_scout_promotions').insert({
      user_id: state.userId,
      offer_id: offer.id,
      listing_key: offer.listing_key,
      classification: promo.key,
      current_price: offer.price,
      reference_price: promo.reference || null,
      discount_percent: Number(promo.discount.toFixed(2)),
      savings: Number(promo.savings.toFixed(2)),
      caption: $('#promoCaption').value,
      hashtags: $('#promoHashtags').value,
    });
    if (error) console.warn('Promo draft:', error);
  }

  function resetPromo() {
    state.promo = null;
    $('#promoHint').textContent = 'Escolha “Gerar promoção” em uma oferta.';
    $('#promoClass').className = 'promo-class normal';
    $('#promoClass').textContent = 'Preço normal';
    ['#promoOld','#promoCurrent','#promoDiscount','#promoSavings'].forEach((id) => $(id).textContent = '—');
    $('#promoCaption').value = '';
    $('#promoHashtags').value = '';
    ['#copyCaptionBtn','#downloadCardBtn','#telegramBtn'].forEach((id) => $(id).disabled = true);
    drawEmptyCard();
  }

  function roundRect(context, x, y, width, height, radius, fillStyle) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fillStyle = fillStyle;
    context.fill();
  }

  function wrapText(context, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1920);
    gradient.addColorStop(0, '#121d37');
    gradient.addColorStop(.52, '#090f1d');
    gradient.addColorStop(1, '#170b08');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1920);
    const glow = ctx.createRadialGradient(840, 200, 0, 840, 200, 680);
    glow.addColorStop(0, 'rgba(255,90,31,.34)');
    glow.addColorStop(1, 'rgba(255,90,31,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1080, 900);
  }

  function drawEmptyCard() {
    drawBackground();
    ctx.fillStyle = '#ff7849';
    ctx.font = '700 34px system-ui';
    ctx.fillText('ORBIT IA · PRICE SCOUT', 82, 120);
    ctx.fillStyle = '#f7f9fc';
    ctx.font = '800 72px system-ui';
    ctx.fillText('Sua promoção', 82, 420);
    ctx.fillText('vai aparecer aqui', 82, 510);
    ctx.fillStyle = '#93a4bd';
    ctx.font = '400 34px system-ui';
    ctx.fillText('Escolha uma oferta monitorada.', 82, 610);
    ctx.fillStyle = '#66758d';
    ctx.font = '500 28px system-ui';
    ctx.fillText('Card vertical · 1080 × 1920', 82, 1770);
  }

  function drawPromoCard(offer, promo) {
    drawBackground();
    ctx.fillStyle = '#ff7849';
    ctx.font = '800 31px system-ui';
    ctx.fillText('ORBIT IA · SHOPEE PRICE SCOUT', 76, 105);

    const badgeColor = promo.key === 'imperdivel' ? '#ff5a1f' : promo.key === 'boa_oferta' ? '#25c987' : '#d3aa3a';
    roundRect(ctx, 76, 155, 420, 82, 41, badgeColor);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px system-ui';
    ctx.fillText(promo.label, 110, 208);

    ctx.fillStyle = '#f6f8fc';
    ctx.font = '800 60px system-ui';
    const titleLines = wrapText(ctx, offer.title, 900).slice(0, 5);
    titleLines.forEach((line, index) => ctx.fillText(line, 76, 350 + index * 72));

    const blockY = 760;
    roundRect(ctx, 76, blockY, 928, 390, 36, 'rgba(14,24,44,.88)');
    ctx.fillStyle = '#91a2bb';
    ctx.font = '700 30px system-ui';
    ctx.fillText(promo.reference ? 'DE' : 'PREÇO ATUAL', 118, blockY + 78);
    if (promo.reference) {
      ctx.fillStyle = '#9aa8ba';
      ctx.font = '700 54px system-ui';
      ctx.fillText(money(promo.reference), 118, blockY + 145);
      ctx.strokeStyle = '#ff8b67';
      ctx.lineWidth = 5;
      const oldWidth = ctx.measureText(money(promo.reference)).width;
      ctx.beginPath();
      ctx.moveTo(116, blockY + 127);
      ctx.lineTo(116 + oldWidth, blockY + 127);
      ctx.stroke();
      ctx.fillStyle = '#91a2bb';
      ctx.font = '700 30px system-ui';
      ctx.fillText('POR', 118, blockY + 220);
    }
    ctx.fillStyle = '#3ddc97';
    ctx.font = '900 88px system-ui';
    ctx.fillText(money(offer.price), 118, blockY + (promo.reference ? 315 : 190));

    if (promo.discount) {
      roundRect(ctx, 696, blockY + 55, 250, 104, 26, 'rgba(255,90,31,.17)');
      ctx.fillStyle = '#ff9d78';
      ctx.font = '900 45px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`-${promo.discount.toFixed(1)}%`, 821, blockY + 122);
      ctx.textAlign = 'left';
    }

    roundRect(ctx, 76, 1195, 928, 275, 34, 'rgba(8,14,27,.8)');
    ctx.fillStyle = '#aab8cc';
    ctx.font = '600 31px system-ui';
    let infoY = 1260;
    if (promo.savings) { ctx.fillText(`💸 Economia: ${money(promo.savings)}`, 118, infoY); infoY += 60; }
    if (offer.seller) { ctx.fillText(`🏪 ${offer.seller}`.slice(0, 50), 118, infoY); infoY += 60; }
    if (offer.rating) { ctx.fillText(`⭐ ${offer.rating.toFixed(1)}/5`, 118, infoY); infoY += 60; }

    ctx.fillStyle = '#f6f8fc';
    ctx.font = '800 38px system-ui';
    ctx.fillText('Confira a oferta na Shopee', 76, 1595);
    ctx.fillStyle = '#8fa0b8';
    ctx.font = '500 27px system-ui';
    ctx.fillText('Preço e disponibilidade podem mudar.', 76, 1650);

    ctx.fillStyle = '#ff7849';
    ctx.font = '800 28px system-ui';
    ctx.fillText('PRICE SCOUT · HISTÓRICO REAL', 76, 1790);
    ctx.fillStyle = '#66758d';
    ctx.font = '500 24px system-ui';
    ctx.fillText(new Date().toLocaleString('pt-BR'), 76, 1840);
  }

  async function publishTelegram() {
    if (!state.promo) return;
    if (!state.cloud || !state.session?.access_token) {
      toast('Telegram exige uma sessão Supabase ativa.');
      return;
    }
    $('#telegramBtn').disabled = true;
    $('#telegramStatus').textContent = 'Telegram: enviando...';
    try {
      const caption = `${$('#promoCaption').value}\n\n${$('#promoHashtags').value}`.trim();
      const imageBase64 = canvas.toDataURL('image/png');
      const response = await fetch(`${SUPABASE_URL}/functions/v1/price-scout-telegram`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.session.access_token}`,
          'apikey': SUPABASE_KEY,
        },
        body: JSON.stringify({ caption, image_base64: imageBase64 }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (body.error === 'telegram_not_configured' || body.error === 'owner_not_configured') {
          throw new Error('Telegram ainda precisa dos segredos do bot/canal no Supabase.');
        }
        if (body.error === 'forbidden') throw new Error('Este usuário não está configurado como proprietário.');
        throw new Error('Falha ao publicar no Telegram.');
      }
      $('#telegramStatus').textContent = `Telegram: publicado com sucesso${body.message_id ? ` · mensagem ${body.message_id}` : ''}.`;
      toast('Promoção publicada no Telegram.');
    } catch (error) {
      console.error(error);
      $('#telegramStatus').textContent = `Telegram: ${error.message}`;
      toast(error.message);
    } finally {
      $('#telegramBtn').disabled = false;
    }
  }

  $('#openShopeeBtn').onclick = () => window.open(productSearchUrl(), '_blank', 'noopener,noreferrer');
  $('#emptySearch').onclick = $('#openShopeeBtn').onclick;
  $('#compareBtn').onclick = async () => {
    window.PRODUCT_NAME = q.value.trim();
    render();
    await saveProfile();
  };
  q.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); $('#compareBtn').click(); }
  });

  ['#sort', '#minFilter', '#maxFilter', '#includeShipping'].forEach((id) => {
    $(id).addEventListener('input', () => { render(); saveProfile(); });
  });

  $('#addBtn').onclick = () => {
    form.reset();
    form.elements.title.value = q.value.trim();
    form.elements.shipping.value = '0';
    dialog.showModal();
  };
  $('#closeDialog').onclick = () => dialog.close();
  $('#cancelDialog').onclick = () => dialog.close();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const capture = {
      title: String(data.get('title') || '').trim(),
      price: num(data.get('price')),
      reference_price: num(data.get('reference_price')),
      shipping: num(data.get('shipping')),
      seller: String(data.get('seller') || '').trim(),
      rating: num(data.get('rating')),
      sold: num(data.get('sold')),
      url: String(data.get('url') || '').trim(),
    };
    if (!capture.title || capture.price < 0) return;
    try {
      await saveCapture(capture);
      form.reset();
      dialog.close();
      toast('Preço capturado e histórico atualizado.');
    } catch (error) {
      console.error(error);
      toast('Não foi possível salvar a captura.');
    }
  });

  $('#clearBtn').onclick = async () => {
    try { await clearOffers(); } catch (error) { console.error(error); toast('Não foi possível limpar as ofertas.'); }
  };

  $('#copyOwnerIdBtn').onclick = async () => {
    if (!state.userId) { toast('Abra o app com Supabase ativo primeiro.'); return; }
    await navigator.clipboard.writeText(state.userId);
    toast('Seu user_id do Supabase foi copiado.');
  };

  $('#copyCaptionBtn').onclick = async () => {
    if (!state.promo) return;
    await navigator.clipboard.writeText(`${$('#promoCaption').value}\n\n${$('#promoHashtags').value}`.trim());
    toast('Legenda e hashtags copiadas.');
  };

  $('#downloadCardBtn').onclick = () => {
    if (!state.promo) return;
    const link = document.createElement('a');
    link.download = `promocao-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  $('#telegramBtn').onclick = publishTelegram;
  $('#promoCaption').addEventListener('input', () => {
    if (state.promo) state.promo.caption = $('#promoCaption').value;
  });
  $('#promoHashtags').addEventListener('input', () => {
    if (state.promo) state.promo.hashtags = $('#promoHashtags').value;
  });

  drawEmptyCard();
  render();
  initCloud();
})();