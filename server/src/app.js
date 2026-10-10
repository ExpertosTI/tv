import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { compressVideo } from './compress.js';
import { many, one, openDatabase } from './db.js';
import { menuFromOdoo, safeImageUrl } from './odoo.js';
import { publicTemplates, sanitizeContent, templateById } from './templates.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIME = {
  'image/jpeg': { kind: 'image', ext: '.jpg', max: 20 * 1024 * 1024 },
  'image/png': { kind: 'image', ext: '.png', max: 20 * 1024 * 1024 },
  'image/webp': { kind: 'image', ext: '.webp', max: 20 * 1024 * 1024 },
  'image/gif': { kind: 'gif', ext: '.gif', max: 40 * 1024 * 1024 },
  'video/mp4': { kind: 'video', ext: '.mp4', max: 250 * 1024 * 1024 },
  'video/webm': { kind: 'video', ext: '.webm', max: 250 * 1024 * 1024 },
  'video/quicktime': { kind: 'video', ext: '.mov', max: 250 * 1024 * 1024 },
};

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function nowIso() {
  return new Date().toISOString();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function makeCode() {
  const bytes = crypto.randomBytes(6);
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

function cleanText(value, max) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function sniff(buffer, mime) {
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (mime === 'image/gif') return buffer.subarray(0, 3).toString() === 'GIF';
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  if (mime === 'video/webm') return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  if (mime === 'video/mp4' || mime === 'video/quicktime') return buffer.subarray(4, 8).toString() === 'ftyp';
  return false;
}

function loadOrCreateSecret(dataDir) {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(dataDir, 'secret.key');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

const liveScreens = new Map();

export function createServer(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const quotaBytes = Number(options.quotaBytes || process.env.QUOTA_BYTES || 5 * 1024 * 1024 * 1024);
  const allowRegister = options.allowRegister ?? process.env.ALLOW_REGISTER !== 'false';
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD ?? '';
  const contactEmail = options.contactEmail || process.env.CONTACT_EMAIL || 'privacidad@renace.tech';
  const secret = options.secret || loadOrCreateSecret(dataDir);
  const db = openDatabase(dataDir);
  const limits = new Map();

  function tx(fn) {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* already closed */ }
      throw error;
    }
  }

  function limited(key, max, windowMs) {
    const now = Date.now();
    const slot = limits.get(key);
    if (!slot || slot.reset < now) {
      limits.set(key, { count: 1, reset: now + windowMs });
      return false;
    }
    slot.count += 1;
    return slot.count > max;
  }

  function uniqueCode() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = makeCode();
      if (!one(db.prepare('SELECT id FROM screens WHERE pairing_code = ?'), code)) return code;
    }
    fail(503, 'No se pudo crear un código. Intenta de nuevo.');
  }

  function cookie(res, req, name, value, maxAge) {
    const parts = [`${name}=${encodeURIComponent(value)}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${maxAge}`];
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || '');
    if (process.env.COOKIE_SECURE === '1' || proto.split(',')[0].trim() === 'https') parts.push('Secure');
    res.append('Set-Cookie', parts.join('; '));
  }

  function clearCookie(res, name) {
    res.append('Set-Cookie', `${name}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  }

  function userFrom(req) {
    const sid = readCookie(req, 'sid');
    if (!sid) return null;
    return one(db.prepare(`
      SELECT u.id, u.email, u.name, u.tenant_id, t.name AS tenant_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN tenants t ON t.id = u.tenant_id
      WHERE s.id = ? AND s.expires_at > ?
    `), sid, Date.now());
  }

  function requireUser(req, res, next) {
    const user = userFrom(req);
    if (!user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    req.user = user;
    next();
  }

  function requireAdmin(req, res, next) {
    if (!adminPassword) return res.status(404).json({ error: 'No encontrado.' });
    const sid = readCookie(req, 'admin_sid');
    const row = sid ? one(db.prepare('SELECT id FROM admin_sessions WHERE id = ? AND expires_at > ?'), sid, Date.now()) : null;
    if (!row) return res.status(401).json({ error: 'Entra con la clave de administración.' });
    next();
  }

  function deviceIdentity(req) {
    const id = String(req.get('x-device-id') || '');
    const deviceSecret = String(req.get('x-device-secret') || '');
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{64}$/i.test(deviceSecret)) {
      fail(400, 'La pantalla no envió una identidad válida.');
    }
    return { id, secret: deviceSecret.toLowerCase() };
  }

  function upsertDevice(req) {
    const device = deviceIdentity(req);
    const hash = sha256(device.secret);
    const existing = one(db.prepare('SELECT * FROM screens WHERE id = ?'), device.id);
    if (!existing) {
      const created = nowIso();
      let inserted = false;
      for (let attempt = 0; attempt < 8 && !inserted; attempt += 1) {
        const code = makeCode();
        try {
          db.prepare(`
            INSERT INTO screens (id, secret_hash, pairing_code, created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(device.id, hash, code, created, created);
          inserted = true;
        } catch (error) {
          if (!String(error.message).includes('pairing_code')) throw error;
        }
      }
      if (!inserted) fail(503, 'No se pudo preparar la pantalla.');
      return one(db.prepare('SELECT * FROM screens WHERE id = ?'), device.id);
    }
    if (!safeEqual(existing.secret_hash, hash)) fail(401, 'Esta pantalla no coincide con el servidor.');
    if (!existing.tenant_id && !existing.pairing_code) {
      const code = uniqueCode();
      db.prepare('UPDATE screens SET pairing_code = ? WHERE id = ?').run(code, existing.id);
      return one(db.prepare('SELECT * FROM screens WHERE id = ?'), existing.id);
    }
    return existing;
  }

  function externalBase(req) {
    const configured = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
    if (configured) return configured;
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return `${proto}://${host}`;
  }

  function signMedia(mediaId, screenId, exp) {
    return hmac(secret, `${mediaId}|${screenId}|${exp}`);
  }

  function mediaPath(media) {
    const full = path.resolve(dataDir, 'uploads', media.tenant_id, media.storage_name);
    const root = path.resolve(dataDir, 'uploads') + path.sep;
    if (!full.startsWith(root)) fail(404, 'Archivo no disponible.');
    return full;
  }

  function sendFile(req, res, filePath, mime) {
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no disponible.' });
    const size = fs.statSync(filePath).size;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const range = req.headers.range;
    if (!range) {
      res.setHeader('Content-Length', size);
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return res.status(416).end();
    let start = match[1] === '' ? 0 : Number(match[1]);
    let end = match[2] === '' ? size - 1 : Number(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
      return;
    }
    end = Math.min(end, size - 1);
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  function publicMedia(row) {
    return {
      id: row.id,
      name: row.original_name,
      mime: row.mime,
      kind: row.kind,
      bytes: row.bytes,
      createdAt: row.created_at,
      url: `/api/media/${row.id}/raw`,
    };
  }

  function playlistItems(playlistId) {
    return many(db.prepare(`
      SELECT i.id, i.media_id, i.board_id, i.duration_seconds, i.position,
             m.mime, m.kind, m.bytes, m.created_at, m.original_name,
             b.template_id, b.name AS board_name, b.content_json, b.updated_at AS board_updated
      FROM playlist_items i
      LEFT JOIN media m ON m.id = i.media_id
      LEFT JOIN boards b ON b.id = i.board_id
      WHERE i.playlist_id = ?
      ORDER BY i.position ASC, i.created_at ASC
    `), playlistId);
  }

  function playlistVersion(playlist, items, brandKey = '') {
    const body = items.map((item) => `${item.id}:${item.media_id || ''}:${item.board_id || ''}:${item.duration_seconds}:${item.bytes || 0}:${item.created_at || ''}:${item.board_updated || ''}:${item.content_json || ''}`).join('|');
    const stamp = crypto.createHash('sha256').update(`${body}|${brandKey}`).digest('hex').slice(0, 12);
    return `${playlist.updated_at}:${stamp}`;
  }

  function tenantRow(tenantId) {
    return one(db.prepare('SELECT * FROM tenants WHERE id = ?'), tenantId);
  }

  function colorOr(value, fallback) {
    return /^#[0-9A-F]{6}$/.test(String(value || '')) ? value : fallback;
  }

  function signedMedia(req, mediaId, screen, exp) {
    const sig = signMedia(mediaId, screen.id, exp);
    return `${externalBase(req)}/media/${mediaId}?exp=${exp}&screen=${screen.id}&sig=${sig}`;
  }

  function mediaUrl(req, mediaId, screen, exp) {
    if (!mediaId) return '';
    return screen ? signedMedia(req, mediaId, screen, exp) : `/api/media/${mediaId}/raw`;
  }

  function decorateItem(req, item, screen, exp) {
    return { ...item, imageUrl: mediaUrl(req, item.imageMediaId, screen, exp) };
  }

  function decorateContent(req, content, tenant, screen) {
    const next = { ...content };
    const exp = Date.now() + 12 * 60 * 60 * 1000;
    if (next.backgroundMediaId) next.backgroundUrl = mediaUrl(req, next.backgroundMediaId, screen, exp);
    if (tenant?.logo_media_id) next.logoUrl = mediaUrl(req, tenant.logo_media_id, screen, exp);
    next.items = (next.items || []).map((item) => decorateItem(req, item, screen, exp));
    next.categories = (next.categories || []).map((category) => ({
      ...category,
      items: (category.items || []).map((item) => decorateItem(req, item, screen, exp)),
    }));
    next.interludeUrls = (next.interludeMediaIds || []).map((id) => mediaUrl(req, id, screen, exp)).filter(Boolean);
    next.accent = colorOr(tenant?.color_ink, '#8FD3FF');
    next.navy = colorOr(tenant?.color_navy, '#00204E');
    next.action = colorOr(tenant?.color_accent, '#0087FF');
    next.tagline = tenant?.tagline || '';
    return next;
  }

  function publicBrand(tenant) {
    return {
      businessName: tenant.name,
      tagline: tenant.tagline || '',
      colorNavy: colorOr(tenant.color_navy, '#00204E').toLowerCase(),
      colorAccent: colorOr(tenant.color_accent, '#0087FF').toLowerCase(),
      colorInk: colorOr(tenant.color_ink, '#8FD3FF').toLowerCase(),
      logoMediaId: tenant.logo_media_id || '',
      logoUrl: tenant.logo_media_id ? `/api/media/${tenant.logo_media_id}/raw` : '',
      odooToken: tenant.odoo_token || '',
    };
  }

  function ensureOdooToken(tenant) {
    if (tenant.odoo_token) return tenant;
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('UPDATE tenants SET odoo_token = ? WHERE id = ?').run(token, tenant.id);
    return tenantRow(tenant.id);
  }

  function publish(tenantId) {
    const screens = many(db.prepare('SELECT id FROM screens WHERE tenant_id = ?'), tenantId);
    for (const screen of screens) {
      const sockets = liveScreens.get(screen.id);
      if (!sockets) continue;
      for (const socket of sockets) socket.write('data: refresh\n\n');
    }
  }

  function touchPlaylist(id) {
    db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(nowIso(), id);
    const row = one(db.prepare('SELECT tenant_id FROM playlists WHERE id = ?'), id);
    if (row) publish(row.tenant_id);
  }

  function touchBoardsPlaylists(boardId) {
    const lists = many(db.prepare('SELECT DISTINCT playlist_id FROM playlist_items WHERE board_id = ?'), boardId);
    for (const list of lists) touchPlaylist(list.playlist_id);
  }

  function publicBoard(row) {
    return {
      id: row.id,
      name: row.name,
      templateId: row.template_id,
      content: JSON.parse(row.content_json),
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    };
  }

  function ownBoard(req) {
    const row = one(db.prepare('SELECT * FROM boards WHERE id = ? AND tenant_id = ?'), req.params.id, req.user.tenant_id);
    if (!row) fail(404, 'No encontramos ese menú.');
    return row;
  }

  function boardPage(req, board, screen) {
    const tenant = tenantRow(board.tenant_id);
    const payload = JSON.stringify({
      templateId: board.template_id,
      content: decorateContent(req, JSON.parse(board.content_json), tenant, screen),
    }).replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${board.name}</title>
  <link rel="stylesheet" href="/boards.css">
  <style>html,body{margin:0;height:100%;background:#000}#stage{position:fixed;inset:0}</style>
</head>
<body>
  <div id="stage"></div>
  <script id="board-data" type="application/json">${payload}</script>
  <script src="/boards.js"></script>
</body>
</html>`;
  }

  function presentPlaylist(req, playlist, screen) {
    const items = playlistItems(playlist.id);
    const tenant = tenantRow(playlist.tenant_id);
    const brandKey = `${tenant?.logo_media_id || ''}:${tenant?.color_navy || ''}:${tenant?.color_accent || ''}:${tenant?.color_ink || ''}:${tenant?.tagline || ''}`;
    const fit = screen?.fit === 'cover' || screen?.fit === 'contain' ? screen.fit : playlist.fit;
    const exp = Date.now() + 12 * 60 * 60 * 1000;
    return {
      id: playlist.id,
      name: playlist.name,
      fit,
      sound: Boolean(playlist.sound),
      imageSeconds: playlist.image_seconds,
      version: playlistVersion(playlist, items, brandKey),
      items: items.map((item) => {
        if (item.board_id) {
          const content = JSON.parse(item.content_json || '{}');
          const payload = {
            id: item.id,
            mediaId: item.board_id,
            boardId: item.board_id,
            name: item.board_name,
            kind: 'board',
            mime: 'text/html',
            templateId: item.template_id,
            content: decorateContent(req, content, tenant, screen),
            durationSeconds: item.duration_seconds,
            bytes: 0,
            rev: item.board_updated || '',
          };
          if (screen) {
            const sig = signMedia(item.board_id, screen.id, exp);
            payload.url = `${externalBase(req)}/play/boards/${item.board_id}?exp=${exp}&screen=${screen.id}&sig=${sig}`;
          } else {
            payload.url = `/play/boards/${item.board_id}`;
          }
          return payload;
        }
        const payload = {
          id: item.id,
          mediaId: item.media_id,
          name: item.original_name,
          kind: item.kind,
          mime: item.mime,
          durationSeconds: item.duration_seconds,
          bytes: item.bytes,
          rev: `${item.bytes}-${item.created_at}`,
        };
        if (screen) {
          const sig = signMedia(item.media_id, screen.id, exp);
          payload.url = `${externalBase(req)}/media/${item.media_id}?exp=${exp}&screen=${screen.id}&sig=${sig}`;
        } else {
          payload.url = `/api/media/${item.media_id}/raw`;
        }
        return payload;
      }),
    };
  }

  function devicePayload(req, screen) {
    db.prepare('UPDATE screens SET last_seen_at = ? WHERE id = ?').run(nowIso(), screen.id);
    const paired = Boolean(screen.tenant_id);
    let playlist = null;
    if (paired && screen.playlist_id) {
      const row = one(db.prepare('SELECT * FROM playlists WHERE id = ? AND tenant_id = ?'), screen.playlist_id, screen.tenant_id);
      if (row) playlist = presentPlaylist(req, row, screen);
    }
    return {
      paired,
      pairingCode: paired ? null : screen.pairing_code,
      screenName: screen.name,
      playlist,
    };
  }

  function ownPlaylist(req) {
    const row = one(db.prepare('SELECT * FROM playlists WHERE id = ? AND tenant_id = ?'), req.params.id, req.user.tenant_id);
    if (!row) fail(404, 'No encontramos esa lista.');
    return row;
  }

  function parseFit(value, fallback) {
    if (value === undefined) return fallback;
    if (value === null || value === '') return null;
    if (value === 'cover' || value === 'contain') return value;
    fail(400, 'El ajuste debe ser llenar pantalla o ver completo.');
  }

  function parseBrandColor(value) {
    const color = String(value || '').trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(color)) fail(400, 'El color debe ser un código como #0087FF.');
    return color;
  }

  function parseSeconds(value, fallback) {
    if (value === undefined) return fallback;
    if (value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 600) {
      fail(400, 'Los segundos deben estar entre 1 y 600.');
    }
    return number;
  }

  const upload = multer({
    storage: multer.diskStorage({
      destination(req, _file, cb) {
        const dir = path.join(dataDir, 'uploads', req.user.tenant_id);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename(req, file, cb) {
        const id = crypto.randomUUID();
        const ext = MIME[file.mimetype].ext;
        req.mediaDraft = { id, ext };
        cb(null, `${id}${ext}`);
      },
    }),
    limits: { fileSize: 250 * 1024 * 1024, files: 1 },
    fileFilter(_req, file, cb) {
      if (!MIME[file.mimetype]) {
        const error = new Error('Formato no permitido. Usa JPG, PNG, WEBP, GIF, MP4 o WEBM.');
        error.status = 400;
        cb(error);
        return;
      }
      cb(null, true);
    },
  });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' https://accounts.google.com; script-src 'self' https://accounts.google.com; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    next();
  });

  function wrap(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, product: 'RENACE Pantalla' });
  });

  app.post('/api/auth/register', wrap(async (req, res) => {
    if (!allowRegister) fail(403, 'El registro está cerrado en este servidor.');
    if (limited(`register:${req.ip}`, 10, 60 * 60 * 1000)) fail(429, 'Demasiados registros desde esta red. Espera un momento.');
    const businessName = cleanText(req.body.businessName, 80);
    const ownerName = cleanText(req.body.ownerName, 80);
    const email = cleanText(req.body.email, 120).toLowerCase();
    const password = String(req.body.password || '');
    if (businessName.length < 2) fail(400, 'Escribe el nombre del negocio.');
    if (ownerName.length < 2) fail(400, 'Escribe tu nombre.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'El correo no es válido.');
    if (password.length < 8 || password.length > 200) fail(400, 'La contraseña debe tener al menos 8 caracteres.');
    if (one(db.prepare('SELECT id FROM users WHERE email = ?'), email)) {
      fail(409, 'Ese correo ya tiene un negocio. Entra con tu contraseña.');
    }
    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const sessionId = crypto.randomBytes(32).toString('hex');
    const created = nowIso();
    tx(() => {
      db.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)').run(tenantId, businessName, created);
      db.prepare(`
        INSERT INTO users (id, tenant_id, name, email, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, tenantId, ownerName, email, hashPassword(password), created);
      db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sessionId, userId, Date.now() + 30 * 24 * 60 * 60 * 1000);
    });
    cookie(res, req, 'sid', sessionId, 30 * 24 * 60 * 60);
    res.status(201).json({ businessName, name: ownerName, email });
  }));

  app.get('/api/auth/config', (_req, res) => {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
  });

  app.post('/api/auth/google', wrap(async (req, res) => {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || '');
    if (!clientId) fail(503, 'El acceso con Google todavía no está activado en este servidor.');
    const credential = String(req.body.credential || '');
    if (credential.length < 20 || credential.length > 4000) fail(400, 'Google no envió una credencial válida.');
    const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    const profile = await info.json().catch(() => ({}));
    if (!info.ok || profile.aud !== clientId) fail(401, 'Google no confirmó esta cuenta.');
    if (String(profile.email_verified) !== 'true') fail(401, 'Ese correo de Google no está verificado.');
    const email = cleanText(profile.email, 120).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Google no entregó un correo válido.');
    let user = one(db.prepare('SELECT * FROM users WHERE email = ?'), email);
    if (!user) {
      if (!allowRegister) fail(403, 'El registro está cerrado en este servidor.');
      const businessName = cleanText(profile.name, 80) || email.split('@')[0];
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const created = nowIso();
      db.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)').run(tenantId, businessName, created);
      db.prepare(`
        INSERT INTO users (id, tenant_id, name, email, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, tenantId, businessName, email, hashPassword(crypto.randomBytes(24).toString('hex')), created);
      user = one(db.prepare('SELECT * FROM users WHERE id = ?'), userId);
    }
    const sessionId = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sessionId, user.id, Date.now() + 30 * 24 * 60 * 60 * 1000);
    cookie(res, req, 'sid', sessionId, 30 * 24 * 60 * 60);
    res.json({ ok: true });
  }));

  app.post('/api/auth/login', wrap(async (req, res) => {
    if (limited(`login:${req.ip}`, 20, 15 * 60 * 1000)) fail(429, 'Demasiados intentos. Espera unos minutos.');
    const email = cleanText(req.body.email, 120).toLowerCase();
    const password = String(req.body.password || '');
    const user = one(db.prepare('SELECT * FROM users WHERE email = ?'), email);
    if (!user || !verifyPassword(password, user.password_hash)) fail(401, 'Correo o contraseña incorrectos.');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    const sessionId = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sessionId, user.id, Date.now() + 30 * 24 * 60 * 60 * 1000);
    cookie(res, req, 'sid', sessionId, 30 * 24 * 60 * 60);
    res.json({ ok: true });
  }));

  app.post('/api/auth/logout', (req, res) => {
    const sid = readCookie(req, 'sid');
    if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
    clearCookie(res, 'sid');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireUser, (req, res) => {
    res.json({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      businessName: req.user.tenant_name,
    });
  });

  app.get('/api/brand', requireUser, (req, res) => {
    res.json(publicBrand(ensureOdooToken(tenantRow(req.user.tenant_id))));
  });

  app.patch('/api/brand', requireUser, wrap(async (req, res) => {
    const tenant = tenantRow(req.user.tenant_id);
    const tagline = req.body.tagline === undefined ? (tenant.tagline || '') : cleanText(req.body.tagline, 90);
    const colorNavy = req.body.colorNavy === undefined ? colorOr(tenant.color_navy, '#00204E') : parseBrandColor(req.body.colorNavy);
    const colorAccent = req.body.colorAccent === undefined ? colorOr(tenant.color_accent, '#0087FF') : parseBrandColor(req.body.colorAccent);
    const colorInk = req.body.colorInk === undefined ? colorOr(tenant.color_ink, '#8FD3FF') : parseBrandColor(req.body.colorInk);
    let logoId = tenant.logo_media_id || null;
    if (req.body.logoMediaId !== undefined) {
      const requested = String(req.body.logoMediaId || '');
      if (!requested) logoId = null;
      else {
        const media = one(db.prepare('SELECT id FROM media WHERE id = ? AND tenant_id = ? AND kind = ?'), requested, tenant.id, 'image');
        if (!media) fail(400, 'El logo tiene que ser una imagen de este negocio.');
        logoId = media.id;
      }
    }
    db.prepare(`
      UPDATE tenants
      SET tagline = ?, color_navy = ?, color_accent = ?, color_ink = ?, logo_media_id = ?
      WHERE id = ?
    `).run(tagline, colorNavy, colorAccent, colorInk, logoId, tenant.id);
    const lists = many(db.prepare('SELECT id FROM playlists WHERE tenant_id = ?'), tenant.id);
    for (const list of lists) touchPlaylist(list.id);
    res.json(publicBrand(ensureOdooToken(tenantRow(tenant.id))));
  }));

  async function storeRemoteImage(tenantId, imageUrl) {
    const url = safeImageUrl(imageUrl);
    if (!url) return '';
    let response;
    try {
      response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    } catch {
      return '';
    }
    if (!response.ok) return '';
    const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const spec = MIME[type];
    if (!spec || spec.kind !== 'image') return '';
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > spec.max || !sniff(bytes.subarray(0, 16), type)) return '';
    const id = crypto.randomUUID();
    const filename = `${id}${spec.ext}`;
    const dir = path.join(dataDir, 'uploads', tenantId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), bytes);
    db.prepare(`
      INSERT INTO media (id, tenant_id, original_name, mime, kind, bytes, storage_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tenantId, 'odoo', type, spec.kind, bytes.length, filename, nowIso());
    return id;
  }

  function placeCarta(tenantId, boardId) {
    let playlist = one(db.prepare(`SELECT * FROM playlists WHERE tenant_id = ? AND name = ?`), tenantId, 'Carta');
    const created = nowIso();
    if (!playlist) {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO playlists (id, tenant_id, name, fit, image_seconds, sound, updated_at, created_at)
        VALUES (?, ?, 'Carta', 'cover', 12, 0, ?, ?)
      `).run(id, tenantId, created, created);
      playlist = one(db.prepare('SELECT * FROM playlists WHERE id = ?'), id);
    }
    const present = one(db.prepare('SELECT id FROM playlist_items WHERE playlist_id = ? AND board_id = ?'), playlist.id, boardId);
    if (!present) {
      const position = one(db.prepare('SELECT COALESCE(MAX(position), 0) AS pos FROM playlist_items WHERE playlist_id = ?'), playlist.id);
      db.prepare(`
        INSERT INTO playlist_items (id, playlist_id, board_id, position, duration_seconds, created_at)
        VALUES (?, ?, ?, ?, 45, ?)
      `).run(crypto.randomUUID(), playlist.id, boardId, Number(position.pos) + 1, created);
    }
    db.prepare('UPDATE screens SET playlist_id = ? WHERE tenant_id = ? AND playlist_id IS NULL').run(playlist.id, tenantId);
    touchPlaylist(playlist.id);
  }

  app.post('/api/odoo/menu', wrap(async (req, res) => {
    if (limited(`odoo:${req.ip}`, 30, 10 * 60 * 1000)) fail(429, 'Demasiadas publicaciones. Espera un momento.');
    const header = String(req.get('authorization') || '');
    const token = (header.toLowerCase().startsWith('bearer ') ? header.slice(7) : String(req.get('x-odoo-token') || '')).trim();
    if (!/^[a-f0-9]{48}$/.test(token)) fail(401, 'Falta la clave de Odoo.');
    const tenant = one(db.prepare('SELECT * FROM tenants WHERE odoo_token = ?'), token);
    if (!tenant) fail(401, 'La clave de Odoo no coincide.');
    const draft = menuFromOdoo(req.body);
    if (!draft) fail(400, 'La carta necesita categorías con productos.');
    for (const category of draft.categories) {
      for (const item of category.items) {
        item.imageMediaId = item.imageUrl ? await storeRemoteImage(tenant.id, item.imageUrl) : '';
        delete item.imageUrl;
      }
    }
    const content = sanitizeContent('carta', draft);
    const name = cleanText(draft.headline, 80) || 'Carta';
    const existing = one(db.prepare(`SELECT * FROM boards WHERE tenant_id = ? AND template_id = 'carta' ORDER BY updated_at DESC`), tenant.id);
    const updated = nowIso();
    let boardId = existing?.id;
    if (existing) {
      db.prepare('UPDATE boards SET name = ?, content_json = ?, updated_at = ? WHERE id = ?')
        .run(name, JSON.stringify(content), updated, existing.id);
      touchBoardsPlaylists(existing.id);
    } else {
      boardId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO boards (id, tenant_id, template_id, name, content_json, updated_at, created_at)
        VALUES (?, ?, 'carta', ?, ?, ?, ?)
      `).run(boardId, tenant.id, name, JSON.stringify(content), updated, updated);
    }
    placeCarta(tenant.id, boardId);
    const board = one(db.prepare('SELECT * FROM boards WHERE id = ?'), boardId);
    res.json({ ok: true, board: publicBoard(board), playlist: 'Carta' });
  }));

  app.get('/api/media', requireUser, (req, res) => {
    const rows = many(db.prepare('SELECT * FROM media WHERE tenant_id = ? ORDER BY created_at DESC'), req.user.tenant_id);
    res.json(rows.map(publicMedia));
  });

  app.post('/api/media', requireUser, (req, res, next) => {
    upload.single('file')(req, res, (error) => {
      if (error) return next(error);
      next();
    });
  }, wrap(async (req, res) => {
    if (!req.file || !req.mediaDraft) fail(400, 'Elige un archivo.');
    const spec = MIME[req.file.mimetype];
    const header = Buffer.alloc(16);
    const fd = fs.openSync(req.file.path, 'r');
    try { fs.readSync(fd, header, 0, 16, 0); } finally { fs.closeSync(fd); }
    if (!sniff(header, req.file.mimetype) || req.file.size > spec.max) {
      fs.rmSync(req.file.path, { force: true });
      fail(400, 'El archivo no es un JPG, GIF o video válido, o pasa el tamaño permitido.');
    }
    const used = one(db.prepare('SELECT COALESCE(SUM(bytes), 0) AS total FROM media WHERE tenant_id = ?'), req.user.tenant_id);
    if (Number(used.total) + req.file.size > quotaBytes) {
      fs.rmSync(req.file.path, { force: true });
      fail(413, 'Este negocio llegó al límite de espacio. Borra archivos que ya no uses.');
    }
    const created = nowIso();
    const original = cleanText(path.basename(req.file.originalname || 'archivo'), 120) || 'archivo';
    let mime = req.file.mimetype;
    let bytes = req.file.size;
    let storageName = req.file.filename;
    if (spec.kind === 'video') {
      try {
        const compressed = await compressVideo(req.file.path);
        mime = compressed.mime;
        bytes = compressed.bytes;
        storageName = compressed.storageName;
      } catch (error) {
        console.error('No se pudo comprimir el video. Se guarda el original.', error.message);
      }
    }
    db.prepare(`
      INSERT INTO media (id, tenant_id, original_name, mime, kind, bytes, storage_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.mediaDraft.id, req.user.tenant_id, original, mime, spec.kind, bytes, storageName, created);
    const row = one(db.prepare('SELECT * FROM media WHERE id = ?'), req.mediaDraft.id);
    res.status(201).json(publicMedia(row));
  }));

  app.get('/api/media/:id/raw', requireUser, wrap(async (req, res) => {
    const media = one(db.prepare('SELECT * FROM media WHERE id = ? AND tenant_id = ?'), req.params.id, req.user.tenant_id);
    if (!media) fail(404, 'No encontramos ese archivo.');
    sendFile(req, res, mediaPath(media), media.mime);
  }));

  app.delete('/api/media/:id', requireUser, wrap(async (req, res) => {
    const media = one(db.prepare('SELECT * FROM media WHERE id = ? AND tenant_id = ?'), req.params.id, req.user.tenant_id);
    if (!media) fail(404, 'No encontramos ese archivo.');
    const lists = many(db.prepare('SELECT DISTINCT playlist_id FROM playlist_items WHERE media_id = ?'), media.id);
    tx(() => {
      db.prepare('DELETE FROM media WHERE id = ?').run(media.id);
      for (const list of lists) touchPlaylist(list.playlist_id);
    });
    fs.rmSync(mediaPath(media), { force: true });
    res.json({ ok: true });
  }));

  app.get('/api/templates', requireUser, (_req, res) => {
    res.json(publicTemplates());
  });

  app.get('/api/boards', requireUser, (req, res) => {
    const rows = many(db.prepare('SELECT * FROM boards WHERE tenant_id = ? ORDER BY updated_at DESC'), req.user.tenant_id);
    res.json(rows.map(publicBoard));
  });

  app.post('/api/boards', requireUser, wrap(async (req, res) => {
    const template = templateById(req.body.templateId);
    if (!template) fail(400, 'Elige una plantilla.');
    const name = cleanText(req.body.name, 80) || template.name;
    const content = sanitizeContent(template.id, req.body.content || template.defaults);
    const id = crypto.randomUUID();
    const created = nowIso();
    db.prepare(`
      INSERT INTO boards (id, tenant_id, template_id, name, content_json, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.tenant_id, template.id, name, JSON.stringify(content), created, created);
    res.status(201).json(publicBoard(one(db.prepare('SELECT * FROM boards WHERE id = ?'), id)));
  }));

  app.patch('/api/boards/:id', requireUser, wrap(async (req, res) => {
    const board = ownBoard(req);
    const name = req.body.name === undefined ? board.name : cleanText(req.body.name, 80);
    if (name.length < 2) fail(400, 'Ponle un nombre al menú.');
    const content = req.body.content === undefined
      ? JSON.parse(board.content_json)
      : sanitizeContent(board.template_id, req.body.content);
    const updated = nowIso();
    tx(() => {
      db.prepare('UPDATE boards SET name = ?, content_json = ?, updated_at = ? WHERE id = ?')
        .run(name, JSON.stringify(content), updated, board.id);
      touchBoardsPlaylists(board.id);
    });
    res.json(publicBoard(one(db.prepare('SELECT * FROM boards WHERE id = ?'), board.id)));
  }));

  app.delete('/api/boards/:id', requireUser, wrap(async (req, res) => {
    const board = ownBoard(req);
    const lists = many(db.prepare('SELECT DISTINCT playlist_id FROM playlist_items WHERE board_id = ?'), board.id);
    tx(() => {
      db.prepare('DELETE FROM boards WHERE id = ?').run(board.id);
      for (const list of lists) touchPlaylist(list.playlist_id);
    });
    res.json({ ok: true });
  }));

  app.get('/api/playlists', requireUser, (req, res) => {
    const lists = many(db.prepare('SELECT * FROM playlists WHERE tenant_id = ? ORDER BY created_at DESC'), req.user.tenant_id);
    res.json(lists.map((playlist) => ({
      ...presentPlaylist(req, playlist, null),
      createdAt: playlist.created_at,
    })));
  });

  app.post('/api/playlists', requireUser, wrap(async (req, res) => {
    const name = cleanText(req.body.name, 80);
    if (name.length < 2) fail(400, 'Ponle un nombre a la lista.');
    const id = crypto.randomUUID();
    const created = nowIso();
    const fit = parseFit(req.body.fit ?? 'cover', 'cover') || 'cover';
    const imageSeconds = parseSeconds(req.body.imageSeconds ?? 10, 10) || 10;
    const sound = req.body.sound ? 1 : 0;
    db.prepare(`
      INSERT INTO playlists (id, tenant_id, name, fit, image_seconds, sound, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.tenant_id, name, fit, imageSeconds, sound, created, created);
    const playlist = one(db.prepare('SELECT * FROM playlists WHERE id = ?'), id);
    res.status(201).json(presentPlaylist(req, playlist, null));
  }));

  app.patch('/api/playlists/:id', requireUser, wrap(async (req, res) => {
    const playlist = ownPlaylist(req);
    const name = req.body.name === undefined ? playlist.name : cleanText(req.body.name, 80);
    if (name.length < 2) fail(400, 'Ponle un nombre a la lista.');
    const fit = parseFit(req.body.fit, playlist.fit) || playlist.fit;
    const imageSeconds = parseSeconds(req.body.imageSeconds, playlist.image_seconds) || playlist.image_seconds;
    const sound = req.body.sound === undefined ? playlist.sound : (req.body.sound ? 1 : 0);
    db.prepare(`
      UPDATE playlists SET name = ?, fit = ?, image_seconds = ?, sound = ?, updated_at = ? WHERE id = ?
    `).run(name, fit, imageSeconds, sound, nowIso(), playlist.id);
    res.json(presentPlaylist(req, one(db.prepare('SELECT * FROM playlists WHERE id = ?'), playlist.id), null));
  }));

  app.delete('/api/playlists/:id', requireUser, wrap(async (req, res) => {
    const playlist = ownPlaylist(req);
    db.prepare('DELETE FROM playlists WHERE id = ?').run(playlist.id);
    res.json({ ok: true });
  }));

  app.post('/api/playlists/:id/items', requireUser, wrap(async (req, res) => {
    const playlist = ownPlaylist(req);
    let mediaId = null;
    let boardId = null;
    let duration = parseSeconds(req.body.durationSeconds, null);
    if (req.body.boardId) {
      const board = one(db.prepare('SELECT id FROM boards WHERE id = ? AND tenant_id = ?'), req.body.boardId, req.user.tenant_id);
      if (!board) fail(400, 'Ese menú no es de este negocio.');
      boardId = board.id;
      if (duration == null) duration = 45;
    } else {
      const media = one(db.prepare('SELECT * FROM media WHERE id = ? AND tenant_id = ?'), req.body.mediaId, req.user.tenant_id);
      if (!media) fail(400, 'Ese archivo no es de este negocio.');
      mediaId = media.id;
    }
    const max = one(db.prepare('SELECT COALESCE(MAX(position), -1) AS max FROM playlist_items WHERE playlist_id = ?'), playlist.id);
    const id = crypto.randomUUID();
    tx(() => {
      db.prepare(`
        INSERT INTO playlist_items (id, playlist_id, media_id, board_id, position, duration_seconds, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, playlist.id, mediaId, boardId, Number(max.max) + 1, duration, nowIso());
      touchPlaylist(playlist.id);
    });
    res.status(201).json(presentPlaylist(req, one(db.prepare('SELECT * FROM playlists WHERE id = ?'), playlist.id), null));
  }));

  app.patch('/api/playlists/:id/items/:itemId', requireUser, wrap(async (req, res) => {
    const playlist = ownPlaylist(req);
    const item = one(db.prepare('SELECT * FROM playlist_items WHERE id = ? AND playlist_id = ?'), req.params.itemId, playlist.id);
    if (!item) fail(404, 'Ese archivo no está en la lista.');
    const duration = parseSeconds(req.body.durationSeconds, item.duration_seconds);
    tx(() => {
      db.prepare('UPDATE playlist_items SET duration_seconds = ? WHERE id = ?').run(duration, item.id);
      touchPlaylist(playlist.id);
    });
    res.json(presentPlaylist(req, one(db.prepare('SELECT * FROM playlists WHERE id = ?'), playlist.id), null));
  }));

  app.delete('/api/playlists/:id/items/:itemId', requireUser, wrap(async (req, res) => {
    const playlist = ownPlaylist(req);
    tx(() => {
      const result = db.prepare('DELETE FROM playlist_items WHERE id = ? AND playlist_id = ?').run(req.params.itemId, playlist.id);
      if (!result.changes) fail(404, 'Ese archivo no está en la lista.');
      touchPlaylist(playlist.id);
    });
    res.json(presentPlaylist(req, one(db.prepare('SELECT * FROM playlists WHERE id = ?'), playlist.id), null));
  }));

  app.post('/api/playlists/:id/items/:itemId/move', requireUser, wrap(async (req, res) => {
    const playlist = ownPlaylist(req);
    const items = playlistItems(playlist.id);
    const index = items.findIndex((item) => item.id === req.params.itemId);
    if (index < 0) fail(404, 'Ese archivo no está en la lista.');
    const direction = req.body.direction === 'up' ? -1 : 1;
    const target = index + direction;
    if (target >= 0 && target < items.length) {
      const next = items.slice();
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      tx(() => {
        next.forEach((item, position) => {
          db.prepare('UPDATE playlist_items SET position = ? WHERE id = ?').run(position, item.id);
        });
        touchPlaylist(playlist.id);
      });
    }
    res.json(presentPlaylist(req, one(db.prepare('SELECT * FROM playlists WHERE id = ?'), playlist.id), null));
  }));

  app.get('/api/screens', requireUser, (req, res) => {
    const rows = many(db.prepare('SELECT * FROM screens WHERE tenant_id = ? ORDER BY paired_at DESC'), req.user.tenant_id);
    res.json(rows.map((screen) => ({
      id: screen.id,
      name: screen.name,
      playlistId: screen.playlist_id,
      fit: screen.fit,
      lastSeenAt: screen.last_seen_at,
      pairedAt: screen.paired_at,
      online: screen.last_seen_at ? Date.now() - Date.parse(screen.last_seen_at) < 45000 : false,
    })));
  });

  app.post('/api/screens/pair', requireUser, wrap(async (req, res) => {
    if (limited(`pair:${req.user.id}`, 30, 15 * 60 * 1000)) fail(429, 'Demasiados intentos de vinculación.');
    const code = cleanText(req.body.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z0-9]{6}$/.test(code)) fail(400, 'El código tiene 6 caracteres.');
    const name = cleanText(req.body.name, 60) || 'Pantalla';
    const result = db.prepare(`
      UPDATE screens
      SET tenant_id = ?, name = ?, paired_at = ?, pairing_code = NULL, playlist_id = NULL, fit = NULL
      WHERE pairing_code = ? AND tenant_id IS NULL
    `).run(req.user.tenant_id, name, nowIso(), code);
    if (!result.changes) fail(404, 'Ese código no está disponible. Revisa la TV.');
    res.status(201).json({ ok: true });
  }));

  app.patch('/api/screens/:id', requireUser, wrap(async (req, res) => {
    const screen = one(db.prepare('SELECT * FROM screens WHERE id = ? AND tenant_id = ?'), req.params.id, req.user.tenant_id);
    if (!screen) fail(404, 'No encontramos esa pantalla.');
    const name = req.body.name === undefined ? screen.name : (cleanText(req.body.name, 60) || 'Pantalla');
    let playlistId = screen.playlist_id;
    if (req.body.playlistId !== undefined) {
      if (!req.body.playlistId) playlistId = null;
      else {
        const playlist = one(db.prepare('SELECT id FROM playlists WHERE id = ? AND tenant_id = ?'), req.body.playlistId, req.user.tenant_id);
        if (!playlist) fail(400, 'Esa lista no es de este negocio.');
        playlistId = playlist.id;
      }
    }
    let fit = screen.fit;
    if (req.body.fit !== undefined) fit = parseFit(req.body.fit, screen.fit);
    db.prepare('UPDATE screens SET name = ?, playlist_id = ?, fit = ? WHERE id = ?').run(name, playlistId, fit, screen.id);
    res.json({ ok: true });
  }));

  app.post('/api/screens/:id/unpair', requireUser, wrap(async (req, res) => {
    const screen = one(db.prepare('SELECT * FROM screens WHERE id = ? AND tenant_id = ?'), req.params.id, req.user.tenant_id);
    if (!screen) fail(404, 'No encontramos esa pantalla.');
    const code = uniqueCode();
    db.prepare(`
      UPDATE screens
      SET tenant_id = NULL, name = NULL, playlist_id = NULL, fit = NULL, paired_at = NULL, pairing_code = ?
      WHERE id = ?
    `).run(code, screen.id);
    res.json({ ok: true });
  }));

  app.delete('/api/screens/:id', requireUser, wrap(async (req, res) => {
    const result = db.prepare('DELETE FROM screens WHERE id = ? AND tenant_id = ?').run(req.params.id, req.user.tenant_id);
    if (!result.changes) fail(404, 'No encontramos esa pantalla.');
    res.json({ ok: true });
  }));

  app.get('/api/preview/:id', requireUser, wrap(async (req, res) => {
    const playlist = ownPlaylist(req);
    res.json({
      paired: true,
      pairingCode: null,
      screenName: 'Vista previa',
      playlist: presentPlaylist(req, playlist, null),
    });
  }));

  app.post('/api/device/sync', wrap(async (req, res) => {
    const screen = upsertDevice(req);
    res.json(devicePayload(req, one(db.prepare('SELECT * FROM screens WHERE id = ?'), screen.id)));
  }));

  app.post('/api/device/code', wrap(async (req, res) => {
    const screen = upsertDevice(req);
    if (screen.tenant_id) fail(409, 'Esta pantalla ya está vinculada.');
    const code = uniqueCode();
    db.prepare('UPDATE screens SET pairing_code = ? WHERE id = ?').run(code, screen.id);
    res.json(devicePayload(req, one(db.prepare('SELECT * FROM screens WHERE id = ?'), screen.id)));
  }));

  app.get('/play/boards/:id', wrap(async (req, res) => {
    const exp = Number(req.query.exp);
    const screenId = String(req.query.screen || '');
    const sig = String(req.query.sig || '');
    const sessionUser = userFrom(req);
    const board = one(db.prepare('SELECT * FROM boards WHERE id = ?'), req.params.id);
    if (!board) fail(404, 'Menú no disponible.');
    if (sessionUser && sessionUser.tenant_id === board.tenant_id) {
      res.type('html').send(boardPage(req, board, null));
      return;
    }
    if (!Number.isFinite(exp) || exp < Date.now() - 60_000 || exp > Date.now() + 24 * 60 * 60 * 1000) {
      fail(403, 'El enlace del menú venció.');
    }
    if (!safeEqual(sig, signMedia(board.id, screenId, exp))) fail(403, 'El enlace del menú no es válido.');
    const screen = one(db.prepare('SELECT * FROM screens WHERE id = ?'), screenId);
    if (!screen?.tenant_id || screen.tenant_id !== board.tenant_id) fail(404, 'Menú no disponible.');
    res.type('html').send(boardPage(req, board, screen));
  }));

  app.get('/api/device/events', wrap(async (req, res) => {
    const screen = upsertDevice(req);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('data: ready\n\n');
    let sockets = liveScreens.get(screen.id);
    if (!sockets) {
      sockets = new Set();
      liveScreens.set(screen.id, sockets);
    }
    sockets.add(res);
    const beat = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(beat);
      sockets.delete(res);
      if (!sockets.size) liveScreens.delete(screen.id);
    });
  }));

  app.get('/media/:id', wrap(async (req, res) => {
    const exp = Number(req.query.exp);
    const screenId = String(req.query.screen || '');
    const sig = String(req.query.sig || '');
    if (!Number.isFinite(exp) || exp < Date.now() - 60_000 || exp > Date.now() + 24 * 60 * 60 * 1000) {
      fail(403, 'El enlace del archivo venció.');
    }
    if (!safeEqual(sig, signMedia(req.params.id, screenId, exp))) fail(403, 'El enlace del archivo no es válido.');
    const screen = one(db.prepare('SELECT * FROM screens WHERE id = ?'), screenId);
    const media = one(db.prepare('SELECT * FROM media WHERE id = ?'), req.params.id);
    if (!screen?.tenant_id || !media || media.tenant_id !== screen.tenant_id) fail(404, 'Archivo no disponible.');
    sendFile(req, res, mediaPath(media), media.mime);
  }));

  app.post('/api/admin/login', wrap(async (req, res) => {
    if (!adminPassword) fail(404, 'No encontrado.');
    if (limited(`admin:${req.ip}`, 10, 15 * 60 * 1000)) fail(429, 'Demasiados intentos.');
    const input = String(req.body.password || '');
    const a = crypto.createHash('sha256').update(input).digest();
    const b = crypto.createHash('sha256').update(adminPassword).digest();
    if (!crypto.timingSafeEqual(a, b)) fail(401, 'Clave incorrecta.');
    const sid = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO admin_sessions (id, expires_at) VALUES (?, ?)').run(sid, Date.now() + 12 * 60 * 60 * 1000);
    cookie(res, req, 'admin_sid', sid, 12 * 60 * 60);
    res.json({ ok: true });
  }));

  app.post('/api/admin/logout', (req, res) => {
    const sid = readCookie(req, 'admin_sid');
    if (sid) db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(sid);
    clearCookie(res, 'admin_sid');
    res.json({ ok: true });
  });

  app.get('/api/admin/tenants', requireAdmin, (_req, res) => {
    const rows = many(db.prepare(`
      SELECT t.id, t.name, t.created_at,
        (SELECT u.email FROM users u WHERE u.tenant_id = t.id ORDER BY u.created_at ASC LIMIT 1) AS owner_email,
        (SELECT u.name FROM users u WHERE u.tenant_id = t.id ORDER BY u.created_at ASC LIMIT 1) AS owner_name,
        (SELECT COUNT(*) FROM screens s WHERE s.tenant_id = t.id) AS screens,
        (SELECT COUNT(*) FROM media m WHERE m.tenant_id = t.id) AS files,
        (SELECT MAX(s.last_seen_at) FROM screens s WHERE s.tenant_id = t.id) AS last_seen
      FROM tenants t
      ORDER BY t.created_at DESC
    `));
    res.json(rows);
  });

  app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  app.get('/panel', (_req, res) => res.sendFile(path.join(publicDir, 'panel.html')));
  app.get('/tv', (_req, res) => res.sendFile(path.join(publicDir, 'tv.html')));
  app.get('/privacidad', (_req, res) => res.sendFile(path.join(publicDir, 'privacidad.html')));
  app.get('/admin', (_req, res) => {
    if (!adminPassword) return res.status(404).send('No encontrado.');
    res.sendFile(path.join(publicDir, 'admin.html'));
  });
  app.use(express.static(publicDir, { index: false, maxAge: '1h' }));

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El archivo pasa de 250 MB.' });
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'La solicitud no es válida.' });
    }
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'No se pudo completar la acción.' : error.message });
  });

  return {
    app,
    db,
    dataDir,
    contactEmail,
    close() { db.close(); },
  };
}
