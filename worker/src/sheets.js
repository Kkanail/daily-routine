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

// 自己算下一個空白列，不用 values:append —— Sheets 的 append 會把「有格式/驗證規則」的列
// 也當成資料範圍，結果新列被丟到很後面（曾經掉到第 1001 列）。
async function appendRow(env, sheetName, headers, obj) {
  const { rows } = await readTable(env, sheetName);
  const nextRow = rows.length ? Math.max(...rows.map(r => r._row)) + 1 : 2;
  return writeRow(env, sheetName, nextRow, headers, obj);
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

async function deleteRow(env, sheetName, rowNumber) {
  const meta = await getSpreadsheetMeta(env);
  const sheet = meta.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) throw new Error(`sheet not found: ${sheetName}`);
  return batchUpdate(env, [{
    deleteDimension: { range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber } },
  }]);
}

export { readTable, writeRow, appendRow, deleteRow, batchUpdate, getSpreadsheetMeta, getValues, rowValuesFromHeaders };
