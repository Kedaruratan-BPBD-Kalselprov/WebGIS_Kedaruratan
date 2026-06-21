# 🔧 Langkah Deploy Fix WebGIS Bencana

## Masalah yang diperbaiki
Express tidak berjalan di Cloudflare Workers → semua route /api/* return 404.
Solusi: migrasi backend ke **Hono** (framework native Workers).

---

## Struktur file baru

```
webgis-bencana/
├── src/
│   ├── index.js        ← Hono worker (pengganti server/index.js + routes.js)
│   ├── google-auth.js  ← JWT Service Account (Web Crypto, bukan Node crypto)
│   └── drive.js        ← Google Drive REST API client
├── public/
│   ├── index.html      ← TIDAK BERUBAH
│   └── admin.html      ← TIDAK BERUBAH
├── wrangler.toml       ← Konfigurasi Workers
└── package.json        ← Hanya butuh hono + wrangler
```

---

## Langkah-langkah

### 1. Install dependencies

```bash
npm install
```

### 2. Set secret Service Account

```bash
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
```

Saat diminta, paste **seluruh isi** file `config/service-account.json` kamu,
lalu tekan Enter.

### 3. Pastikan GOOGLE_ROOT_FOLDER_ID benar di wrangler.toml

```toml
[vars]
GOOGLE_ROOT_FOLDER_ID = "ID_FOLDER_DRIVE_KAMU"
```

ID ada di URL folder Drive: https://drive.google.com/drive/folders/**ID_DI_SINI**

### 4. Pastikan Service Account punya akses folder Drive

Email service account (bentuk: nama@project.iam.gserviceaccount.com) harus
dibagikan sebagai **Editor** ke folder root Google Drive.

### 5. Deploy

```bash
npx wrangler deploy
```

### 6. Test login admin

Buka: https://web-gis-kedaruratan.kedaruratan-bpbd-kalselprov.workers.dev/admin

Password default: `admin123` (atau sesuai ADMIN_PASSWORD di wrangler.toml)

---

## Checklist debug jika masih error

- [ ] Buka `/api/layers` di browser — pastikan return `{"layers":[], ...}` bukan 404
- [ ] Cek Workers logs: `npx wrangler tail`
- [ ] Pastikan folder Drive sudah dibagikan ke email service account
- [ ] Pastikan secret `GOOGLE_SERVICE_ACCOUNT_JSON` sudah di-set
