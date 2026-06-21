/**
 * google-auth.js
 * Service Account JWT auth menggunakan Web Crypto API (Workers-compatible)
 */

const TOKEN_CACHE = { token: null, expiry: 0 };

function base64url(input) {
  let str;
  if (typeof input === 'string') {
    str = btoa(unescape(encodeURIComponent(input)));
  } else {
    const bytes = new Uint8Array(input);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    str = btoa(binary);
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function importPrivateKey(pem) {
  const keyData = await pemToArrayBuffer(pem);
  return crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

export async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);

  // Pakai token cache jika masih valid (>60 detik)
  if (TOKEN_CACHE.token && TOKEN_CACHE.expiry > now + 60) {
    return TOKEN_CACHE.token;
  }

  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets.readonly'
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }));

  const signingInput = `${header}.${payload}`;
  const privateKey = await importPrivateKey(sa.private_key);

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64url(signature)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth2:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    throw new Error(`Gagal mendapat token Google: ${JSON.stringify(tokenData)}`);
  }

  TOKEN_CACHE.token = tokenData.access_token;
  TOKEN_CACHE.expiry = now + 3600;

  return tokenData.access_token;
}
