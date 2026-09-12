import { getAccessToken } from './auth.js';

// 上傳一個檔案到指定資料夾，設成「知道連結的人可檢視」，回傳可直接當 <img src> 用的連結。
async function uploadPhoto(env, { fileName, mimeType, arrayBuffer }) {
  const token = await getAccessToken(env);
  const boundary = 'daily_routine_boundary_' + crypto.randomUUID();
  const metadata = { name: fileName, parents: [env.DRIVE_FOLDER_ID] };

  const encoder = new TextEncoder();
  const parts = [
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    new Uint8Array(arrayBuffer),
    encoder.encode(`\r\n--${boundary}--`),
  ];
  const body = new Blob(parts);

  const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!createRes.ok) {
    throw new Error(`Drive upload failed: ${createRes.status} ${await createRes.text()}`);
  }
  const { id } = await createRes.json();

  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  if (!permRes.ok) {
    throw new Error(`Drive permission failed: ${permRes.status} ${await permRes.text()}`);
  }

  return `https://drive.google.com/uc?export=view&id=${id}`;
}

export { uploadPhoto };
