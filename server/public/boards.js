(function boardRuntime() {
  const FONTS = ['sans', 'serif', 'display', 'mono', 'rounded', 'condensed'];

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

  function rows(content) {
    return (content.items || []).filter((item) => item.name || item.price);
  }

  function youtubeId(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      let id = '';
      if (host === 'youtu.be') id = parsed.pathname.split('/').filter(Boolean)[0] || '';
      else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
        if (parsed.pathname === '/watch') id = parsed.searchParams.get('v') || '';
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts[0] === 'embed' || parts[0] === 'shorts') id = parts[1] || '';
      }
      return /^[\w-]{6,16}$/.test(id) ? id : '';
    } catch {
      return '';
    }
  }

  function vimeoId(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return '';
      const id = parsed.pathname.split('/').filter((part) => /^\d+$/.test(part)).pop() || '';
      return id;
    } catch {
      return '';
    }
  }

  function backdrop(content) {
    const link = content.backgroundVideoUrl || '';
    const yt = youtubeId(link);
    if (yt) {
      return `<iframe class="bg-media" src="https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&mute=1&controls=0&loop=1&playlist=${yt}&modestbranding=1&playsinline=1&rel=0" allow="autoplay; encrypted-media" title=""></iframe>`;
    }
    const vimeo = vimeoId(link);
    if (vimeo) {
      return `<iframe class="bg-media" src="https://player.vimeo.com/video/${vimeo}?background=1&autoplay=1&muted=1&loop=1" allow="autoplay" title=""></iframe>`;
    }
    if (link) return `<video class="bg-media" src="${esc(link)}" autoplay muted loop playsinline></video>`;
    if (content.backgroundKind === 'video' && content.backgroundUrl) {
      return `<video class="bg-media" src="${esc(content.backgroundUrl)}" autoplay muted loop playsinline></video>`;
    }
    if (content.backgroundUrl) return `<img class="bg-media ken" src="${esc(content.backgroundUrl)}" alt="">`;
    return '';
  }

  function paint(root, content, html) {
    const media = backdrop(content);
    root.classList.toggle('has-media', Boolean(media));
    root.dataset.font = FONTS.includes(content.font) ? content.font : 'sans';
    root.innerHTML = `${media ? `<div class="bg-stage">${media}</div><div class="menu-veil"></div>` : ''}<div class="menu-layer">${html}</div>`;
    if (content?.accent) root.style.setProperty('--price', content.accent);
    if (content?.action) root.style.setProperty('--action', content.action);
    if (content?.navy) root.style.setProperty('--navy', content.navy);
  }

  function stack(content) {
    return `
      <header class="stack-head">${logo(content)}<div><h1>${esc(content.headline)}</h1><p>${esc(content.subtitle || content.tagline || '')}</p></div></header>
      <div class="stack">
        ${rows(content).map((item) => `
          <div class="stack-row">
            <div><strong>${esc(item.name)}${badge(item.badge)}</strong><small>${esc(item.note)}</small></div>
            <b>${esc(item.price)}</b>
          </div>`).join('')}
      </div>`;
  }

  const templates = {
    aurora(root, content) {
      const list = rows(content).map((item, index) => `
        <div class="aurora-row" style="animation-delay:${index * 90}ms">
          <div><strong>${esc(item.name)}${badge(item.badge)}</strong><small>${esc(item.note)}</small></div>
          <div class="aurora-price">${esc(item.price)}</div>
        </div>`).join('');
      paint(root, content, `
        <div class="aurora-wash"></div>
        <header class="aurora-head">${logo(content)}<h1>${esc(content.headline)}</h1><p>${esc(content.subtitle || content.tagline || '')}</p></header>
        <div class="aurora-list">${list}</div>`);
    },
    vitrina(root, content) {
      const items = rows(content);
      let index = 0;
      let timer = 0;
      function draw() {
        const current = items[index % Math.max(items.length, 1)] || { name: content.headline, price: '', note: '', badge: '' };
        const rest = items.filter((_, itemIndex) => itemIndex !== index % Math.max(items.length, 1));
        paint(root, content, `
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
          </aside>`);
      }
      draw();
      if (items.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        timer = window.setInterval(() => { index += 1; draw(); }, 4200);
      }
      root._stop = () => window.clearInterval(timer);
    },
    cinta(root, content) {
      const items = rows(content);
      const tape = [...items, ...items].map((item) => `<span>${esc(item.name)} · ${esc(item.price)}</span>`).join('');
      paint(root, content, `
        <header class="cinta-head">${logo(content)}<h1>${esc(content.headline)}</h1><p>${esc(content.subtitle || content.tagline || '')}</p></header>
        <div class="cinta-list">
          ${items.map((item) => `
            <div class="cinta-item">
              <div>${esc(item.name)}${badge(item.badge)}<small>${esc(item.note)}</small></div>
              <span>${esc(item.price)}</span>
            </div>`).join('')}
        </div>
        <div class="marquee"><div class="marquee-track">${tape}</div></div>`);
    },
    carta(root, content) {
      const categories = (content.categories || []).filter((category) => category.items?.length);
      const groups = categories.length ? categories : [{ name: content.subtitle || 'Carta', items: rows(content) }];
      if (content.presentation === 'uno') {
        uno(root, content, groups);
        return;
      }
      let index = 0;
      let timer = 0;
      function draw() {
        const category = groups[index % groups.length] || { name: '', items: [] };
        paint(root, content, `
          <header class="carta-top">
            ${logo(content)}
            <div>
              <p class="carta-kicker">${esc(content.headline)}</p>
              <h1>${esc(category.name)}</h1>
            </div>
            <div class="carta-chips">${groups.map((group, chip) => `<span class="${chip === index % groups.length ? 'is-on' : ''}">${esc(group.name)}</span>`).join('')}</div>
          </header>
          <div class="carta-grid">
            ${category.items.map((item) => dishCard(item)).join('')}
          </div>`);
      }
      draw();
      if (groups.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        timer = window.setInterval(() => { index += 1; draw(); }, 7000);
      }
      root._stop = () => window.clearInterval(timer);
    },
    promo(root, content) {
      const lead = rows(content)[0] || { name: content.headline, price: '', note: content.subtitle, badge: '' };
      paint(root, content, `
        <header class="stack-head">${logo(content)}<div><p class="carta-kicker">${esc(content.subtitle || '')}</p><h1 class="promo-title">${esc(lead.name)}</h1><p class="promo-price">${esc(lead.price)}</p><p>${esc(lead.note)}</p></div></header>
        <div class="stack">${rows(content).slice(1).map((item) => `<div class="stack-row"><div><strong>${esc(item.name)}${badge(item.badge)}</strong></div><b>${esc(item.price)}</b></div>`).join('')}</div>`);
    },
    ticker(root, content) {
      const items = rows(content);
      const tape = [...items, ...items].map((item) => `<span>${esc(item.name)} ${esc(item.price)}</span>`).join('');
      paint(root, content, `
        <header class="stack-head promo-title-wrap">${logo(content)}<div><h1>${esc(content.headline)}</h1><p>${esc(content.subtitle || '')}</p></div></header>
        <div class="marquee marquee-bottom"><div class="marquee-track">${tape}</div></div>`);
    },
    duo(root, content) { paint(root, content, stack(content)); },
    foco(root, content) {
      const items = rows(content);
      let index = 0;
      let timer = 0;
      function draw() {
        const item = items[index % Math.max(items.length, 1)] || { name: content.headline, price: '', note: '', badge: '' };
        paint(root, content, `
          <div class="foco-copy">
            ${logo(content)}
            <p class="carta-kicker">${esc(content.headline)}</p>
            <h1>${esc(item.name)}${badge(item.badge)}</h1>
            <p>${esc(item.note || content.subtitle || '')}</p>
            <b class="promo-price">${esc(item.price)}</b>
          </div>`);
      }
      draw();
      if (items.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        timer = window.setInterval(() => { index += 1; draw(); }, 3600);
      }
      root._stop = () => window.clearInterval(timer);
    },
    pizarra(root, content) { paint(root, content, stack(content)); },
    luxe(root, content) { paint(root, content, stack(content)); },
    barra(root, content) {
      paint(root, content, `
        <header class="stack-head">${logo(content)}<div><h1>${esc(content.headline)}</h1><p>${esc(content.subtitle || '')}</p></div></header>
        <div class="barra-row">${rows(content).map((item) => `<article><strong>${esc(item.name)}</strong><small>${esc(item.note)}</small><b>${esc(item.price)}</b></article>`).join('')}</div>`);
    },
    mercado(root, content) { paint(root, content, stack(content)); },
    salon(root, content) { paint(root, content, stack(content)); },
    hotel(root, content) { paint(root, content, stack(content)); },
    botica(root, content) { paint(root, content, stack(content)); },
    club(root, content) { paint(root, content, stack(content)); },
    helado(root, content) {
      paint(root, content, `
        <header class="stack-head">${logo(content)}<div><h1>${esc(content.headline)}</h1><p>${esc(content.subtitle || '')}</p></div></header>
        <div class="helado-grid">${rows(content).map((item) => `<article class="helado-card"><strong>${esc(item.name)}${badge(item.badge)}</strong><small>${esc(item.note)}</small><b>${esc(item.price)}</b></article>`).join('')}</div>`);
    },
    noche(root, content) { paint(root, content, stack(content)); },
  };

  function dishCard(item) {
    const src = item.imageUrl || (item.imageMediaId ? `/api/media/${item.imageMediaId}/raw` : '');
    const photo = src
      ? `<img class="dish-photo" src="${esc(src)}" alt="">`
      : `<div class="dish-fallback">${esc((item.name || '·').slice(0, 1))}</div>`;
    return `<article class="dish">${photo}<div><strong>${esc(item.name)}</strong><small>${esc(item.note)}</small><b>${esc(item.price)}</b></div></article>`;
  }

  function uno(root, content, groups) {
    const products = groups.flatMap((group) => group.items.map((item) => ({ ...item, category: group.name })));
    const breaks = content.interludeUrls || [];
    let index = 0;
    let stopped = false;
    root._stop = () => { stopped = true; };
    async function cycle() {
      while (!stopped && products.length) {
        const item = products[index % products.length];
        const src = item.imageUrl || (item.imageMediaId ? `/api/media/${item.imageMediaId}/raw` : '');
        paint(root, content, `
          <section class="uno">
            ${src ? `<img class="uno-photo" src="${esc(src)}" alt="">` : ''}
            <div class="uno-copy">
              <p class="carta-kicker">${esc(item.category || content.headline)}</p>
              <h1 class="uno-title"></h1>
              <p class="uno-note"></p>
              <b class="uno-price"></b>
            </div>
          </section>`);
        await typeInto(root.querySelector('.uno-title'), item.name || '', () => stopped);
        await typeInto(root.querySelector('.uno-note'), item.note || '', () => stopped);
        const price = root.querySelector('.uno-price');
        if (price) price.textContent = item.price || '';
        await waitBoard(2600, () => stopped);
        const pause = breaks.length ? breaks[index % breaks.length] : '';
        index += 1;
        if (!pause || stopped) continue;
        paint(root, content, `<img class="uno-break" src="${esc(pause)}" alt="">`);
        await waitBoard(4000, () => stopped);
      }
    }
    cycle();
  }

  function typeInto(node, text, cancelled) {
    return new Promise((resolve) => {
      if (!node) { resolve(); return; }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        node.textContent = text;
        resolve();
        return;
      }
      let count = 0;
      const timer = window.setInterval(() => {
        if (cancelled()) { window.clearInterval(timer); resolve(); return; }
        count += 1;
        node.textContent = text.slice(0, count);
        if (count >= text.length) { window.clearInterval(timer); resolve(); }
      }, 42);
    });
  }

  function waitBoard(ms, cancelled) {
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (cancelled() || Date.now() - started >= ms) {
          window.clearInterval(timer);
          resolve();
        }
      }, 120);
    });
  }

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
