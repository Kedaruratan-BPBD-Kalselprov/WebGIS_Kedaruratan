// ============================================================
// server/index.js — Entry Point WebGIS Bencana (Express)
// Port dari Code.gs
// ============================================================
'use strict';

require('dotenv').config();

const express        = require('express');
const cors           = require('cors');
const session        = require('express-session');
const path           = require('path');
const routes         = require('./routes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
  secret:            process.env.SESSION_SECRET || 'webgis-secret-dev',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: false, maxAge: 8 * 60 * 60 * 1000 }, // 8 jam
}));

// ── Static files (HTML frontend) ────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API routes ───────────────────────────────────────────────
app.use(routes);

// ── SPA fallback: /admin → admin.html, default → index.html ─
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  WebGIS Bencana berjalan di http://localhost:${PORT}`);
  console.log(`   Peta publik : http://localhost:${PORT}/`);
  console.log(`   Admin panel : http://localhost:${PORT}/admin`);
});
