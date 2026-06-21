// ============================================================
// server/backend.js
// Port dari Backend.gs — logika bisnis admin: upload, hapus, symbology
// ============================================================
'use strict';

const { trashFile, uploadLayerFile } = require('../config/drive');
const db = require('./database');

// ============================================================
// AUTENTIKASI ADMIN
// ============================================================
function adminLogin(password) {
  if (password === process.env.ADMIN_PASSWORD) {
    return { success: true, token: 'admin' };
  }
  return { success: false, error: 'Password salah.' };
}

// ============================================================
// UPLOAD LAYER
// ============================================================
async function uploadLayer(payload) {
  // payload: { name, type, description, geojsonBuffer (Buffer) }
  const { name, type, description, geojsonBuffer } = payload;

  const fileId = await uploadLayerFile(name, geojsonBuffer);

  const meta  = await db.getMetadataRaw();
  const entry = {
    fileId,
    name,
    type,
    description: description || '',
    uploadedAt:  new Date().toISOString(),
    visible:     true,
  };
  meta.layers = meta.layers || [];
  meta.layers.push(entry);
  await db.saveMetadataRaw(meta);

  const sym  = await db.getSymbologyRaw();
  sym[fileId] = buildDefaultSymbology(type, fileId);
  await db.saveSymbologyRaw(sym);

  return { success: true, fileId, message: 'Layer berhasil diupload.' };
}

// ============================================================
// HAPUS LAYER
// ============================================================
async function deleteLayer(fileId) {
  try {
    await trashFile(fileId);

    const meta  = await db.getMetadataRaw();
    meta.layers = (meta.layers || []).filter(l => l.fileId !== fileId);
    await db.saveMetadataRaw(meta);

    const sym   = await db.getSymbologyRaw();
    delete sym[fileId];
    delete sym['pf__' + fileId];
    await db.saveSymbologyRaw(sym);

    return { success: true, message: 'Layer berhasil dihapus.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// SYMBOLOGY GLOBAL
// ============================================================
async function getSymbology() {
  return { success: true, data: await db.getSymbologyRaw() };
}

async function updateSymbology(data) {
  const sym = await db.getSymbologyRaw();
  Object.keys(data).forEach(k => { sym[k] = { ...sym[k], ...data[k] }; });
  await db.saveSymbologyRaw(sym);
  return { success: true, message: 'Symbology diperbarui.' };
}

// ============================================================
// PER-FEATURE SYMBOLOGY
// ============================================================
async function updatePerFeatureSymbology(fileId, fieldName, featureStyles, mode) {
  try {
    const sym      = await db.getSymbologyRaw();
    const pfKey    = 'pf__' + fileId;
    sym[pfKey] = {
      fileId,
      fieldName,
      mode:      mode || 'manual',
      styles:    featureStyles || {},
      updatedAt: new Date().toISOString(),
    };
    await db.saveSymbologyRaw(sym);
    return { success: true, message: 'Per-feature symbology disimpan.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getPerFeatureSymbology(fileId) {
  try {
    const sym  = await db.getSymbologyRaw();
    return { success: true, data: sym['pf__' + fileId] || null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// URUTAN LAYER
// ============================================================
async function saveLayerOrder(order) {
  try {
    const meta = await db.getMetadataRaw();
    meta.layerOrder = order;
    await db.saveMetadataRaw(meta);
    return { success: true, message: 'Urutan layer disimpan.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// DATA ADMIN (layers + symbology + order)
// ============================================================
async function getAdminLayers() {
  const meta = await db.getMetadataRaw();
  const sym  = await db.getSymbologyRaw();
  return {
    success:    true,
    layers:     meta.layers     || [],
    symbology:  sym,
    layerOrder: meta.layerOrder || [],
  };
}

// ============================================================
// KONFIGURASI SPREADSHEET BENCANA
// ============================================================
async function saveSheetConfig(config) {
  const meta = await db.getMetadataRaw();
  meta.sheetConfig = config;
  await db.saveMetadataRaw(meta);
  return { success: true, message: 'Konfigurasi spreadsheet disimpan.' };
}

async function getSheetConfig() {
  const meta = await db.getMetadataRaw();
  return { success: true, config: meta.sheetConfig || null };
}

// ============================================================
// JENIS BENCANA UNIK DARI SPREADSHEET
// ============================================================
async function getJenisBencana() {
  try {
    const meta = await db.getMetadataRaw();
    const cfg  = meta.sheetConfig;
    if (!cfg || !cfg.spreadsheetId) {
      return { success: false, error: 'Spreadsheet belum dikonfigurasi.' };
    }

    const { headers, rows } = await require('../config/drive').getSheetRows(cfg.spreadsheetId, cfg.sheetName);
    const colMap     = cfg.columns || {};
    const jenisColName = colMap['jenis'];
    if (!jenisColName) {
      return { success: false, error: 'Kolom jenis bencana belum dipetakan.' };
    }

    const jenisIdx = headers.indexOf(jenisColName);
    if (jenisIdx < 0) {
      return { success: false, error: `Kolom "${jenisColName}" tidak ditemukan di sheet.` };
    }

    const unique = [...new Set(rows.map(r => String(r[jenisIdx] || '').trim()).filter(Boolean))].sort();
    return { success: true, jenis: unique };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// HELPERS
// ============================================================
function buildDefaultSymbology(type, fileId) {
  const base = { type, fileId };
  if (type === 'point') {
    return { ...base, shape: 'circle', color: '#3498db', fillColor: '#3498db', fillOpacity: 0.8, radius: 8, weight: 2 };
  } else if (type === 'line') {
    return { ...base, color: '#3498db', weight: 3, opacity: 1, dashArray: null };
  } else {
    return { ...base, color: '#2ecc71', weight: 2, fillColor: '#2ecc71', fillOpacity: 0.4, fillPattern: 'solid' };
  }
}

module.exports = {
  adminLogin,
  uploadLayer,
  deleteLayer,
  getSymbology,
  updateSymbology,
  updatePerFeatureSymbology,
  getPerFeatureSymbology,
  saveLayerOrder,
  getAdminLayers,
  saveSheetConfig,
  getSheetConfig,
  getJenisBencana,
};
