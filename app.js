(() => {
  const $ = (selector) => document.querySelector(selector);
  const q = $('#query');
  const results = $('#results');
  const empty = $('#empty');
  const dialog = $('#offerDialog');
  const form = $('#offerForm');
  const storageKey = 'shopee-price-scout-offers-v1';

  let offers = JSON.parse(localStorage.getItem(storageKey) || '[]');
  q.value = window.PRODUCT_NAME || '';

  const money = (value) => Number.isFinite(value)
    ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';

  const num = (value) => Number(value || 0);
  const escapeHtml = (value = '') => value.replace(/[&<>'\"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '\"': '&quot;'
  }[char]));

  const productSearchUrl = () =>
    `https://shopee.com.br/search?keyword=${encodeURIComponent(q.value.trim() || window.PRODUCT_NAME || '')}`;

  function persist() {
    localStorage.setItem(storageKey, JSON.stringify(offers));
  }

  function getFilteredOffers() {
    const min = num($('#minFilter').value);
    const max = $('#maxFilter').value === '' ? Infinity : num($('#maxFilter').value);
    const includeShipping = $('#includeShipping').checked;
    const sort = $('#sort').value;

    return offers
      .map((offer) => ({
        ...offer,
        computedTotal: num(offer.price) + (includeShipping ? num(offer.shipping) : 0),
      }))
      .filter((offer) => offer.computedTotal >= min && offer.computedTotal <= max)
      .sort((a, b) => {
        if (sort === 'rating') return num(b.rating) - num(a.rating);
        if (sort === 'sold') return num(b.sold) - num(a.sold);
        if (sort === 'price') return num(a.price) - num(b.price);
        return a.computedTotal - b.computedTotal;
      });
  }

  function render() {
    const list = getFilteredOffers();
    results.innerHTML = '';
    empty.hidden = list.length > 0;
    $('#resultCount').textContent = `${list.length} ${list.length === 1 ? 'oferta' : 'ofertas'} no comparador`;

    if (list.length) {
      const totals = list.map((offer) => offer.computedTotal);
      const min = Math.min(...totals);
      const max = Math.max(...totals);
      const avg = totals.reduce((sum, value) => sum + value, 0) / totals.length;
      $('#minPrice').textContent = money(min);
      $('#avgPrice').textContent = money(avg);
      $('#maxPrice').textContent = money(max);
      $('#saving').textContent = money(max - min);
    } else {
      ['#minPrice', '#avgPrice', '#maxPrice', '#saving'].forEach((id) => {
        $(id).textContent = '—';
      });
    }

    const bestId = list.length
      ? [...list].sort((a, b) => a.computedTotal - b.computedTotal)[0].id
      : null;

    list.forEach((offer, index) => {
      const item = document.createElement('article');
      item.className = `offer ${offer.id === bestId ? 'best' : ''}`;
      item.innerHTML = `
        <div class="rank">${index + 1}</div>
        <div class="offer-title">
          <strong>${escapeHtml(offer.title)}</strong>
          <small>${escapeHtml(offer.seller || 'Loja não informada')}${offer.id === bestId ? ' · MELHOR PREÇO TOTAL' : ''}</small>
        </div>
        <div class="price"><small>Produto</small><strong>${money(num(offer.price))}</strong></div>
        <div class="shipping"><small>Frete</small><strong>${money(num(offer.shipping))}</strong></div>
        <div class="rating"><small>Avaliação</small><strong>${offer.rating ? `${num(offer.rating).toFixed(1)} ★` : '—'}</strong><small>${offer.sold ? `${num(offer.sold).toLocaleString('pt-BR')} vendidos` : ''}</small></div>
        <div class="total"><small>Total</small><strong>${money(offer.computedTotal)}</strong></div>
        <div class="offer-actions">
          ${offer.url ? `<a href="${escapeHtml(offer.url)}" target="_blank" rel="noopener noreferrer">Ver anúncio</a>` : ''}
          <button data-remove="${offer.id}" title="Remover">×</button>
        </div>`;
      results.appendChild(item);
    });

    results.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = () => {
        offers = offers.filter((offer) => offer.id !== button.dataset.remove);
        persist();
        render();
      };
    });
  }

  function openShopee() {
    window.open(productSearchUrl(), '_blank', 'noopener,noreferrer');
  }

  $('#openShopeeBtn').onclick = openShopee;
  $('#emptySearch').onclick = openShopee;
  $('#compareBtn').onclick = () => {
    window.PRODUCT_NAME = q.value.trim();
    render();
  };

  q.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('#compareBtn').click();
    }
  });

  ['#sort', '#minFilter', '#maxFilter', '#includeShipping'].forEach((id) => {
    $(id).addEventListener('input', render);
  });

  $('#addBtn').onclick = () => {
    form.elements.title.value = q.value.trim();
    dialog.showModal();
  };

  $('#closeDialog').onclick = () => dialog.close();
  $('#cancelDialog').onclick = () => dialog.close();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    offers.push({
      id: crypto.randomUUID(),
      title: String(data.get('title') || ''),
      price: num(data.get('price')),
      shipping: num(data.get('shipping')),
      seller: String(data.get('seller') || ''),
      rating: num(data.get('rating')),
      sold: num(data.get('sold')),
      url: String(data.get('url') || ''),
      createdAt: new Date().toISOString(),
    });
    persist();
    form.reset();
    dialog.close();
    render();
  });

  $('#clearBtn').onclick = () => {
    if (confirm('Remover todas as ofertas salvas neste navegador?')) {
      offers = [];
      persist();
      render();
    }
  };

  render();
})();
