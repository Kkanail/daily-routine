import { SignJWT, importPKCS8 } from 'jose';

// 模組層快取：同一個 isolate 內重複使用同一個 access token，過期前 1 分鐘才重換。
let cached = null;

async function getAccessToken(env) {
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) return cached.accessToken;

  const key = JSON.parse(env.GOOGLE_SA_KEY);
  const privateKey = await importPKCS8(key.private_key, 'RS256');
  const jwt = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(key.client_email)
    .setSubject(key.client_email)
    .setAudience(key.token_uri)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  cached = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cached.accessToken;
}

export { getAccessToken };
