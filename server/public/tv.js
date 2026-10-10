const previewId = new URLSearchParams(location.search).get('preview');
const gate = document.getElementById('gate');
const stage = document.getElementById('stage');
const still = document.getElementById('still');
const clip = document.getElementById('clip');
const board = document.getElementById('board');
const codeEl = document.getElementById('code');
const titleEl = document.getElementById('title');
const helpEl = document.getElementById('help');
const statusEl = document.getElementById('status');
const newCodeBtn = document.getElementById('new-code');

let generation = 0;
let playing = false;
let activeVersion = '';
let pending = null;
let current = null;

function identity() {
  let id = localStorage.getItem('renace_pantalla_id');
  let secret = localStorage.getItem('renace_pantalla_secret');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{64}$/i.test(secret || '')) {
    id = crypto.randomUUID();
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    secret = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('renace_pantalla_id', id);
    localStorage.setItem('renace_pantalla_secret', secret);
  }
  return { id, secret };
}

function resetIdentity() {
  localStorage.removeItem('renace_pantalla_id');
  localStorage.removeItem('renace_pantalla_secret');
}

function headers() {
  const device = identity();
  return {
    'Content-Type': 'application/json',
    'X-Device-Id': device.id,
    'X-Device-Secret': device.secret,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopMedia() {
  clip.pause();
  clip.removeAttribute('src');
  clip.load();
  still.removeAttribute('src');
  still.hidden = true;
  clip.hidden = true;
  board.hidden = true;
  board.replaceChildren();
}

function showGate(state) {
  generation += 1;
  pending = null;
  current = null;
  stopMedia();
  stage.hidden = true;
  gate.hidden = false;
  document.body.classList.remove('playing');
  if (previewId && !state) {
    titleEl.textContent = 'Esta vista previa no está disponible';
    codeEl.textContent = '';
    helpEl.textContent = 'Entra al panel con la cuenta del negocio.';
    newCodeBtn.hidden = true;
    return;
  }
  if (!state?.paired) {
    titleEl.textContent = 'Escribe este código en el panel';
    codeEl.textContent = state?.pairingCode || '------';
    helpEl.textContent = 'Entra al panel del negocio y vincula esta TV.';
    newCodeBtn.hidden = Boolean(previewId);
    return;
  }
  titleEl.textContent = state.screenName || 'Pantalla vinculada';
  codeEl.textContent = '';
  helpEl.textContent = 'Ya está vinculada. Elige una lista en el panel para empezar.';
  newCodeBtn.hidden = true;
}

function showStage() {
  gate.hidden = true;
  stage.hidden = false;
  document.body.classList.add('playing');
}

async function showSlide(item, playlist, token) {
  const fit = playlist.fit === 'contain' ? 'contain' : 'cover';
  still.style.objectFit = fit;
  clip.style.objectFit = fit;
  if (item.kind === 'board') {
    clip.pause();
    clip.hidden = true;
    still.hidden = true;
    board.hidden = false;
    let shown = item;
    window.RenaceBoards.mount(board, shown.templateId, shown.content);
    const seconds = Math.min(600, Math.max(5, item.durationSeconds || 45));
    for (let elapsed = 0; elapsed < seconds && token === generation; elapsed += 0.25) {
      const live = pending?.items?.find((entry) => entry.boardId === shown.boardId);
      if (live && live.rev !== shown.rev) {
        window.RenaceBoards.mount(board, live.templateId, live.content);
        shown = live;
      }
      await wait(250);
    }
  } else if (item.kind === 'video') {
    still.hidden = true;
    clip.hidden = false;
    clip.src = item.url;
    clip.muted = !playlist.sound;
    try {
      await clip.play();
    } catch {
      clip.muted = true;
      await clip.play();
    }
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clip.removeEventListener('ended', finish);
        clip.removeEventListener('error', finish);
        clearTimeout(timer);
        clearInterval(pulse);
        resolve();
      };
      clip.addEventListener('ended', finish);
      clip.addEventListener('error', finish);
      const timer = item.durationSeconds ? setTimeout(finish, item.durationSeconds * 1000) : null;
      const pulse = setInterval(() => { if (token !== generation) finish(); }, 250);
    });
    clip.pause();
  } else {
    clip.pause();
    clip.hidden = true;
    still.hidden = false;
    still.classList.toggle('ken', item.kind === 'image');
    still.src = item.url;
    const seconds = Math.min(600, Math.max(1, item.durationSeconds || playlist.imageSeconds || 10));
    for (let elapsed = 0; elapsed < seconds && token === generation; elapsed += 0.25) {
      await wait(250);
    }
  }
  if (token !== generation) return;
}

async function loop(token) {
  playing = true;
  let index = 0;
  while (token === generation) {
    const playlist = pending || current;
    pending = null;
    if (!playlist?.items?.length || token !== generation) break;
    activeVersion = playlist.version;
    current = playlist;
    const item = playlist.items[index % playlist.items.length];
    try {
      await showSlide(item, playlist, token);
    } catch {
      await wait(1200);
    }
    if (token !== generation) break;
    if (pending && pending.version !== activeVersion) index = 0;
    else index += 1;
  }
  if (token === generation) playing = false;
}

function apply(state) {
  statusEl.textContent = '';
  const playlist = state.playlist;
  if (!state.paired || !playlist?.items?.length) {
    showGate(state);
    return;
  }
  showStage();
  if (!playing) {
    current = playlist;
    activeVersion = playlist.version;
    const token = generation;
    loop(token);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return;
  }
  if (playlist.version !== activeVersion) pending = playlist;
}

async function sync() {
  if (previewId) {
    const res = await fetch(`/api/preview/${previewId}`, { credentials: 'same-origin' });
    if (res.status === 401) {
      showGate(null);
      return null;
    }
    if (!res.ok) throw new Error('preview');
    return res.json();
  }
  let res = await fetch('/api/device/sync', { method: 'POST', headers: headers(), body: '{}' });
  if (res.status === 401) {
    resetIdentity();
    res = await fetch('/api/device/sync', { method: 'POST', headers: headers(), body: '{}' });
  }
  if (!res.ok) throw new Error('sync');
  return res.json();
}

async function tick() {
  let delay = 3000;
  try {
    const state = await sync();
    if (state) {
      apply(state);
      delay = state.paired && state.playlist?.items?.length ? 4000 : 3000;
    }
  } catch {
    if (!playing) statusEl.textContent = 'Sin conexión con el servidor.';
    delay = 5000;
  }
  setTimeout(tick, delay);
}

newCodeBtn.addEventListener('click', async () => {
  newCodeBtn.disabled = true;
  try {
    const res = await fetch('/api/device/code', { method: 'POST', headers: headers(), body: '{}' });
    const state = await res.json();
    if (res.ok) apply(state);
    else statusEl.textContent = state.error || 'No se pudo cambiar el código.';
  } catch {
    statusEl.textContent = 'Sin conexión con el servidor.';
  }
  newCodeBtn.disabled = false;
});

document.getElementById('fullscreen').addEventListener('click', () => {
  document.documentElement.requestFullscreen?.().catch(() => {});
});

if (previewId) newCodeBtn.hidden = true;
tick();

async function listen() {
  if (previewId || !window.ReadableStream) return;
  while (true) {
    try {
      const res = await fetch('/api/device/events', { headers: headers() });
      if (!res.ok || !res.body) throw new Error('events');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        if (!buffer.includes('refresh')) continue;
        buffer = '';
        const state = await sync();
        if (state) apply(state);
      }
    } catch {
      await wait(3000);
    }
  }
}
listen();
