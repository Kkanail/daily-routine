// 所有「今天/本週/本月/本季」的邊界都從凌晨 5:00（Asia/Taipei）算起。

function taipeiParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute),
  };
}

function pad2(n) { return String(n).padStart(2, '0'); }

// 換算成「業務日」：凌晨 00:00–04:59 算前一天。回傳一個 UTC 午夜的 Date，只拿來做日期運算用。
function businessDateParts(date = new Date()) {
  const p = taipeiParts(date);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  if (p.hour < 5) d.setUTCDate(d.getUTCDate() - 1);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: p.hour, minute: p.minute };
}

function currentTimeHHMM(date = new Date()) {
  const p = taipeiParts(date);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

function dayKey(bp) { return `${bp.year}-${pad2(bp.month)}-${pad2(bp.day)}`; }

function isoWeekKey(bp) {
  const d = new Date(Date.UTC(bp.year, bp.month - 1, bp.day));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // 移到本週四
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum);
  const weekNum = Math.round((d - week1Monday) / (7 * 86400000)) + 1;
  return `${isoYear}-W${pad2(weekNum)}`;
}

function monthKey(bp) { return `${bp.year}-${pad2(bp.month)}`; }

function quarterKey(bp) {
  const q = Math.floor((bp.month - 1) / 3) + 1;
  return `${bp.year}-Q${q}`;
}

function periodKeyFor(frequencyType, bp) {
  switch (frequencyType) {
    case 'weekly': return isoWeekKey(bp);
    case 'monthly': return monthKey(bp);
    case 'quarterly': return quarterKey(bp);
    default: return dayKey(bp); // daily, daily-multi
  }
}

// 給報表用：算出某個 range key（月或季）對應的起訖日期（含頭尾），以及該 range 內的「天數/週數」，用來當完成率的分母。
function rangeForMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0)); // 上個月最後一天 = 這個月最後一天
  const days = to.getUTCDate();
  return { from: dayKey({ year: from.getUTCFullYear(), month: from.getUTCMonth() + 1, day: from.getUTCDate() }),
           to: dayKey({ year: to.getUTCFullYear(), month: to.getUTCMonth() + 1, day: to.getUTCDate() }),
           days, weeks: Math.ceil(days / 7) };
}

function rangeForQuarterKey(key) {
  const [y, qStr] = key.split('-Q');
  const q = Number(qStr);
  const startMonth = (q - 1) * 3 + 1;
  const from = new Date(Date.UTC(Number(y), startMonth - 1, 1));
  const to = new Date(Date.UTC(Number(y), startMonth + 2, 0));
  const days = Math.round((to - from) / 86400000) + 1;
  return { from: dayKey({ year: from.getUTCFullYear(), month: from.getUTCMonth() + 1, day: from.getUTCDate() }),
           to: dayKey({ year: to.getUTCFullYear(), month: to.getUTCMonth() + 1, day: to.getUTCDate() }),
           days, weeks: Math.ceil(days / 7) };
}

export {
  taipeiParts, businessDateParts, currentTimeHHMM,
  dayKey, isoWeekKey, monthKey, quarterKey, periodKeyFor,
  rangeForMonthKey, rangeForQuarterKey,
};
