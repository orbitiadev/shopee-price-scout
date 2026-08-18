(() => {
  const $ = (selector) => document.querySelector(selector);
  const q = $('#query');
  const results = $('#results');
  const empty = $('#empty');
  const dialog = $('#offerDialog');
  const form = $('#offerForm');
  const storageKey = 'shopee-price-scout-offers-v2';
  const SUPABASE_URL = 'https://msjnvqwtguakmoaqlhvo.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_fO2-R7IHb7juhewrFinkKA_uC_LShmZ';

  let offers = JSON.parse(localStorage.getItem(storageKey) || '[]');
  let supabaseClient = null;
  let userId = null;
  let cloudReady = false;
  q.value = window.PRODUCT_NAME || '';

  const money = (value) => Number.isFinite(value) ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
  const num = (value) => Number(value || 0);
  const escapeHtml = (value = '') => value.replace(/[&<>'\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '\"': '&quot;' }[char]));
  const productSearchUrl = () => `https://shopee.com.br/search?keyword=${encodeURIComponent(q.value.trim() || window.PRODUCT_NAME || '')}`;

  function setSyncStatus(text) {
    const el = $('#syncStatus');
    if (el) el.textContent = text;
  }

  function persistLocal() {
    localStorage.setItem(storageKey, JSON.stringify(offers));
  }

  async function initCloud() {
    try {
      if (!window.supabase?.createClient) throw new Error('Supabase client indisponível');
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true }
      });

      let { data: sessionData } = await supabaseClient.auth.getSession();
      if (!sessionData.session) {
        const { data, error } = await supabaseClient.auth.signInAnonymously();
        if (error) throw error;
        sessionData = data;
      }

      userId = sessionData.session?.user?.id || sessionData.user?.id || null;
      if (!userId) throw new Error('Sessão sem usuário');
      cloudReady = true;
      setSyncStatus('Sincronizado com Supabase');
      await loadCloudOffers();
      await saveProfile();
    } catch (error) {
      cloudReady = false;
      setSyncStatus('Modo local ativo');
      console.warn('Supabase indisponível; usando fallback local.', error?.message || error);
    }
  }

  async function loadCloudOffers() {
    if (!cloudReady) return;
    const { data, error } = await supabaseClient
      .from('price_scout_offers')
      .select('id,product_name,title,seller,price,shipping,rating,sold,url,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    offers = (data || []).map((item) => ({
      id: item.id,
      productName: item.product_name,
      title: item.title,
      seller: item.seller || '',
      price: num(item.price),
      shipping: num(item.shipping),
      rating: item.rating == null ? 0 : num(item.rating),
      sold: item.sold == null ? 0 : num(item.sold),
      url: item.url || '',
      createdAt: item.created_at,
    }));
    persistLocal();
    render();
  }

  async function saveProfile() {
    if (!cloudReady) return;
    const payload = {
      user_id: userId,
      product_name: q.value.trim() || window.PRODUCT_NAME || 'Produto',
      sort_by: $('#sort').value,
      min_price: $('#minFilter').value === '' ? null : num($('#minFilter').value),
      max_price: $('#maxFilter').value === '' ? null : num($('#maxFilter').value),
      include_shipping: $('#includeShipping').checked,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseClient.from('price_scout_profiles').upsert(payload, { onConflict: 'user_id' });
    if (error) console.warn('Falha ao salvar preferências:', error.message);
  }

  async function insertCloudOffer(offer) {
    if (!cloudReady) return offer;
    const payload = {
      user_id: userId,
      product_name: q.value.trim() || window.PRODUCT_NAME || 'Produto',
      title: offer.title,
      seller: offer.seller || null,
      price: offer.price,
      shipping: offer.shipping,
      rating: offer.rating || null,
      sold: offer.sold || null,
      url: offer.url || null,
    };
    const { data, error } = await supabaseClient.from('price_scout_offers').insert(payload).select('id,created_at').single();
    if (error) throw error;
    return { ...offer, id: data.id, createdAt: data.created_at };
  }

  async function deleteCloudOffer(id) {
    if (!cloudReady) return;
    const { error } = await supabaseClient.from('price_scout_offers').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
  }

  function getFilteredOffers() {
    const min = num($('#minFilter').value);
    const max = $('#maxFilter').value === '' ? Infinity : num($('#maxFilter').value);
    const includeShipping = $('#includeShipping').checked;
    const sort = $('#sort').value;
    return offers.map((offer) => ({ ...offer, computedTotal: num(offer.price) + (includeShipping ? num(offer.shipping) : 0) }))
      .filter((offer) => offer.computedTotal >= min && offer.computedTotal <= max)
      .sort((a, b) => sort === 'rating' ? num(b.rating) - num(a.rating) : sort === 'sold' ? num(b.sold) - num(a.sold) : sort === 'price' ? num(a.price) - num(b.price) : a.computedTotal - b.computedTotal);
  }

  function render() {
    const list = getFilteredOffers();
    results.innerHTML = '';
    empty.hidden = list.length > 0;
    $('#resultCount').textContent = `${list.length} ${list.length === 1 ? 'oferta' : 'ofertas'} no comparador`;
    if (list.length) {
      const totals = list.map((offer) => offer.computedTotal);
      const min = Math.min(...totals), max = Math.max(...totals), avg = totals.reduce((sum, value) => sum + value, 0) / totals.length;
      $('#minPrice').textContent = money(min); $('#avgPrice').textContent = money(avg); $('#maxPrice').textContent = money(max); $('#saving').textContent = money(max - min);
    } else ['#minPrice', '#avgPrice', '#maxPrice', '#saving'].forEach((id) => $(id).textContent = '—');

    const bestId = list.length ? [...list].sort((a, b) => a.computedTotal - b.computedTotal)[0].id : null;
    list.forEach((offer, index) => {
      const item = document.createElement('article');
      item.className = `offer ${offer.id === bestId ? 'best' : ''}`;
      item.innerHTML = `<div class="rank">${index + 1}</div><div class="offer-title"><strong>${escapeHtml(offer.title)}</strong><small>${escapeHtml(offer.seller || 'Loja não informada')}${offer.id === bestId ? ' · MELHOR PREÇO TOTAL' : ''}</small></div><div class="price"><small>Produto</small><strong>${money(num(offer.price))}</strong></div><div class="shipping"><small>Frete</small><strong>${money(num(offer.shipping))}</strong></div><div class="rating"><small>Avaliação</small><strong>${offer.rating ? `${num(offer.rating).toFixed(1)} ★` : '—'}</strong><small>${offer.sold ? `${num(offer.sold).toLocaleString('pt-BR')} vendidos` : ''}</small></div><div class="total"><small>Total</small><strong>${money(offer.computedTotal)}</strong></div><div class="offer-actions">${offer.url ? `<a href="${escapeHtml(offer.url)}" target="_blank" rel="noopener noreferrer">Ver anúncio</a>` : ''}<button data-remove="${offer.id}" title="Remover">×</button></div>`;
      results.appendChild(item);
    });

    results.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = async () => {
        const id = button.dataset.remove;
        try { await deleteCloudOffer(id); } catch (error) { console.warn(error); }
        offers = offers.filter((offer) => offer.id !== id);
        persistLocal();
        render();
      };
    });
  }

  function openShopee() { window.open(productSearchUrl(), '_blank', 'noopener,noreferrer'); }
  $('#openShopeeBtn').onclick = openShopee;
  $('#emptySearch').onclick = openShopee;
  $('#compareBtn').onclick = async () => { window.PRODUCT_NAME = q.value.trim(); render(); await saveProfile(); };
  q.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); $('#compareBtn').click(); } });
  ['#sort', '#minFilter', '#maxFilter', '#includeShipping'].forEach((id) => $(id).addEventListener('input', () => { render(); saveProfile(); }));
  $('#addBtn').onclick = () => { form.elements.title.value = q.value.trim(); dialog.showModal(); };
  $('#closeDialog').onclick = () => dialog.close();
  $('#cancelDialog').onclick = () => dialog.close();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    let offer = { id: crypto.randomUUID(), title: String(data.get('title') || ''), price: num(data.get('price')), shipping: num(data.get('shipping')), seller: String(data.get('seller') || ''), rating: num(data.get('rating')), sold: num(data.get('sold')), url: String(data.get('url') || ''), createdAt: new Date().toISOString() };
    try { offer = await insertCloudOffer(offer); } catch (error) { console.warn('Falha no Supabase; oferta salva localmente.', error?.message || error); }
    offers.push(offer);
    persistLocal();
    form.reset(); dialog.close(); render();
  });

  $('#clearBtn').onclick = async () => {
    if (!confirm('Remover todas as ofertas salvas?')) return;
    if (cloudReady) {
      const ids = offers.map((offer) => offer.id);
      if (ids.length) {
        const { error } = await supabaseClient.from('price_scout_offers').delete().in('id', ids).eq('user_id', userId);
        if (error) console.warn(error.message);
      }
    }
    offers = []; persistLocal(); render();
  };

  render();
  initCloud();
})();
