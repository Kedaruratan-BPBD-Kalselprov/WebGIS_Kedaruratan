// ============================================================
// server/routes.js — Semua endpoint REST API
// Menggantikan google.script.run dan doGet/doPost di Apps Script
// ============================================================
'use strict';

const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const backend = require('./backend');
const db      = require('./database');

// ============================================================
// MIDDLEWARE AUTH (untuk route admin)
// ============================================================
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ success: false, error: 'Tidak terotorisasi.' });
}

// ============================================================
// FRONTEND ROUTES (publik)
// ============================================================

/** GET /api/layers — daftar layer yang visible + symbology + layerOrder */
router.get('/api/layers', async (req, res) => {
  try {
    const meta = await db.getMetadataRaw();
    const sym  = await db.getSymbologyRaw();
    res.json({
      success:    true,
      layers:     (meta.layers || []).filter(l => l.visible !== false),
      symbology:  sym,
      layerOrder: meta.layerOrder || [],
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/** GET /api/layer/:fileId — GeoJSON untuk satu layer */
router.get('/api/layer/:fileId', async (req, res) => {
  const result = await db.getLayerData(req.params.fileId);
  res.json(result);
});

/** GET /api/disaster — data titik bencana dari Sheets */
router.get('/api/disaster', async (req, res) => {
  const result = await db.getDisasterData();
  res.json(result);
});

// ============================================================
// ADMIN AUTH
// ============================================================

/** POST /api/admin/login */
router.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const result = backend.adminLogin(password);
  if (result.success) {
    req.session.isAdmin = true;
  }
  res.json(result);
});

/** POST /api/admin/logout */
router.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ============================================================
// ADMIN — LAYER MANAGEMENT
// ============================================================

/** GET /api/admin/layers */
router.get('/api/admin/layers', requireAdmin, async (req, res) => {
  const result = await backend.getAdminLayers();
  res.json(result);
});

/** POST /api/admin/layer/upload — upload file GeoJSON */
router.post('/api/admin/layer/upload', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.json({ success: false, error: 'File tidak ditemukan.' });
  const { name, type, description } = req.body;
  if (!name || !type) return res.json({ success: false, error: 'Nama dan tipe wajib diisi.' });

  const result = await backend.uploadLayer({
    name,
    type,
    description,
    geojsonBuffer: req.file.buffer,
  });
  res.json(result);
});

/** DELETE /api/admin/layer/:fileId */
router.delete('/api/admin/layer/:fileId', requireAdmin, async (req, res) => {
  const result = await backend.deleteLayer(req.params.fileId);
  res.json(result);
});

// ============================================================
// ADMIN — LAYER ORDER
// ============================================================

/** POST /api/admin/layer-order */
router.post('/api/admin/layer-order', requireAdmin, async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.json({ success: false, error: 'order harus array.' });
  const result = await backend.saveLayerOrder(order);
  res.json(result);
});

// ============================================================
// ADMIN — SYMBOLOGY
// ============================================================

/** GET /api/admin/symbology */
router.get('/api/admin/symbology', requireAdmin, async (req, res) => {
  const result = await backend.getSymbology();
  res.json(result);
});

/** POST /api/admin/symbology */
router.post('/api/admin/symbology', requireAdmin, async (req, res) => {
  const { data } = req.body;
  if (!data) return res.json({ success: false, error: 'data wajib diisi.' });
  const result = await backend.updateSymbology(data);
  res.json(result);
});

// ============================================================
// ADMIN — PER-FEATURE SYMBOLOGY
// ============================================================

/** GET /api/admin/pf-symbology/:fileId */
router.get('/api/admin/pf-symbology/:fileId', requireAdmin, async (req, res) => {
  const result = await backend.getPerFeatureSymbology(req.params.fileId);
  res.json(result);
});

/** POST /api/admin/pf-symbology */
router.post('/api/admin/pf-symbology', requireAdmin, async (req, res) => {
  const { fileId, fieldName, featureStyles, mode } = req.body;
  if (!fileId) return res.json({ success: false, error: 'fileId wajib diisi.' });
  const result = await backend.updatePerFeatureSymbology(fileId, fieldName, featureStyles, mode);
  res.json(result);
});

// ============================================================
// ADMIN — SPREADSHEET BENCANA
// ============================================================

/** GET /api/admin/sheet-config */
router.get('/api/admin/sheet-config', requireAdmin, async (req, res) => {
  const result = await backend.getSheetConfig();
  res.json(result);
});

/** POST /api/admin/sheet-config */
router.post('/api/admin/sheet-config', requireAdmin, async (req, res) => {
  const { config } = req.body;
  if (!config) return res.json({ success: false, error: 'config wajib diisi.' });
  const result = await backend.saveSheetConfig(config);
  res.json(result);
});

/** GET /api/admin/sheets-list?spreadsheetId=xxx */
router.get('/api/admin/sheets-list', requireAdmin, async (req, res) => {
  const { spreadsheetId } = req.query;
  if (!spreadsheetId) return res.json({ success: false, error: 'spreadsheetId wajib.' });
  const result = await db.getSheetsList(spreadsheetId);
  res.json(result);
});

/** GET /api/admin/sheet-columns?spreadsheetId=xxx&sheetName=yyy */
router.get('/api/admin/sheet-columns', requireAdmin, async (req, res) => {
  const { spreadsheetId, sheetName } = req.query;
  if (!spreadsheetId || !sheetName) return res.json({ success: false, error: 'spreadsheetId dan sheetName wajib.' });
  const result = await db.getSheetColumns(spreadsheetId, sheetName);
  res.json(result);
});

/** GET /api/admin/jenis-bencana */
router.get('/api/admin/jenis-bencana', requireAdmin, async (req, res) => {
  const result = await backend.getJenisBencana();
  res.json(result);
});

module.exports = router;
