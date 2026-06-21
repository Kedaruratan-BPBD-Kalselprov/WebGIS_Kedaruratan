/**
 * drive.js
 * Google Drive REST API client — tanpa googleapis npm (Workers-compatible)
 */

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export class DriveClient {
  constructor(accessToken) {
    this.token = accessToken;
  }

  get authHeader() {
    return { Authorization: `Bearer ${this.token}` };
  }

  // ── Pencarian ────────────────────────────────────────────────────

  async findFile(name, parentId) {
    const q = `name='${name}' and '${parentId}' in parents and trashed=false`;
    const res = await fetch(
      `${BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)`,
      { headers: this.authHeader }
    );
    const data = await res.json();
    return data.files?.[0] ?? null;
  }

  async findFolder(name, parentId) {
    const q = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await fetch(
      `${BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
      { headers: this.authHeader }
    );
    const data = await res.json();
    return data.files?.[0] ?? null;
  }

  // ── Baca ─────────────────────────────────────────────────────────

  async readJson(fileId) {
    const res = await fetch(`${BASE}/files/${fileId}?alt=media`, {
      headers: this.authHeader
    });
    if (!res.ok) return null;
    return res.json();
  }

  async readText(fileId) {
    const res = await fetch(`${BASE}/files/${fileId}?alt=media`, {
      headers: this.authHeader
    });
    if (!res.ok) return null;
    return res.text();
  }

  // ── Buat folder ───────────────────────────────────────────────────

  async createFolder(name, parentId) {
    const res = await fetch(`${BASE}/files`, {
      method: 'POST',
      headers: { ...this.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });
    return res.json();
  }

  // ── Tulis JSON (create/update) ───────────────────────────────────

  async writeJson(name, parentId, data, existingId = null) {
    const content = JSON.stringify(data, null, 2);
    const boundary = 'wb_boundary_xyz';
    const meta = JSON.stringify(existingId ? {} : { name, parents: [parentId] });

    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      meta,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      content,
      `--${boundary}--`
    ].join('\r\n');

    const url = existingId
      ? `${UPLOAD}/files/${existingId}?uploadType=multipart`
      : `${UPLOAD}/files?uploadType=multipart`;

    const res = await fetch(url, {
      method: existingId ? 'PATCH' : 'POST',
      headers: {
        ...this.authHeader,
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body
    });
    return res.json();
  }

  // ── Upload file GeoJSON ──────────────────────────────────────────

  async uploadGeojson(name, parentId, content) {
    const boundary = 'wb_boundary_geojson';
    const meta = JSON.stringify({ name, parents: [parentId] });

    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      meta,
      `--${boundary}`,
      'Content-Type: application/geo+json',
      '',
      content,
      `--${boundary}--`
    ].join('\r\n');

    const res = await fetch(`${UPLOAD}/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        ...this.authHeader,
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body
    });
    return res.json();
  }

  // ── Hapus ────────────────────────────────────────────────────────

  async deleteFile(fileId) {
    const res = await fetch(`${BASE}/files/${fileId}`, {
      method: 'DELETE',
      headers: this.authHeader
    });
    return res.ok;
  }
}

// ── Helper: ambil/buat folder layers ──────────────────────────────

export async function getLayersFolder(drive, rootFolderId) {
  let folder = await drive.findFolder('layers', rootFolderId);
  if (!folder) {
    folder = await drive.createFolder('layers', rootFolderId);
  }
  return folder.id;
}

// ── Helper: baca/simpan metadata & symbology ──────────────────────

export async function readMetadata(drive, rootFolderId) {
  const file = await drive.findFile('layers_metadata.json', rootFolderId);
  if (!file) return [];
  return (await drive.readJson(file.id)) ?? [];
}

export async function saveMetadata(drive, rootFolderId, data) {
  const file = await drive.findFile('layers_metadata.json', rootFolderId);
  return drive.writeJson('layers_metadata.json', rootFolderId, data, file?.id);
}

export async function readSymbology(drive, rootFolderId) {
  const file = await drive.findFile('symbology_config.json', rootFolderId);
  if (!file) return {};
  return (await drive.readJson(file.id)) ?? {};
}

export async function saveSymbology(drive, rootFolderId, data) {
  const file = await drive.findFile('symbology_config.json', rootFolderId);
  return drive.writeJson('symbology_config.json', rootFolderId, data, file?.id);
}

export async function readSheetConfig(drive, rootFolderId) {
  const file = await drive.findFile('sheet_config.json', rootFolderId);
  if (!file) return null;
  return drive.readJson(file.id);
}

export async function saveSheetConfig(drive, rootFolderId, data) {
  const file = await drive.findFile('sheet_config.json', rootFolderId);
  return drive.writeJson('sheet_config.json', rootFolderId, data, file?.id);
}
