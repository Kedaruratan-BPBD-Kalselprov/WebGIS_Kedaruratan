// ============================================================
// config/drive.js — Google Drive & Sheets client (Service Account)
// Pengganti DriveApp, SpreadsheetApp, dan fungsi penyimpanan Apps Script
// ============================================================
'use strict';

const { google } = require('googleapis');
const path       = require('path');
const fs         = require('fs');

// --- Autentikasi Service Account ---
function getAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || './config/service-account.json';
  const keyPath = path.resolve(keyFile);

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Service account JSON tidak ditemukan di: ${keyPath}\n` +
      'Salin file credential ke config/service-account.json atau atur env GOOGLE_SERVICE_ACCOUNT_JSON.'
    );
  }

  return new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  });
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

// ============================================================
// FOLDER HELPERS
// ============================================================

/** Mendapat folder root dari env ROOT_FOLDER_ID */
async function getRootFolderId() {
  return process.env.GOOGLE_ROOT_FOLDER_ID;
}

/** Mendapat atau membuat subfolder 'layers' di dalam root */
async function getOrCreateLayerFolderId() {
  const drive      = getDrive();
  const rootId     = await getRootFolderId();
  const folderName = process.env.LAYER_FOLDER_NAME || 'layers';

  const res = await drive.files.list({
    q:      `'${rootId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });

  if (res.data.files.length > 0) return res.data.files[0].id;

  const created = await drive.files.create({
    requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] },
    fields:      'id',
  });
  return created.data.id;
}

// ============================================================
// FILE HELPERS (JSON di Drive)
// ============================================================

/** Membaca file JSON dari Drive berdasarkan nama, mengembalikan parsed object */
async function readJsonFile(fileName, defaultValue = {}) {
  const drive  = getDrive();
  const rootId = await getRootFolderId();

  const res = await drive.files.list({
    q:      `'${rootId}' in parents and name='${fileName}' and trashed=false`,
    fields: 'files(id)',
  });

  if (!res.data.files.length) return defaultValue;

  const fileId = res.data.files[0].id;
  const content = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
  return JSON.parse(content.data);
}

/** Menyimpan object JSON ke Drive (overwrite jika sudah ada) */
async function writeJsonFile(fileName, data) {
  const drive   = getDrive();
  const rootId  = await getRootFolderId();
  const content = JSON.stringify(data, null, 2);

  const res = await drive.files.list({
    q:      `'${rootId}' in parents and name='${fileName}' and trashed=false`,
    fields: 'files(id)',
  });

  if (res.data.files.length > 0) {
    const fileId = res.data.files[0].id;
    await drive.files.update({
      fileId,
      media: { mimeType: 'application/json', body: content },
    });
  } else {
    await drive.files.create({
      requestBody: { name: fileName, parents: [rootId], mimeType: 'application/json' },
      media:       { mimeType: 'application/json', body: content },
    });
  }
}

// ============================================================
// METADATA & SYMBOLOGY
// ============================================================

const METADATA_FILE  = () => process.env.METADATA_FILE_NAME  || 'layers_metadata.json';
const SYMBOLOGY_FILE = () => process.env.SYMBOLOGY_FILE_NAME || 'symbology_config.json';

async function getMetadataRaw()       { return readJsonFile(METADATA_FILE(),  { layers: [], sheetConfig: null }); }
async function saveMetadataRaw(data)  { return writeJsonFile(METADATA_FILE(),  data); }
async function getSymbologyRaw()      { return readJsonFile(SYMBOLOGY_FILE(), {}); }
async function saveSymbologyRaw(data) { return writeJsonFile(SYMBOLOGY_FILE(), data); }

// ============================================================
// LAYER FILE (GeoJSON di subfolder 'layers')
// ============================================================

/** Upload buffer GeoJSON ke subfolder layers, kembalikan fileId */
async function uploadLayerFile(name, geojsonBuffer) {
  const drive    = getDrive();
  const folderId = await getOrCreateLayerFolderId();
  const fileName = name.endsWith('.geojson') ? name : name + '.geojson';

  const created = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId], mimeType: 'application/json' },
    media:       { mimeType: 'application/json', body: geojsonBuffer.toString('utf8') },
    fields:      'id',
  });
  return created.data.id;
}

/** Membaca GeoJSON dari Drive berdasarkan fileId */
async function readLayerFile(fileId) {
  const drive = getDrive();
  const res   = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
  return JSON.parse(res.data);
}

/** Memindahkan file ke trash */
async function trashFile(fileId) {
  const drive = getDrive();
  await drive.files.update({ fileId, requestBody: { trashed: true } });
}

// ============================================================
// SPREADSHEET (read-only)
// ============================================================

/** Mendapat daftar nama sheet */
async function getSheetNames(spreadsheetId) {
  const sheets = getSheets();
  const res    = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  return res.data.sheets.map(s => s.properties.title);
}

/** Mendapat header kolom dari sheet tertentu */
async function getSheetHeaders(spreadsheetId, sheetName) {
  const sheets = getSheets();
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
  });
  return (res.data.values || [[]])[0].filter(Boolean);
}

/** Membaca semua baris data (kecuali header) */
async function getSheetRows(spreadsheetId, sheetName) {
  const sheets = getSheets();
  const res    = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName });
  const [headers, ...rows] = res.data.values || [];
  return { headers: headers || [], rows: rows || [] };
}

module.exports = {
  getMetadataRaw, saveMetadataRaw,
  getSymbologyRaw, saveSymbologyRaw,
  uploadLayerFile, readLayerFile, trashFile,
  getSheetNames, getSheetHeaders, getSheetRows,
};
