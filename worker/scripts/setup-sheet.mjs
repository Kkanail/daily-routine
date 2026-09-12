// 一次性腳本：把 4 個分頁、表頭、原本 12 個每日事項灌進新的 Google Sheet。
// 用法：node scripts/setup-sheet.mjs /path/to/service-account-key.json
import { readFileSync } from 'node:fs';
import { readTable, writeRow, appendRow, batchUpdate, getSpreadsheetMeta } from '../src/sheets.js';

const SHEET_ID = '1qnR9i_Q4ZMi8tTO7BGBMoizQUdjUJsikKea51IQrI4Y'; // 需與 wrangler.toml 的 SHEET_ID 一致

const TABS = {
  Projects: ['project_id', 'project_name', 'note'],
  Habits: ['habit_id', 'habit_name', 'emoji', 'project_ids', 'frequency_type', 'frequency_detail', 'is_temporary', 'start_date', 'end_date', 'active', 'pinned'],
  'Daily Log': ['date', 'time', 'habit_id', 'slot', 'period_key', 'done', 'note'],
  'Cat Log': ['date', 'time', 'category', 'description', 'photo_url'],
};

// 從舊 app 遷移過來的 12 個每日事項；澆花是使用者討論「本週待辦」概念時舉的例子，改成 weekly。
const INITIAL_HABITS = [
  { habit_id: '1', habit_name: '吃異位寧', emoji: '💊', frequency_type: 'daily' },
  { habit_id: '2a', habit_name: '胖貓早藥', emoji: '🐱', frequency_type: 'daily' },
  { habit_id: '3', habit_name: '吃益生菌', emoji: '🌿', frequency_type: 'daily' },
  { habit_id: '4', habit_name: '紅外線復健', emoji: '🔴', frequency_type: 'daily' },
  { habit_id: '5', habit_name: '美容儀', emoji: '✨', frequency_type: 'daily' },
  { habit_id: '6', habit_name: '澆花', emoji: '🌸', frequency_type: 'weekly' },
  { habit_id: '7', habit_name: '讀書 / 練習英文', emoji: '📚', frequency_type: 'daily' },
  { habit_id: '8', habit_name: '復健小插畫', emoji: '🎨', frequency_type: 'daily' },
  { habit_id: '9', habit_name: '閉氣練習', emoji: '🫁', frequency_type: 'daily' },
  { habit_id: '10', habit_name: '做作品集 / AI課程', emoji: '💻', frequency_type: 'daily' },
  { habit_id: '11', habit_name: '瑜伽', emoji: '🧘', frequency_type: 'daily' },
  { habit_id: '2b', habit_name: '胖貓晚藥', emoji: '🐱', frequency_type: 'daily' },
  { habit_id: '12', habit_name: '日摘記錄', emoji: '✍️', frequency_type: 'daily' },
];

async function main() {
  const keyPath = process.argv[2];
  if (!keyPath) {
    console.error('用法: node scripts/setup-sheet.mjs /path/to/service-account-key.json');
    process.exit(1);
  }
  const env = { GOOGLE_SA_KEY: readFileSync(keyPath, 'utf8'), SHEET_ID };

  console.log('讀取試算表現況…');
  const meta = await getSpreadsheetMeta(env);
  const existingTitles = meta.sheets.map(s => s.properties.title);

  const toAdd = Object.keys(TABS).filter(t => !existingTitles.includes(t));
  if (toAdd.length) {
    console.log('建立分頁：', toAdd.join(', '));
    await batchUpdate(env, toAdd.map(title => ({ addSheet: { properties: { title } } })));
  }

  for (const [title, headers] of Object.entries(TABS)) {
    console.log(`寫入表頭：${title}`);
    await writeRow(env, title, 1, headers, Object.fromEntries(headers.map(h => [h, h])));
  }

  const { rows: existingHabits } = await readTable(env, 'Habits');
  if (existingHabits.length === 0) {
    console.log('灌入原本的 12 個每日事項…');
    for (const item of INITIAL_HABITS) {
      await appendRow(env, 'Habits', TABS.Habits, {
        habit_id: item.habit_id,
        habit_name: item.habit_name,
        emoji: item.emoji,
        project_ids: '',
        frequency_type: item.frequency_type,
        frequency_detail: '',
        is_temporary: false,
        start_date: '',
        end_date: '',
        active: true,
        pinned: true,
      });
    }
  } else {
    console.log('Habits 已有資料，跳過灌入預設事項。');
  }

  const freshMeta = await getSpreadsheetMeta(env);
  const leftover = freshMeta.sheets.find(s => !Object.keys(TABS).includes(s.properties.title));
  if (leftover) {
    console.log(`刪除預設分頁：${leftover.properties.title}`);
    await batchUpdate(env, [{ deleteSheet: { sheetId: leftover.properties.sheetId } }]);
  }

  console.log('完成！');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
