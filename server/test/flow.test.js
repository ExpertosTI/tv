import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { start } from '../src/index.js';

const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function cookie(res) {
  return (res.headers.getSetCookie?.() || []).map((entry) => entry.split(';')[0]).join('; ');
}

async function json(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

test('un negocio publica una lista y la TV la recibe', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pantalla-'));
  const ctx = await start({ dataDir: dir, port: 0 });
  const base = `http://127.0.0.1:${ctx.port}`;
  try {
    const created = await json(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Café Centro',
        ownerName: 'Ada',
        email: 'ada@cafe.test',
        password: 'clave-segura',
      }),
    });
    assert.equal(created.res.status, 201);
    const session = cookie(created.res);

    const other = await json(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Otro local',
        ownerName: 'Leo',
        email: 'leo@otro.test',
        password: 'clave-segura',
      }),
    });
    const otherSession = cookie(other.res);

    const playlist = await json(`${base}/api/playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: session },
      body: JSON.stringify({ name: 'Menú del día', fit: 'contain', imageSeconds: 8 }),
    });
    assert.equal(playlist.res.status, 201);

    const body = new FormData();
    body.append('file', new Blob([gif], { type: 'image/gif' }), 'promo.gif');
    const uploaded = await json(`${base}/api/media`, { method: 'POST', headers: { Cookie: session }, body });
    assert.equal(uploaded.res.status, 201);
    assert.equal(uploaded.data.kind, 'gif');

    const pngBody = new FormData();
    pngBody.append('file', new Blob([png], { type: 'image/png' }), 'precio.png');
    const pngUpload = await json(`${base}/api/media`, { method: 'POST', headers: { Cookie: session }, body: pngBody });
    assert.equal(pngUpload.res.status, 201);
    assert.equal(pngUpload.data.kind, 'image');

    const rejected = await json(`${base}/api/media/${uploaded.data.id}/raw`, { headers: { Cookie: otherSession } });
    assert.equal(rejected.res.status, 404);

    const withItem = await json(`${base}/api/playlists/${playlist.data.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: session },
      body: JSON.stringify({ mediaId: uploaded.data.id, durationSeconds: 5 }),
    });
    assert.equal(withItem.data.items.length, 1);
    assert.equal(withItem.data.fit, 'contain');

    const deviceId = crypto.randomUUID();
    const deviceSecret = 'ab'.repeat(32);
    const headers = { 'Content-Type': 'application/json', 'X-Device-Id': deviceId, 'X-Device-Secret': deviceSecret };
    const hello = await json(`${base}/api/device/sync`, { method: 'POST', headers, body: '{}' });
    assert.equal(hello.res.status, 200);
    assert.equal(hello.data.paired, false);
    assert.match(hello.data.pairingCode, /^[A-Z0-9]{6}$/);

    const missing = await json(`${base}/api/screens/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: session },
      body: JSON.stringify({ code: 'ZZZZZZ', name: 'Barra' }),
    });
    assert.equal(missing.res.status, 404);

    const paired = await json(`${base}/api/screens/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: session },
      body: JSON.stringify({ code: hello.data.pairingCode, name: 'Barra' }),
    });
    assert.equal(paired.res.status, 201);

    await json(`${base}/api/screens`, { headers: { Cookie: session } }).then(async ({ data }) => {
      assert.equal(data.length, 1);
      const assigned = await json(`${base}/api/screens/${data[0].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: session },
        body: JSON.stringify({ playlistId: playlist.data.id }),
      });
      assert.equal(assigned.res.status, 200);
    });

    const live = await json(`${base}/api/device/sync`, { method: 'POST', headers, body: '{}' });
    assert.equal(live.data.paired, true);
    assert.equal(live.data.screenName, 'Barra');
    assert.equal(live.data.playlist.items.length, 1);
    assert.equal(live.data.playlist.items[0].kind, 'gif');
    assert.equal(live.data.playlist.fit, 'contain');

    const file = await fetch(live.data.playlist.items[0].url);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/gif');
    const bytes = Buffer.from(await file.arrayBuffer());
    assert.equal(bytes[0], 0x47);

    const stolen = await json(`${base}/api/device/sync`, {
      method: 'POST',
      headers: { ...headers, 'X-Device-Secret': 'cd'.repeat(32) },
      body: '{}',
    });
    assert.equal(stolen.res.status, 401);

    const board = await json(`${base}/api/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: session },
      body: JSON.stringify({ templateId: 'aurora', name: 'Carta barra' }),
    });
    assert.equal(board.res.status, 201);
    assert.equal(board.data.templateId, 'aurora');
    assert.ok(board.data.content.items.length >= 1);

    const priced = await json(`${base}/api/boards/${board.data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: session },
      body: JSON.stringify({
        content: {
          headline: 'Café del día',
          subtitle: 'Barra',
          items: [{ name: 'Espresso', price: 'RD$ 110', note: 'Doble', badge: '' }],
        },
      }),
    });
    assert.equal(priced.data.content.items[0].price, 'RD$ 110');

    const blocked = await json(`${base}/api/boards/${board.data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: otherSession },
      body: JSON.stringify({ name: 'Ajeno' }),
    });
    assert.equal(blocked.res.status, 404);

    const withBoard = await json(`${base}/api/playlists/${playlist.data.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: session },
      body: JSON.stringify({ boardId: board.data.id }),
    });
    assert.equal(withBoard.data.items.at(-1).kind, 'board');
    assert.equal(withBoard.data.items.at(-1).content.items[0].price, 'RD$ 110');

    const shown = await json(`${base}/api/device/sync`, { method: 'POST', headers, body: '{}' });
    const liveBoard = shown.data.playlist.items.find((item) => item.kind === 'board');
    assert.equal(liveBoard.content.items[0].price, 'RD$ 110');
    assert.match(liveBoard.url, /\/play\/boards\//);
    const page = await fetch(liveBoard.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /RD\$ 110/);
  } finally {
    await ctx.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
