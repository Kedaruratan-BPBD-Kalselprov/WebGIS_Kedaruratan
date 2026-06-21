// ============================================================
// server/database.js
// Port dari Database.gs — semua akses data ke Drive & Sheets
// ============================================================
'use strict';

const {
  getMetadataRaw, saveMetadataRaw,
  getSymbologyRaw, saveSymbologyRaw,
  readLayerFile,
  getSheetNames, getSheetHeaders, getSheetRows,
} = require('../config/drive');

// ============================================================
// DATA BENCANA DARI SPREADSHEET
// ============================================================
async function getDisasterData(payload = {}) {
  try {
    const meta = await getMetadataRaw();
    const cfg  = payload.config || meta.sheetConfig;

    if (!cfg || !cfg.spreadsheetId) {
      return { success: true, features: [], message: 'Belum ada konfigurasi spreadsheet.' };
    }

    const { headers, rows } = await getSheetRows(cfg.spreadsheetId, cfg.sheetName);
    if (!rows.length) return { success: true, features: [] };

    const colMap = cfg.columns || {};
    const idx    = {};
    Object.keys(colMap).forEach(key => {
      const i = headers.indexOf(colMap[key]);
      if (i >= 0) idx[key] = i;
    });

    const sym = await getSymbologyRaw();

    // Lookup style per jenis bencana (key: "disaster__<jenis>")
    const styleByJenis = {};
    Object.keys(sym).forEach(k => {
      if (k.startsWith('disaster__')) {
        const s     = sym[k];
        const label = s._label
          ? s._label.toLowerCase()
          : k.replace(/^disaster__/, '').replace(/_/g, ' ');
        styleByJenis[label] = s;
      }
    });

    const features = [];
    rows.forEach((row, ri) => {
      const lat = parseFloat(row[idx.lat]);
      const lng = parseFloat(row[idx.lng]);
      if (isNaN(lat) || isNaN(lng)) return;

      const jenis   = idx.jenis   !== undefined ? String(row[idx.jenis]   || '').trim() : '';
      const nama    = idx.nama    !== undefined ? String(row[idx.nama]    || '').trim() : '';
      const kabkota = idx.kabkota !== undefined ? String(row[idx.kabkota] || '').trim() : '';
      const kec     = idx.kec     !== undefined ? String(row[idx.kec]     || '').trim() : '';
      const desa    = idx.desa    !== undefined ? String(row[idx.desa]    || '').trim() : '';
      const tanggal = idx.tanggal !== undefined ? String(row[idx.tanggal] || '').trim() : '';

      const jenisKey      = jenis.toLowerCase();
      const jenisKeyUnder = jenisKey.replace(/\s+/g, '_');
      const directKey     = 'disaster__' + jenisKeyUnder;

      let style = sym[directKey] || styleByJenis[jenisKey] || null;

      if (!style) {
        style = {
          color: '#607d8b', fillColor: '#607d8b',
          radius: 8, shape: 'circle', fillOpacity: 0.8, weight: 2,
          _unconfigured: true,
        };
      }

      const resolvedStyle = {
        color:         style.color        || '#607d8b',
        fillColor:     style.fillColor    || style.color || '#607d8b',
        radius:        style.radius       || 8,
        shape:         style.shape        || 'circle',
        fillOpacity:   style.fillOpacity  !== undefined ? style.fillOpacity : 0.8,
        weight:        style.weight       || 2,
        _label:        style._label       || jenis,
        _unconfigured: !!style._unconfigured,
        _enabled:      style._enabled !== false,
      };

      const properties = {
        lat, lng, jenis, nama, kabkota, kec, desa, tanggal,
        _style:    resolvedStyle,
        _rowIndex: ri + 2,
      };

      if (cfg.extraColumns) {
        cfg.extraColumns.forEach(colName => {
          const i = headers.indexOf(colName);
          if (i >= 0) properties[colName] = row[i];
        });
      }

      features.push({
        type: 'Feature',
        geometry:   { type: 'Point', coordinates: [lng, lat] },
        properties,
      });
    });

    return { success: true, features, total: features.length };
  } catch (err) {
    return { success: false, error: 'Gagal membaca data bencana: ' + err.message };
  }
}

// ============================================================
// LAYER FILE
// ============================================================
async function getLayerData(fileId) {
  try {
    const geojson = await readLayerFile(fileId);
    return { success: true, geojson };
  } catch (err) {
    return { success: false, error: 'Gagal membaca layer: ' + err.message };
  }
}

// ============================================================
// SPREADSHEET HELPERS (untuk admin)
// ============================================================
async function getSheetsList(spreadsheetId) {
  try {
    const sheets = await getSheetNames(spreadsheetId);
    return { success: true, sheets };
  } catch (err) {
    return { success: false, error: 'Spreadsheet tidak ditemukan: ' + err.message };
  }
}

async function getSheetColumns(spreadsheetId, sheetName) {
  try {
    const columns = await getSheetHeaders(spreadsheetId, sheetName);
    return { success: true, columns };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  getMetadataRaw, saveMetadataRaw,
  getSymbologyRaw, saveSymbologyRaw,
  getDisasterData,
  getLayerData,
  getSheetsList,
  getSheetColumns,
};
