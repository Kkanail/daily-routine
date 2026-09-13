import { readTable, writeRow, appendRow } from './sheets.js';
import { putPhoto, getPhoto } from './r2.js';
import {
  businessDateParts, dayKey, periodKeyFor, currentTimeHHMM,
  monthKey, quarterKey, rangeForMonthKey, rangeForQuarterKey,
} from './period.js';

const HABITS_HEADERS = ['habit_id', 'habit_name', 'emoji', 'project_ids', 'frequency_type', 'frequency_detail', 'is_temporary', 'start_date', 'end_date', 'active', 'pinned'];
const LOG_HEADERS = ['date', 'time', 'habit_id', 'slot', 'period_key', 'done', 'note'];
const CATLOG_HEADERS = ['date', 'time', 'category', 'description', 'photo_url'];

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

function parseHabit(row) {
  return {
    habit_id: row.habit_id,
    habit_name: row.habit_name,
    emoji: row.emoji,
    project_ids: row.project_ids ? row.project_ids.split(',').map(s => s.trim()).filter(Boolean) : [],
    frequency_type: row.frequency_type || 'daily',
    frequency_detail: row.frequency_detail ? row.frequency_detail.split(',').map(s => s.trim()).filter(Boolean) : [],
    is_temporary: String(row.is_temporary).toUpperCase() === 'TRUE',
    start_date: row.start_date || '',
    end_date: row.end_date || '',
    active: String(row.active).toUpperCase() !== 'FALSE',
    pinned: String(row.pinned).toUpperCase() === 'TRUE',
  };
}

function parseLog(row) {
  return {
    date: row.date, time: row.time, habit_id: row.habit_id, slot: row.slot || '',
    period_key: row.period_key, done: String(row.done).toUpperCase() === 'TRUE', note: row.note || '',
    _row: row._row,
  };
}

async function handleBootstrap(env) {
  const [{ rows: projectRows }, { rows: habitRows }] = await Promise.all([
    readTable(env, 'Projects'), readTable(env, 'Habits'),
  ]);
  const projects = projectRows.map(r => ({ project_id: r.project_id, project_name: r.project_name, note: r.note }));
  const habits = habitRows.map(parseHabit).filter(h => h.active);
  return json(env, { projects, habits });
}

async function handleGetLog(env, url) {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const { rows } = await readTable(env, 'Daily Log');
  const logs = rows
    .filter(r => (!from || r.date >= from) && (!to || r.date <= to))
    .map(parseLog);
  return json(env, { logs });
}

async function handlePostLog(env, request) {
  const body = await request.json();
  const { habit_id, slot = '', done, note = '' } = body;
  if (!habit_id) return json(env, { error: 'habit_id is required' }, 400);

  const { rows: habitRows } = await readTable(env, 'Habits');
  const habit = habitRows.find(r => r.habit_id === habit_id);
  if (!habit) return json(env, { error: `habit not found: ${habit_id}` }, 404);

  const bp = businessDateParts();
  const date = dayKey(bp);
  const period_key = periodKeyFor(habit.frequency_type || 'daily', bp);
  const time = currentTimeHHMM();

  const { headers, rows: logRows } = await readTable(env, 'Daily Log');
  const headersFinal = headers.length ? headers : LOG_HEADERS;
  const match = logRows.find(r => r.habit_id === habit_id && r.period_key === period_key && (r.slot || '') === (slot || ''));
  const rowObj = { date, time, habit_id, slot, period_key, done: !!done, note };

  if (match) {
    await writeRow(env, 'Daily Log', match._row, headersFinal, rowObj);
  } else {
    await appendRow(env, 'Daily Log', headersFinal, rowObj);
  }
  return json(env, { ok: true, date, period_key });
}

async function handlePostHabit(env, request) {
  const body = await request.json();
  const { habit_name, emoji = '📌', project_ids = [], is_temporary = false, start_date = '', end_date = '' } = body;
  if (!habit_name) return json(env, { error: 'habit_name is required' }, 400);
  if (is_temporary && (!start_date || !end_date)) return json(env, { error: 'temporary habits need start_date and end_date' }, 400);

  const { headers } = await readTable(env, 'Habits');
  const headersFinal = headers.length ? headers : HABITS_HEADERS;
  const habit_id = 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const rowObj = {
    habit_id, habit_name, emoji,
    project_ids: Array.isArray(project_ids) ? project_ids.join(',') : String(project_ids || ''),
    frequency_type: 'daily', frequency_detail: '',
    is_temporary: !!is_temporary, start_date, end_date,
    active: true, pinned: false,
  };
  await appendRow(env, 'Habits', headersFinal, rowObj);
  return json(env, { habit_id });
}

async function handleGetCatlog(env, url) {
  const month = url.searchParams.get('month');
  const { rows } = await readTable(env, 'Cat Log');
  const entries = rows
    .filter(r => !month || (r.date || '').startsWith(month))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map(r => ({ date: r.date, time: r.time, category: r.category, description: r.description, photo_url: r.photo_url }));
  return json(env, { entries });
}

async function handlePostCatlog(env, request) {
  const body = await request.json();
  const bp = businessDateParts();
  const rowObj = {
    date: dayKey(bp),
    time: body.time || currentTimeHHMM(),
    category: body.category || '',
    description: body.description || '',
    photo_url: body.photo_url || '',
  };
  const { headers } = await readTable(env, 'Cat Log');
  await appendRow(env, 'Cat Log', headers.length ? headers : CATLOG_HEADERS, rowObj);
  return json(env, { ok: true });
}

async function handleUpload(env, request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return json(env, { error: 'file is required' }, 400);
  const arrayBuffer = await file.arrayBuffer();
  const key = await putPhoto(env, { mimeType: file.type || 'image/jpeg', arrayBuffer });
  const photo_url = `${new URL(request.url).origin}/photos/${key}`;
  return json(env, { photo_url });
}

async function handleGetPhoto(env, key) {
  const obj = await getPhoto(env, key);
  if (!obj) return new Response('not found', { status: 404, headers: corsHeaders(env) });
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...corsHeaders(env),
    },
  });
}

// daily-multi 型態的完成率簡化為「當天只要有任一時段勾選就算完成一次」。
async function handleReport(env, url) {
  const scope = url.searchParams.get('scope') === 'project' ? 'project' : 'habit';
  const range = url.searchParams.get('range') === 'quarter' ? 'quarter' : 'month';
  const bp = businessDateParts();
  const key = url.searchParams.get('key') || (range === 'quarter' ? quarterKey(bp) : monthKey(bp));
  const { from, to, days, weeks } = range === 'quarter' ? rangeForQuarterKey(key) : rangeForMonthKey(key);

  const [{ rows: habitRows }, { rows: logRows }, { rows: projectRows }] = await Promise.all([
    readTable(env, 'Habits'), readTable(env, 'Daily Log'), readTable(env, 'Projects'),
  ]);
  const habits = habitRows.map(parseHabit);
  const logs = logRows.map(parseLog).filter(l => l.done && l.date >= from && l.date <= to);

  function expectedFor(freq) {
    if (freq === 'weekly') return weeks;
    if (freq === 'monthly') return range === 'month' ? 1 : 3;
    if (freq === 'quarterly') return range === 'quarter' ? 1 : 0.34;
    return days; // daily / daily-multi
  }

  const habitStats = habits.map(h => {
    const completed = new Set(logs.filter(l => l.habit_id === h.habit_id).map(l => l.period_key)).size;
    const expected = expectedFor(h.frequency_type) || 1;
    const rate = Math.min(1, completed / expected);
    return { habit_id: h.habit_id, habit_name: h.habit_name, emoji: h.emoji, project_ids: h.project_ids, completed, expected, rate };
  });

  let result;
  if (scope === 'project') {
    result = projectRows.map(p => {
      const linked = habitStats.filter(h => h.project_ids.includes(p.project_id));
      const rate = linked.length ? linked.reduce((s, h) => s + h.rate, 0) / linked.length : 0;
      return { project_id: p.project_id, project_name: p.project_name, habit_count: linked.length, rate };
    });
  } else {
    result = habitStats;
  }
  return json(env, { scope, range, key, from, to, result });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(env) });

    try {
      if (url.pathname === '/api/bootstrap' && request.method === 'GET') return await handleBootstrap(env);
      if (url.pathname === '/api/log' && request.method === 'GET') return await handleGetLog(env, url);
      if (url.pathname === '/api/log' && request.method === 'POST') return await handlePostLog(env, request);
      if (url.pathname === '/api/habits' && request.method === 'POST') return await handlePostHabit(env, request);
      if (url.pathname === '/api/catlog' && request.method === 'GET') return await handleGetCatlog(env, url);
      if (url.pathname === '/api/catlog' && request.method === 'POST') return await handlePostCatlog(env, request);
      if (url.pathname === '/api/upload' && request.method === 'POST') return await handleUpload(env, request);
      if (url.pathname === '/api/report' && request.method === 'GET') return await handleReport(env, url);
      if (url.pathname.startsWith('/photos/') && request.method === 'GET') return await handleGetPhoto(env, url.pathname.slice('/photos/'.length));
      return json(env, { error: 'not found' }, 404);
    } catch (err) {
      return json(env, { error: String((err && err.message) || err) }, 500);
    }
  },
};
