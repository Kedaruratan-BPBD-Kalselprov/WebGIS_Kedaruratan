# WebGIS Bencana

Aplikasi peta web interaktif untuk visualisasi titik bencana dan layer spasial GeoJSON.
Dibangun dengan **Node.js + Express**, port dari Google Apps Script.

---

## Fitur

- 🗺 Peta interaktif berbasis Leaflet (basemap: Satelit, OSM, Gelap)
- 📁 Upload & kelola layer GeoJSON dari panel admin
- 🎨 Editor symbology (warna, ukuran, opacity) per layer
- 🖌 Symbology per-fitur (seperti "Categorized" di QGIS/ArcGIS)
- 🚨 Titik bencana real-time dari Google Sheets
- 🔴 Style titik bencana per jenis (warna, bentuk)
- 📋 Drag & drop urutan layer
- 🔐 Panel admin dengan autentikasi password

---

## Struktur Proyek

```
webgis-bencana/
├── server/
│   ├── index.js        ← Entry point Express (port dari Code.gs)
│   ├── routes.js       ← Semua endpoint REST API
│   ├── backend.js      ← Logika bisnis admin (port dari Backend.gs)
│   └── database.js     ← Akses data Drive & Sheets (port dari Database.gs)
├── config/
│   └── drive.js        ← Google Drive/Sheets client (Service Account)
├── public/
│   ├── index.html      ← Frontend peta publik (port dari Frontend.html)
│   └── admin.html      ← Panel admin (port dari Admin.html)
├── .env.example        ← Contoh konfigurasi environment
├── .gitignore
└── package.json
```

---

## Instalasi

### 1. Clone & install dependencies

```bash
git clone https://github.com/username/webgis-bencana.git
cd webgis-bencana
npm install
```

### 2. Buat Service Account Google

Aplikasi ini menggunakan **Google Service Account** untuk akses ke Google Drive dan Google Sheets (menggantikan DriveApp dan SpreadsheetApp di Apps Script).

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru (atau gunakan yang sudah ada)
3. Aktifkan **Google Drive API** dan **Google Sheets API**
4. Buat **Service Account**: `IAM & Admin → Service Accounts → Create`
5. Download file JSON key-nya
6. Simpan sebagai `config/service-account.json`
7. **Bagikan folder root Google Drive** ke email service account (beri akses *Editor*)

### 3. Konfigurasi environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
ADMIN_PASSWORD=password_anda
SESSION_SECRET=string_acak_panjang
GOOGLE_ROOT_FOLDER_ID=id_folder_drive_anda
```

`GOOGLE_ROOT_FOLDER_ID` adalah ID folder di Google Drive tempat file `layers_metadata.json`, `symbology_config.json`, dan subfolder `layers/` akan disimpan. ID ada di URL folder: `https://drive.google.com/drive/folders/`**`<ID_DI_SINI>`**

### 4. Jalankan

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Buka di browser:
- **Peta publik**: http://localhost:3000/
- **Panel admin**: http://localhost:3000/admin

---

## Perbedaan dari Versi Apps Script

| Aspek | Apps Script (lama) | Node.js/Express (baru) |
|---|---|---|
| Komunikasi client↔server | `google.script.run` | `fetch()` ke REST API |
| Penyimpanan data | `DriveApp` + `SpreadsheetApp` | Google Drive API + Sheets API via Service Account |
| Autentikasi admin | Session di URL parameter | Express Session (cookie) |
| Upload file | Base64 dalam payload JSON | `multipart/form-data` via Multer |
| Routing halaman | `doGet(e)` dengan `?page=admin` | Express static + `/admin` route |
| Deploy | Google Apps Script web app | Node.js server (VPS/Railway/Render/dll) |

---

## API Endpoints

### Publik

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/layers` | Daftar layer + symbology + urutan |
| GET | `/api/layer/:fileId` | GeoJSON satu layer |
| GET | `/api/disaster` | Data titik bencana dari Sheets |

### Admin (butuh login)

| Method | Endpoint | Deskripsi |
|---|---|---|
| POST | `/api/admin/login` | Login admin |
| POST | `/api/admin/logout` | Logout |
| GET | `/api/admin/layers` | Data admin (layers, symbology, order) |
| POST | `/api/admin/layer/upload` | Upload layer GeoJSON |
| DELETE | `/api/admin/layer/:fileId` | Hapus layer |
| POST | `/api/admin/layer-order` | Simpan urutan layer |
| GET | `/api/admin/symbology` | Baca semua symbology |
| POST | `/api/admin/symbology` | Update symbology |
| GET | `/api/admin/pf-symbology/:fileId` | Baca per-feature symbology |
| POST | `/api/admin/pf-symbology` | Simpan per-feature symbology |
| GET | `/api/admin/sheet-config` | Baca konfigurasi spreadsheet |
| POST | `/api/admin/sheet-config` | Simpan konfigurasi spreadsheet |
| GET | `/api/admin/sheets-list` | Daftar sheet dari spreadsheet |
| GET | `/api/admin/sheet-columns` | Daftar kolom dari sheet |
| GET | `/api/admin/jenis-bencana` | Daftar jenis bencana unik |

---

## Deploy ke Production

### Railway / Render / Fly.io

1. Push repo ke GitHub
2. Hubungkan repo di platform pilihan
3. Set environment variables sesuai `.env.example`
4. Upload `service-account.json` sebagai secret file atau env variable

### VPS (Ubuntu)

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone & setup
git clone https://github.com/username/webgis-bencana.git
cd webgis-bencana
npm install --production

# Jalankan dengan PM2
npm install -g pm2
pm2 start server/index.js --name webgis-bencana
pm2 save
pm2 startup
```

---

## Lisensi

MIT
