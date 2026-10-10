const main = document.getElementById('main');
const state = { tab: 'screens', media: [], playlists: [], screens: [], boards: [], templates: [], brand: null, selected: null, boardId: null, me: null };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

async function api(path, options = {}) {
  const headers = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
  const res = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...headers, ...options.headers } });
  if (res.status === 401) location.href = '/';
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.');
  return data;
}

function sizeLabel(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind) {
  if (kind === 'board') return 'Menú';
  if (kind === 'gif') return 'GIF';
  if (kind === 'video') return 'Video';
  return 'Imagen';
}

function setTab(tab) {
  state.tab = tab;
  for (const button of document.querySelectorAll('.nav')) {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  render();
}

function render() {
  if (state.tab === 'brand') renderBrand();
  if (state.tab === 'screens') renderScreens();
  if (state.tab === 'menus') renderMenus();
  if (state.tab === 'media') renderMedia();
  if (state.tab === 'lists') renderLists();
}

function renderBrand() {
  const brand = state.brand || { tagline: '', colorNavy: '#00204E', colorAccent: '#0087FF', colorInk: '#8FD3FF', logoMediaId: '' };
  const images = state.media.filter((file) => file.kind === 'image');
  main.innerHTML = `
    <div class="panel-head"><div><p class="step-no">Perfil</p><h2>La línea del negocio</h2><p class="muted">El logo y los colores salen en el menú de la TV en cuanto guardas.</p></div></div>
    <form class="card" id="brand-form">
      ${brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="" width="72" height="72" style="object-fit:contain;background:#fff;border-radius:16px">` : ''}
      <label>Logo
        <select name="logoMediaId">
          <option value="">Sin logo</option>
          ${images.map((file) => `<option value="${esc(file.id)}" ${file.id === brand.logoMediaId ? 'selected' : ''}>${esc(file.name)}</option>`).join('')}
        </select>
      </label>
      <label>Frase<input name="tagline" maxlength="90" value="${esc(brand.tagline)}" placeholder="Café de la esquina"></label>
      <div class="row">
        <label>Navy<input name="colorNavy" type="color" value="${esc(brand.colorNavy)}"></label>
        <label>Acción<input name="colorAccent" type="color" value="${esc(brand.colorAccent)}"></label>
        <label>Precio<input name="colorInk" type="color" value="${esc(brand.colorInk)}"></label>
      </div>
      <button class="btn primary" type="submit">Guardar perfil</button>
      <p class="form-error" id="brand-status" role="status"></p>
    </form>
    <p class="muted">Sube el logo en Archivos. Las fotos de una lista se ven como diapositivas. Los videos se comprimen al subirlos.</p>`;
  document.getElementById('brand-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = document.getElementById('brand-status');
    try {
      state.brand = await api('/api/brand', {
        method: 'PATCH',
        body: JSON.stringify({
          logoMediaId: form.get('logoMediaId'),
          tagline: form.get('tagline'),
          colorNavy: form.get('colorNavy'),
          colorAccent: form.get('colorAccent'),
          colorInk: form.get('colorInk'),
        }),
      });
      status.textContent = 'Guardado. La TV toma el perfil al momento.';
    } catch (err) {
      status.textContent = err.message;
    }
  });
}

function renderScreens() {
  const options = state.playlists.map((list) => `<option value="${esc(list.id)}">${esc(list.name)}</option>`).join('');
  main.innerHTML = `
    <div class="panel-head"><div><p class="step-no">Pantallas</p><h2>Vincula la TV</h2></div></div>
    <form class="card" id="pair-form">
      <p>Escribe el código que aparece en la TV.</p>
      <div class="codes" id="codes">
        ${Array.from({ length: 6 }, () => '<input class="code" inputmode="text" maxlength="1" autocomplete="off" aria-label="Carácter del código">').join('')}
      </div>
      <label>Nombre en el local<input name="name" maxlength="60" placeholder="Barra, caja, vitrina"></label>
      <button class="btn primary" type="submit">Vincular pantalla</button>
      <p class="form-error" id="pair-error" role="alert"></p>
    </form>
    <div class="list" style="margin-top:16px">
      ${state.screens.length ? state.screens.map((screen) => `
        <article class="card screen" data-id="${esc(screen.id)}">
          <div>
            <h3>${esc(screen.name || 'Pantalla')}</h3>
            <p class="pill ${screen.online ? 'on' : 'off'}">${screen.online ? 'En línea' : 'Sin conexión'}</p>
            <label>Lista
              <select data-playlist>
                <option value="">Sin lista</option>
                ${options}
              </select>
            </label>
            <label>En esta TV
              <select data-fit>
                <option value="">Como diga la lista</option>
                <option value="cover">Llenar pantalla</option>
                <option value="contain">Ver completo</option>
              </select>
            </label>
          </div>
          <div class="item-actions">
            <button class="btn" type="button" data-unpair>Desvincular</button>
            <button class="btn danger" type="button" data-delete>Borrar</button>
          </div>
        </article>
      `).join('') : '<p class="card">Aún no hay pantallas. Abre RENACE Pantalla en la TV y escribe aquí el código.</p>'}
    </div>`;
  bindCodes(document.getElementById('pair-form'));
  document.getElementById('pair-form').addEventListener('submit', pairScreen);
  for (const card of main.querySelectorAll('.screen')) {
    const screen = state.screens.find((item) => item.id === card.dataset.id);
    card.querySelector('[data-playlist]').value = screen.playlistId || '';
    card.querySelector('[data-fit]').value = screen.fit || '';
    card.querySelector('[data-playlist]').addEventListener('change', (event) => {
      api(`/api/screens/${screen.id}`, { method: 'PATCH', body: JSON.stringify({ playlistId: event.target.value }) }).catch(showPairError);
    });
    card.querySelector('[data-fit]').addEventListener('change', (event) => {
      api(`/api/screens/${screen.id}`, { method: 'PATCH', body: JSON.stringify({ fit: event.target.value || null }) }).catch(showPairError);
    });
    card.querySelector('[data-unpair]').addEventListener('click', async () => {
      if (!confirm('¿Desvincular esta TV? Volverá a mostrar un código.')) return;
      await api(`/api/screens/${screen.id}/unpair`, { method: 'POST' });
      await refresh();
    });
    card.querySelector('[data-delete]').addEventListener('click', async () => {
      if (!confirm('¿Borrar esta pantalla del negocio?')) return;
      await api(`/api/screens/${screen.id}`, { method: 'DELETE' });
      await refresh();
    });
  }
}

function showPairError(error) {
  const node = document.getElementById('pair-error');
  if (node) node.textContent = error.message;
}

function bindCodes(form) {
  const inputs = [...form.querySelectorAll('.code')];
  const alphabet = /[A-HJ-NP-Z2-9]/;
  inputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      const char = input.value.toUpperCase().split('').find((item) => alphabet.test(item)) || '';
      input.value = char;
      if (char && inputs[index + 1]) inputs[index + 1].focus();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !input.value && inputs[index - 1]) inputs[index - 1].focus();
    });
    input.addEventListener('paste', (event) => {
      event.preventDefault();
      const text = (event.clipboardData.getData('text') || '').toUpperCase().split('').filter((item) => alphabet.test(item)).slice(0, 6);
      text.forEach((char, idx) => { inputs[idx].value = char; });
      (inputs[text.length] || inputs[5]).focus();
    });
  });
}

async function pairScreen(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const code = [...form.querySelectorAll('.code')].map((input) => input.value).join('');
  const error = document.getElementById('pair-error');
  error.textContent = '';
  if (code.length !== 6) {
    error.textContent = 'El código tiene 6 caracteres.';
    return;
  }
  try {
    await api('/api/screens/pair', {
      method: 'POST',
      body: JSON.stringify({ code, name: new FormData(form).get('name') }),
    });
    form.reset();
    await refresh();
  } catch (err) {
    error.textContent = err.message;
  }
}

function renderMedia() {
  main.innerHTML = `
    <div class="panel-head"><div><p class="step-no">Contenido</p><h2>Archivos del menú</h2><p class="muted">JPG, PNG o WEBP hasta 20 MB. GIF hasta 40 MB. MP4, MOV o WEBM hasta 250 MB.</p></div></div>
    <form class="drop" id="upload-form">
      <p>Suelta los archivos aquí o elige desde el equipo.</p>
      <input id="file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple>
      <p class="form-error" id="upload-error" role="alert"></p>
    </form>
    <div class="grid">
      ${state.media.length ? state.media.map((file) => `
        <article class="card media-card">
          ${file.kind === 'video'
            ? `<div class="thumb">VIDEO</div>`
            : `<div class="thumb" style="background-image:url('${esc(file.url)}')"></div>`}
          <strong>${esc(file.name)}</strong>
          <span class="muted">${kindLabel(file.kind)} · ${sizeLabel(file.bytes)}</span>
          <button class="btn danger" type="button" data-del="${esc(file.id)}">Borrar</button>
        </article>
      `).join('') : '<p class="card">Aún no hay archivos. Sube el primer JPG, GIF o video.</p>'}
    </div>`;
  const input = document.getElementById('file');
  const form = document.getElementById('upload-form');
  form.addEventListener('dragover', (event) => event.preventDefault());
  form.addEventListener('drop', (event) => {
    event.preventDefault();
    uploadFiles(event.dataTransfer.files);
  });
  input.addEventListener('change', () => uploadFiles(input.files));
  for (const button of main.querySelectorAll('[data-del]')) {
    button.addEventListener('click', async () => {
      if (!confirm('¿Borrar este archivo? También sale de las listas.')) return;
      await api(`/api/media/${button.dataset.del}`, { method: 'DELETE' });
      await refresh();
    });
  }
}

async function uploadFiles(files) {
  const error = document.getElementById('upload-error');
  error.textContent = '';
  for (const file of files) {
    const body = new FormData();
    body.append('file', file);
    try {
      await api('/api/media', { method: 'POST', body });
    } catch (err) {
      error.textContent = `${file.name}: ${err.message}`;
    }
  }
  await refresh();
}

function renderLists() {
  const selected = state.playlists.find((list) => list.id === state.selected) || state.playlists[0] || null;
  state.selected = selected?.id || null;
  main.innerHTML = `
    <div class="panel-head">
      <div><p class="step-no">Listas</p><h2>Qué se ve y en qué orden</h2></div>
    </div>
    <div class="split">
      <div>
        <form id="new-list" class="card">
          <label>Nueva lista<input name="name" required maxlength="80" placeholder="Menú del día"></label>
          <button class="btn primary" type="submit">Crear lista</button>
          <p class="form-error" id="list-error" role="alert"></p>
        </form>
        <div style="height:12px"></div>
        ${state.playlists.map((list) => `<button class="btn choice" type="button" data-pick="${esc(list.id)}" aria-pressed="${list.id === state.selected}">${esc(list.name)}</button>`).join('') || '<p class="muted">Aún no hay listas.</p>'}
      </div>
      <div id="editor"></div>
    </div>`;
  document.getElementById('new-list').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const created = await api('/api/playlists', { method: 'POST', body: JSON.stringify({ name: new FormData(event.currentTarget).get('name') }) });
      state.selected = created.id;
      await refresh();
    } catch (err) {
      document.getElementById('list-error').textContent = err.message;
    }
  });
  for (const button of main.querySelectorAll('[data-pick]')) {
    button.addEventListener('click', () => { state.selected = button.dataset.pick; render(); });
  }
  if (selected) renderEditor(selected);
}

function renderEditor(list) {
  const editor = document.getElementById('editor');
  const mediaOptions = state.media.map((file) => `<option value="file:${esc(file.id)}">${esc(file.name)} · ${kindLabel(file.kind)}</option>`).join('');
  const boardOptions = state.boards.map((board) => `<option value="board:${esc(board.id)}">${esc(board.name)} · Menú</option>`).join('');
  editor.innerHTML = `
    <article class="card">
      <div class="panel-head">
        <h3>${esc(list.name)}</h3>
        <a class="btn" href="/tv?preview=${esc(list.id)}" target="_blank" rel="noopener">Ver vista previa</a>
      </div>
      <div class="row">
        <label>Segundos de cada imagen o GIF<input id="seconds" type="number" min="1" max="600" value="${list.imageSeconds}"></label>
        <label>Ajuste
          <select id="fit">
            <option value="cover" ${list.fit === 'cover' ? 'selected' : ''}>Llenar pantalla</option>
            <option value="contain" ${list.fit === 'contain' ? 'selected' : ''}>Ver completo</option>
          </select>
        </label>
        <label class="check"><input id="sound" type="checkbox" ${list.sound ? 'checked' : ''}> Video con sonido</label>
      </div>
      <div class="list">
        ${list.items.length ? list.items.map((item, index) => `
          <div class="plist-item" data-item="${esc(item.id)}">
            <div>
              <strong>${esc(item.name)}</strong>
              <p class="muted">${kindLabel(item.kind)}</p>
              <label class="inline">Segundos
                <input data-seconds type="number" min="1" max="600" placeholder="${list.imageSeconds}" value="${item.durationSeconds ?? ''}">
              </label>
            </div>
            <div class="item-actions">
              <button class="btn" type="button" data-move="up" ${index === 0 ? 'disabled' : ''}>Subir</button>
              <button class="btn" type="button" data-move="down" ${index === list.items.length - 1 ? 'disabled' : ''}>Bajar</button>
              <button class="btn danger" type="button" data-remove>Quitar</button>
            </div>
          </div>
        `).join('') : '<p>Esta lista está vacía. Agrega fotos para las diapositivas, un video o un menú.</p>'}
      </div>
      <form id="add-item" class="row" style="margin-top:16px">
        <label>Agregar a la TV
          <select name="pick" required>${boardOptions}${mediaOptions}${(boardOptions || mediaOptions) ? '' : '<option value="">Crea un menú o sube un archivo</option>'}</select>
        </label>
        <button class="btn primary" type="submit" ${state.media.length || state.boards.length ? '' : 'disabled'}>Agregar</button>
      </form>
      <p><button class="btn danger" type="button" id="delete-list">Borrar lista</button></p>
    </article>`;
  const saveList = () => api(`/api/playlists/${list.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      imageSeconds: Number(document.getElementById('seconds').value),
      fit: document.getElementById('fit').value,
      sound: document.getElementById('sound').checked,
    }),
  }).then(refresh).catch((error) => alert(error.message));
  document.getElementById('seconds').addEventListener('change', saveList);
  document.getElementById('fit').addEventListener('change', saveList);
  document.getElementById('sound').addEventListener('change', saveList);
  document.getElementById('add-item').addEventListener('submit', async (event) => {
    event.preventDefault();
    const pick = String(new FormData(event.currentTarget).get('pick') || '');
    const body = pick.startsWith('board:') ? { boardId: pick.slice(6) } : { mediaId: pick.slice(5) };
    if (!body.boardId && !body.mediaId) return;
    await api(`/api/playlists/${list.id}/items`, { method: 'POST', body: JSON.stringify(body) });
    await refresh();
  });
  document.getElementById('delete-list').addEventListener('click', async () => {
    if (!confirm('¿Borrar esta lista? Las pantallas que la usaban quedan sin contenido.')) return;
    await api(`/api/playlists/${list.id}`, { method: 'DELETE' });
    state.selected = null;
    await refresh();
  });
  for (const row of editor.querySelectorAll('[data-item]')) {
    const itemId = row.dataset.item;
    row.querySelector('[data-seconds]').addEventListener('change', async (event) => {
      const value = event.target.value === '' ? null : Number(event.target.value);
      await api(`/api/playlists/${list.id}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ durationSeconds: value }) });
      await refresh();
    });
    for (const button of row.querySelectorAll('[data-move]')) {
      button.addEventListener('click', async () => {
        await api(`/api/playlists/${list.id}/items/${itemId}/move`, { method: 'POST', body: JSON.stringify({ direction: button.dataset.move }) });
        await refresh();
      });
    }
    row.querySelector('[data-remove]').addEventListener('click', async () => {
      await api(`/api/playlists/${list.id}/items/${itemId}`, { method: 'DELETE' });
      await refresh();
    });
  }
}

function emptyItem() {
  return { name: '', price: '', note: '', badge: '' };
}

function readMenuForm() {
  const items = [...document.querySelectorAll('[data-row]')].map((row) => ({
    name: row.querySelector('[data-name]').value,
    price: row.querySelector('[data-price]').value,
    note: row.querySelector('[data-note]').value,
    badge: row.querySelector('[data-badge]').value,
  }));
  return {
    name: document.getElementById('menu-name').value,
    content: {
      headline: document.getElementById('menu-headline').value,
      subtitle: document.getElementById('menu-subtitle').value,
      items,
      backgroundMediaId: document.getElementById('menu-bg')?.value || '',
    },
  };
}

function paintPreview() {
  const frame = document.getElementById('menu-preview');
  const board = state.boards.find((item) => item.id === state.boardId);
  if (!frame || !board) return;
  const draft = readMenuForm();
  window.RenaceBoards.mount(frame, board.templateId, draft.content);
}

function renderMenus() {
  const selected = state.boards.find((board) => board.id === state.boardId) || state.boards[0] || null;
  state.boardId = selected?.id || null;
  main.innerHTML = `
    <div class="panel-head"><div><p class="step-no">Menús</p><h2>Precios en vivo</h2><p class="muted">Elige una plantilla, cambia el precio y la TV lo muestra con movimiento. No hace falta volver a subir una imagen.</p></div></div>
    <div class="split">
      <div>
        <form id="new-menu" class="card template-pick">
          <label>Plantilla
            <select name="templateId">
              ${state.templates.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}
            </select>
          </label>
          <p class="muted" id="template-blurb"></p>
          <label>Nombre<input name="name" maxlength="80" placeholder="Menú de barra" required></label>
          <button class="btn primary" type="submit">Crear menú</button>
          <p class="form-error" id="menu-error" role="alert"></p>
        </form>
        <div style="height:12px"></div>
        ${state.boards.map((board) => `<button class="btn choice" type="button" data-board="${esc(board.id)}" aria-pressed="${board.id === state.boardId}">${esc(board.name)}</button>`).join('') || '<p class="muted">Aún no hay menús.</p>'}
      </div>
      <div id="menu-editor"></div>
    </div>`;
  const select = document.querySelector('#new-menu select');
  const blurb = document.getElementById('template-blurb');
  const showBlurb = () => {
    const found = state.templates.find((item) => item.id === select.value);
    blurb.textContent = found?.blurb || '';
  };
  select.addEventListener('change', showBlurb);
  showBlurb();
  document.getElementById('new-menu').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const created = await api('/api/boards', {
        method: 'POST',
        body: JSON.stringify({ templateId: form.get('templateId'), name: form.get('name') }),
      });
      state.boardId = created.id;
      await refresh();
    } catch (err) {
      document.getElementById('menu-error').textContent = err.message;
    }
  });
  for (const button of main.querySelectorAll('[data-board]')) {
    button.addEventListener('click', () => { state.boardId = button.dataset.board; render(); });
  }
  if (selected) renderMenuEditor(selected);
}

function renderMenuEditor(board) {
  const editor = document.getElementById('menu-editor');
  const items = board.content.items.length ? board.content.items : [emptyItem()];
  editor.innerHTML = `
    <article class="card menu-editor">
      <div class="tv-frame"><div id="menu-preview"></div></div>
      <label>Nombre del menú<input id="menu-name" maxlength="80" value="${esc(board.name)}"></label>
      <label>Título en pantalla<input id="menu-headline" maxlength="60" value="${esc(board.content.headline)}"></label>
      <label>Subtítulo<input id="menu-subtitle" maxlength="90" value="${esc(board.content.subtitle)}"></label>
      <label>Fondo
        <select id="menu-bg">
          <option value="">Patrón de la marca</option>
          ${state.media.filter((file) => file.kind === 'image').map((file) => `<option value="${esc(file.id)}" ${file.id === board.content.backgroundMediaId ? 'selected' : ''}>${esc(file.name)}</option>`).join('')}
        </select>
      </label>
      <div id="menu-rows">
        ${items.map((item) => menuRow(item)).join('')}
      </div>
      <div class="item-actions">
        <button class="btn" type="button" id="add-row">Agregar producto</button>
        <button class="btn primary" type="button" id="save-menu">Guardar precios</button>
        <button class="btn danger" type="button" id="delete-menu">Borrar menú</button>
      </div>
      <p class="muted" id="menu-status">Los cambios se ven en la vista previa al escribir. Guarda para que la TV los tome.</p>
    </article>`;
  paintPreview();
  editor.addEventListener('input', paintPreview);
  document.getElementById('add-row').addEventListener('click', () => {
    if (document.querySelectorAll('[data-row]').length >= 12) return;
    document.getElementById('menu-rows').insertAdjacentHTML('beforeend', menuRow(emptyItem()));
    paintPreview();
  });
  editor.addEventListener('click', (event) => {
    const button = event.target.closest('[data-drop]');
    if (!button) return;
    button.closest('[data-row]').remove();
    paintPreview();
  });
  document.getElementById('save-menu').addEventListener('click', saveMenu);
  document.getElementById('delete-menu').addEventListener('click', async () => {
    if (!confirm('¿Borrar este menú? Sale de las listas que lo estaban mostrando.')) return;
    await api(`/api/boards/${board.id}`, { method: 'DELETE' });
    state.boardId = null;
    await refresh();
  });
}

function menuRow(item) {
  return `<div class="menu-row" data-row>
    <label>Producto<input data-name maxlength="48" value="${esc(item.name)}"></label>
    <label>Precio<input class="price-input" data-price maxlength="18" value="${esc(item.price)}"></label>
    <label>Detalle<input data-note maxlength="48" value="${esc(item.note)}"></label>
    <label>Etiqueta<input data-badge maxlength="16" value="${esc(item.badge)}" placeholder="Nuevo">
      <button class="btn" type="button" data-drop>Quitar</button>
    </label>
  </div>`;
}

async function saveMenu() {
  const status = document.getElementById('menu-status');
  const draft = readMenuForm();
  try {
    const saved = await api(`/api/boards/${state.boardId}`, { method: 'PATCH', body: JSON.stringify(draft) });
    const index = state.boards.findIndex((item) => item.id === saved.id);
    if (index >= 0) state.boards[index] = saved;
    status.textContent = 'Guardado. La TV actualiza el precio al momento.';
  } catch (err) {
    status.textContent = err.message;
  }
}

async function refresh() {
  const active = document.activeElement;
  const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
  const [media, playlists, screens, boards, templates, brand] = await Promise.all([
    api('/api/media'),
    api('/api/playlists'),
    api('/api/screens'),
    api('/api/boards'),
    api('/api/templates'),
    api('/api/brand'),
  ]);
  state.media = media;
  state.playlists = playlists;
  state.screens = screens;
  state.boards = boards;
  state.templates = templates;
  state.brand = brand;
  const keepForm = (state.tab === 'screens' || state.tab === 'menus') && typing;
  if (!keepForm) render();
}

document.querySelectorAll('.nav').forEach((button) => {
  button.addEventListener('click', () => setTab(button.dataset.tab));
});
document.getElementById('logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.href = '/';
});

api('/api/auth/me').then((me) => {
  state.me = me;
  document.getElementById('biz').textContent = me.businessName;
  document.getElementById('who').textContent = me.email;
  setTab('screens');
  return refresh();
}).catch(() => { location.href = '/'; });

setInterval(() => {
  if (!document.hidden && state.tab === 'screens') refresh().catch(() => {});
}, 8000);
