(function boardRuntime() {
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function badge(text) {
    return text ? `<em class="badge">${esc(text)}</em>` : '';
  }

  function logo(content) {
    return content.logoUrl ? `<img class="brand-logo" src="${esc(content.logoUrl)}" alt="">` : '';
  }

  function applyScene(root, content) {
    if (content?.backgroundUrl) {
      const url = String(content.backgroundUrl).replace(/"/g, '');
      root.style.backgroundImage = `linear-gradient(160deg, rgba(0,22,51,.78), rgba(0,32,78,.42)), url("${url}")`;
      root.style.backgroundSize = 'cover';
      root.style.backgroundPosition = 'center';
    }
    if (content?.accent) root.style.setProperty('--price', content.accent);
    if (content?.action) root.style.setProperty('--action', content.action);
  }

  function rows(content) {
    return content.items.filter((item) => item.name || item.price);
  }

  const templates = {
    aurora(root, content) {
      const list = rows(content).map((item, index) => `
        <div class="aurora-row" style="animation-delay:${index * 90}ms">
          <div><strong>${esc(item.name)}${badge(item.badge)}</strong><small>${esc(item.note)}</small></div>
          <div class="aurora-price">${esc(item.price)}</div>
        </div>`).join('');
      root.innerHTML = `
        <div class="aurora-wash"></div>
        <header class="aurora-head">${logo(content)}<h1>${esc(content.headline)}</h1><p>${esc(content.subtitle || content.tagline || '')}</p></header>
        <div class="aurora-list">${list}</div>`;
      applyScene(root, content);
    },
    vitrina(root, content) {
      const items = rows(content);
      let index = 0;
      let timer = 0;
      function paint() {
        const current = items[index % items.length] || { name: content.headline, price: '', note: '', badge: '' };
        const rest = items.filter((_, itemIndex) => itemIndex !== index % items.length);
        root.innerHTML = `
          <section class="vitrina-feature">
            <div class="sheen"></div>
            <div class="feature-card">
              ${logo(content)}
              <h1>${esc(content.headline)}</h1>
              <h2>${esc(current.name)}${badge(current.badge)}</h2>
              <span class="price">${esc(current.price)}</span>
              <p>${esc(current.note || content.subtitle)}</p>
            </div>
          </section>
          <aside class="vitrina-side">
            <h2>${esc(content.subtitle || 'También')}</h2>
            ${rest.map((item) => `<div class="side-row"><span>${esc(item.name)}</span><b>${esc(item.price)}</b></div>`).join('')}
          </aside>`;
        applyScene(root, content);
      }
      paint();
      if (items.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        timer = window.setInterval(() => {
          index += 1;
          paint();
        }, 4200);
      }
      root._stop = () => window.clearInterval(timer);
    },
    cinta(root, content) {
      const items = rows(content);
      const tape = [...items, ...items].map((item) => `<span>${esc(item.name)} · ${esc(item.price)}</span>`).join('');
      root.innerHTML = `
        <header class="cinta-head">${logo(content)}<h1>${esc(content.headline)}</h1><p>${esc(content.subtitle || content.tagline || '')}</p></header>
        <div class="cinta-list">
          ${items.map((item) => `
            <div class="cinta-item">
              <div>${esc(item.name)}${badge(item.badge)}<small>${esc(item.note)}</small></div>
              <span>${esc(item.price)}</span>
            </div>`).join('')}
        </div>
        <div class="marquee"><div class="marquee-track">${tape}</div></div>`;
      applyScene(root, content);
    },
  };

  function mount(root, templateId, content) {
    if (typeof root._stop === 'function') root._stop();
    root._stop = null;
    const draw = templates[templateId] || templates.aurora;
    root.className = `board-root ${templates[templateId] ? templateId : 'aurora'}`;
    draw(root, content || { headline: '', subtitle: '', items: [] });
  }

  window.RenaceBoards = {
    mount,
    ids: Object.keys(templates),
  };

  const embedded = document.getElementById('board-data');
  if (embedded) {
    const payload = JSON.parse(embedded.textContent);
    const stage = document.getElementById('stage');
    if (stage) mount(stage, payload.templateId, payload.content);
  }
}());
