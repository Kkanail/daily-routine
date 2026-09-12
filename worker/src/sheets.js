import { getAccessToken } from './auth.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function colLetter(n) { return COLS[n - 1]; } // 1-based, 表格欄位不會超過 26 欄

async function sheetsFetch(env, path, options = {}) {
  const token = await getAccessToken(env);
  const res = await fetch(`${BASE}/${env.SHEET_ID}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Sheets API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function getValues(env, range) {
  const data = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
  return data.values || [];
}

// 讀整張表，回傳 { headers, rows }，rows 是依表頭 key 出來的物件陣列，帶 _row（該列在 sheet 上的實際列號，含表頭）。
async function readTable(env, sheetName) {
  const values = await getValues(env, `${sheetName}!A1:Z10000`);
  if (values.length === 0) return { headers: [], rows: [] };
  const [headers, ...body] = values;
  const rows = body
    .map((row, i) => {
      const obj = { _row: i + 2 };
      headers.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
      return obj;
    })
    .filter(obj => headers.some(h => obj[h] !== '')); // 跳過完全空白的列
  return { headers, rows };
}

function rowValuesFromHeaders(headers, obj) {
  return headers.map(h => {
    const v = obj[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  });
}

async function writeRow(env, sheetName, rowNumber, headers, obj) {
  const values = rowValuesFromHeaders(headers, obj);
  const range = `${sheetName}!A${rowNumber}:${colLetter(values.length)}${rowNumber}`;
  return sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [values] }),
  });
}

async function appendRow(env, sheetName, headers, obj) {
  const values = rowValuesFromHeaders(headers, obj);
  return sheetsFetch(env, `/values/${encodeURIComponent(sheetName)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: [values] }),
  });
}

async function batchUpdate(env, requests) {
  return sheetsFetch(env, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

async function getSpreadsheetMeta(env) {
  return sheetsFetch(env, '');
}

export { readTable, writeRow, appendRow, batchUpdate, getSpreadsheetMeta, getValues, rowValuesFromHeaders };
