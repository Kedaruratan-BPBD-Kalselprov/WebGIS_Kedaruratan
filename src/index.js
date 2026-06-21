/**
 * index.js  —  Entry point Cloudflare Workers
 * Framework: Hono (pengganti Express yang native di Workers)
 * 
 * Semua route /api/* ditangani di sini.
 * File statis (index.html, admin.html) dilayani oleh [assets] wrangler.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAccessToken } from './google-auth.js';
import {
  DriveClient,
  getLayersFolder,
  readMetadata, saveMetadata,
  readSymbology, saveSymbology,
  readSheetConfig, saveSheetConfig
} from './drive.js';

const app = new Hono();

// ── CORS ──────────────────────────────────────────────────────────
app.use('*', cors({ origin: '*', credentials: true }));

// ── Helper: buat Drive client ─────────────────────────────────────
async function drive(env) {
  const token = await getAccessToken(env);
  return new DriveClient(token);
}

// ── Manajemen Session (cookie sederhana, base64 JSON) ─────────────

function readSession(c) {
  const raw = c.req.header('cookie') ?? '';
  const match = raw.match(/webgis_sess=([^;]+)/);
  if (!match) return null;
  try { return JSON.parse(atob(decodeURIComponent(match[1]))); }
  catch { return null; }
}

function writeSession(c, data) {
  const val = encodeURIComponent(btoa(JSON.stringify(data)));
  c.header(
    'Set-Cookie',
    `webgis_sess=${val}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
  );
}

function clearSession(c) {
  c.header('Set-Cookie', 'webgis_sess=; HttpOnly; Path=/; Max-Age=0');
}

// ── Middleware: cek session admin ─────────────────────────────────
const requireAdmin = async (c, next) => {
  const sess = readSession(c);
  if (!sess?.admin) return c.json({ error: 'Unauthorized' }, 401);
  return next();
};

// =================================================================
// PUBLIC ROUTES
// =================================================================

/** GET /api/layers — daftar layer + symbology + urutan */
app.get('/api/layers', async (c) => {
  try {
    const d = await drive(c.env);
    const root = c.env.GOOGLE_ROOT_FOLDER_ID;
    const [layers, symbology] = await Promise.all([
      readMetadata(d, root),
      readSymbology(d, root)
    ]);
    return c.json({ layers, symbology, order: layers.map(l => l.id) });
  } catch (e) {
    console.error('[GET /api/layers]', e);
    return c.json({ error: e.message }, 500);
  }
});

/** GET /api/layer/:fileId — GeoJSON satu layer */
app.get('/api/layer/:fileId', async (c) => {
  try {
    const d = await drive(c.env);
    const content = await d.readText(c.req.param('fileId'));
    if (!content) return c.json({ error: 'Layer tidak ditemukan' }, 404);
    return new Response(content, {
      headers: { 'Content-Type': 'application/geo+json' }
    });
  } catch (e) {
    console.error('[GET /api/layer]', e);
    return c.json({ error: e.message }, 500);
  }
});

/** GET /api/disaster — titik bencana dari Google Sheets */
app.get('/api/disaster', async (c) => {
  try {
    const d = await drive(c.env);
    const root = c.env.GOOGLE_ROOT_FOLDER_ID;
    const cfg = await readSheetConfig(d, root);
    if (!cfg?.spreadsheetId) return c.json({ type: 'FeatureCollection', features: [] });

    const token = await getAccessToken(c.env);
    const sheet = cfg.sheetName ?? 'Sheet1';
    const range = encodeURIComponent(`${sheet}!A1:Z2000`);

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cfg.spreadsheetId}/values/${range}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();

    if (!data.values || data.values.length < 2) {
      return c.json({ type: 'FeatureCollection', features: [] });
    }

    const headers = data.values[0];
    const rows    = data.values.slice(1);

    // Cari kolom lat/lng/jenis secara otomatis jika tidak dikonfigurasi
    const latIdx  = cfg.latColumn  ?? headers.findIndex(h => /^lat/i.test(h));
    const lngIdx  = cfg.lngColumn  ?? headers.findIndex(h => /^lon|^lng/i.test(h));
    const typeIdx = cfg.typeColumn ?? headers.findIndex(h => /jenis|type|tipe/i.test(h));

    const features = rows
      .filter(row => row[latIdx] && row[lngIdx])
      .map(row => {
        const props = {};
        headers.forEach((h, i) => { props[h] = row[i] ?? ''; });
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [parseFloat(row[lngIdx]), parseFloat(row[latIdx])]
          },
          properties: props
        };
      });

    return c.json({ type: 'FeatureCollection', features });
  } catch (e) {
    console.error('[GET /api/disaster]', e);
    return c.json({ error: e.message }, 500);
  }
});

// =================================================================
// ADMIN ROUTES
// =================================================================

/** POST /api/admin/login */
app.post('/api/admin/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (body.password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'Password salah' }, 401);
  }
  const res = c.json({ success: true });
  writeSession(c, { admin: true });
  return res;
});

/** POST /api/admin/logout */
app.post('/api/admin/logout', async (c) => {
  const res = c.json({ success: true });
  clearSession(c);
  return res;
});

/** GET /api/admin/layers */
app.get('/api/admin/layers', requireAdmin, async (c) => {
  try {
    const d = await drive(c.env);
    const root = c.env.GOOGLE_ROOT_FOLDER_ID;
    const [layers, symbology] = await Promise.all([
      readMetadata(d, root),
      readSymbology(d, root)
    ]);
    return c.json({ layers, symbology, order: layers.map(l => l.id) });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

/** POST /api/admin/layer/upload — upload file GeoJSON */
app.post('/api/admin/layer/upload', requireAdmin, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!file) return c.json({ error: 'Tidak ada file yang diupload' }, 400);

    const name = (formData.get('name') || file.name || 'layer').replace(/\.geojson$/i, '');
    const content = await file.text();

    // Validasi GeoJSON
    let geojson;
    try { geojson = JSON.parse(content); }
    catch { return c.json({ error: 'File bukan GeoJSON valid' }, 400); }

    if (!geojson.type) {
      return c.json({ error: 'File GeoJSON tidak memiliki properti "type"' }, 400);
    }

    const d = await drive(c.env);
    const root = c.env.GOOGLE_ROOT_FOLDER_ID;
    const folderId = await getLayersFolder(d, root);

    // Upload ke Drive
    const uploaded = await d.uploadGeojson(`${name}.geojson`, folderId, content);
    if (!uploaded.id) throw new Error(`Upload Drive gagal: ${JSON.stringify(uploaded)}`);

    // Simpan metadata
    const metadata = await readMetadata(d, root);
    const newLayer = {
      id: uploaded.id,
      name,
      fileName: `${name}.geojson`,
      uploadedAt: new Date().toISOString(),
      visible: true,
      featureCount: geojson.features?.length ?? 0
    };
    metadata.push(newLayer);
    await saveMetadata(d, root, metadata);

    return c.json({ success: true, layer: newLayer });
  } catch (e) {
    console.error('[POST /api/admin/layer/upload]', e);
    return c.json({ error: e.message }, 500);
  }
});

/** DELETE /api/admin/layer/:fileId — hapus layer */
app.delete('/api/admin/layer/:fileId', requireAdmin, async (c) => {
  try {
    const fileId = c.req.param('fileId');
    const d = await drive(c.env);
    const root = c.env.GOOGLE_ROOT_FOLDER_ID;

    await d.deleteFile(fileId);

    // Update metadata
    const meta = await readMetadata(d, root);
    await saveMetadata(d, root, meta.filter(l => l.id !== fileId));

    // Hapus symbology terkait
    const sym = await readSymbology(d, root);
    delete sym[fileId];
    await saveSymbology(d, root, sym);

    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

/** POST /api/admin/layer-order — simpan urutan layer */
app.post('/api/admin/layer-order', requireAdmin, async (c) => {
  try {
    const { order } = await c.req.json();
    const d = await drive(c.env);
    const root = c.env.GOOGLE_ROOT_FOLDER_ID;

    const meta = await readMetadata(d, root);
    const reordered = order
      .map(id => meta.find(l => l.id === id))
      .filter(Boolean);

    await saveMetadata(d, root, reordered);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

/** GET /api/admin/symbology */
app.get('/api/admin/symbology', requireAdmin, async (c) => {
  try {
    const d = await drive(c.env);
    return c.json(await readSymbology(d, c.env.GOOGLE_ROOT_FOLDER_ID));
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

/** POST /api/admin/symbology */
app.post('/api/admin/symbology', requireAdmin, async (c) => {
  try {
    const body = await c.req.json();
    const d = await drive(c.env);
    await saveSymbology(d, c.env.GOOGLE_ROOT_FOLDER_ID, body);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

/** GET /api/admin/pf-symbology/:fileId */
app.get('/api/admin/pf-symbology/:fileId', requireAdmin, async (c) => {
  try {
    const fileId = c.req.param('fileId');
    const d = await drive(c.env);
    const root = c.env.GOOGLE_ROOT_FOLDER_ID;
    const f = await d.findFile(`pf_sym_${fileId}.json`, root);
    return c.json(f ? (await d.readJson(f.id) ?? {}) : {});
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

/** POST /api/admin/pf-symbology */
app.post('/api/admin/pf-symbology', requireAdmin, async (c) => {
  try {
    const { fileId, symbology } = await c.req.json();
    const d = await drive(c.env);
    const root = c.env.GOOGLE_ROOT_FOLDER_ID;
    const name = `pf_sym_${fileId}.json`;
    const existing = await d.findFile(name, root);
    await d.writeJson(name, root, symbology, existing?.id);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

/** GET /api/admin/sheet-config */
app.get('/api/admin/sheet-config', requireAdmin, async (c) => {
  try {
    const d = await drive(c.env);
    return c.json((await readSheetConfig(d, c.env.GOOGLE_ROOT_FOLDER_ID)) ?? {});
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

/** POST /api/admin/sheet-config */
app.post('/api/admin/sheet-config', requireAdmin, async (c) => {
  try {
    const body = await c.req.json();
    const d = await drive(c.env);
    await saveSheetConfig(d, c.env.GOOGLE_ROOT_FOLDER_ID, body);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

/** GET /api/admin/sheets-list */
app.get('/api/admin/sheets-list', requireAdmin, async (c) => {
  try {
    const d = await drive(c.env);
    const cfg = await readSheetConfig(d, c.env.GOOGLE_ROOT_FOLDER_ID);
    if (!cfg?.spreadsheetId) return c.json({ sheets: [] });

    const token = await getAccessToken(c.env);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cfg.spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    return c.json({ sheets: data.sheets?.map(s => s.properties.title) ?? [] });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

/** GET /api/admin/sheet-columns */
app.get('/api/admin/sheet-columns', requireAdmin, async (c) => {
  try {
    const d = await drive(c.env);
    const cfg = await readSheetConfig(d, c.env.GOOGLE_ROOT_FOLDER_ID);
    if (!cfg?.spreadsheetId) return c.json({ columns: [] });

    const token = await getAccessToken(c.env);
    const sheet = encodeURIComponent(`${cfg.sheetName ?? 'Sheet1'}!A1:Z1`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cfg.spreadsheetId}/values/${sheet}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    return c.json({ columns: data.values?.[0] ?? [] });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

/** GET /api/admin/jenis-bencana */
app.get('/api/admin/jenis-bencana', requireAdmin, async (c) => {
  try {
    const d = await drive(c.env);
    const cfg = await readSheetConfig(d, c.env.GOOGLE_ROOT_FOLDER_ID);
    if (!cfg?.spreadsheetId || cfg.typeColumn == null) return c.json({ types: [] });

    const token = await getAccessToken(c.env);
    const sheet = encodeURIComponent(`${cfg.sheetName ?? 'Sheet1'}!A1:Z2000`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cfg.spreadsheetId}/values/${sheet}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (!data.values || data.values.length < 2) return c.json({ types: [] });

    const types = [...new Set(
      data.values.slice(1)
        .map(row => row[cfg.typeColumn])
        .filter(Boolean)
    )];
    return c.json({ types });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// =================================================================
// FALLBACK — Serve static assets (index.html, admin.html, dll)
// =================================================================
app.get('*', async (c) => {
  // ASSETS binding diset di wrangler.toml → [assets]
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
