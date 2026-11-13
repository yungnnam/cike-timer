/* 统计：概览、环形、分布、一周节奏、排行、目标
   所有数字都从同一份「区间裁剪后的段」推出来（agg），
   所以口径只有一个，不会出现环形图 5 小时、排行 6 小时这种对不上的情况。 */

import {
  state, typeById, sumByType, clipped, startOfDay, startOfWeek, startOfMonth,
  goalProgress, isGroup, descendants, running, focusSet, focusSummary,
} from '../store.js';
import { fmtDur, fmtDurS, hexA, shadeFor } from '../format.js';
import { esc } from '../ui.js';

const DAY = 86400000;
const BUCKET = 4;              // 一周节奏：每格 4 小时
const ACCENT = '#6C7BFF';

let range = 'week';

const RANGE_LABEL = { today: '今天', week: '本周', month: '本月', year: '今年' };

/* 占比可以换三种画法：实心饼（默认）、环形、条形。
   记在 localStorage 里，刷新后还是上次选的那种。 */
const CHART_LABEL = [['pie', '饼图'], ['ring', '环形'], ['bar', '条形']];
const CHART_KEY = 'cike:chart';

function readChart() {
  try {
    const v = localStorage.getItem(CHART_KEY);
    return CHART_LABEL.some(([k]) => k === v) ? v : 'pie';
  } catch (e) {
    return 'pie';
  }
}

let chartKind = readChart();

/* 汇总粒度：按分组（学习=编程+英语+阅读）还是按类型（编程、阅读各自一条）。
   原版叫 Pie view mode: Grouped / Types only，这里给了个一样的开关。 */
const GRAIN_LABEL = [['group', '分组'], ['type', '类型']];
const GRAIN_KEY = 'cike:grain';

function readGrain() {
  try {
    const v = localStorage.getItem(GRAIN_KEY);
    return GRAIN_LABEL.some(([k]) => k === v) ? v : 'group';
  } catch (e) {
    return 'group';
  }
}

let grain = readGrain();

/* 看往年：0 = 今年，-1 = 去年，-2 = 前年。跨年那天这里会自动落在新的一年，
   因为区间是从「当前时间」现算的，不存任何「今年」的副本。 */
let yearOffset = 0;
const yearOf = (ts) => new Date(ts).getFullYear();

/** 一条记录在统计里算到谁头上 */
function topIdOf(rec) {
  if (grain === 'type') return rec.typeId;
  const t = typeById(rec.typeId);
  return t && t.parentId ? t.parentId : rec.typeId;
}

function bounds() {
  const now = Date.now();
  if (range === 'week') {
    const s = startOfWeek(now);
    return [s, s + 7 * DAY];
  }
  if (range === 'month') {
    const s = startOfMonth(now);
    const d = new Date(s);
    d.setMonth(d.getMonth() + 1);
    return [s, d.getTime()];
  }
  if (range === 'year') {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() + yearOffset, 0, 1);
    d.setHours(0, 0, 0, 0);
    const s = d.getTime();
    const e = new Date(s);
    e.setFullYear(e.getFullYear() + 1);
    return [s, e.getTime()];
  }
  const s = startOfDay(now);
  return [s, s + DAY];
}

/** 顶部那句「今年 / 2026 年 · 共 …」的区间名 */
function rangeLabel(from) {
  if (range !== 'year') return RANGE_LABEL[range];
  return yearOffset === 0 ? '今年' : `${yearOf(from)} 年`;
}

/** 把区间裁成一段段，顺手算出：顶级类型合计、按小时、按「星期×时段」、条数、最长一段 */
function agg(from, to, now) {
  const end = Math.min(to, now);
  const top = new Map();
  const byHour = new Array(24).fill(0);
  const cell = new Map();      // "星期-第几格" → 毫秒
  const cellTop = new Map();   // 同上 → 这段时间里占最多的顶级类型
  const days = new Set();
  let total = 0;
  let longest = 0;
  let count = 0;

  for (const c of clipped(from, to, now)) {
    total += c.ms;
    count += 1;
    if (c.ms > longest) longest = c.ms;

    const tid = topIdOf(c.rec);
    top.set(tid, (top.get(tid) || 0) + c.ms);
    days.add(startOfDay(c.s));

    // 按小时切开：跨过整点的段会分成两截，才能算准「几点到几点最投入」
    let a = Math.max(c.s, from);
    const e = Math.min(c.e, end);
    while (a < e) {
      const b = Math.min(e, Math.ceil((a + 1) / 3600000) * 3600000);
      const d = new Date(a);
      const key = `${d.getDay()}-${Math.floor(d.getHours() / BUCKET)}`;
      const ms = b - a;
      byHour[d.getHours()] += ms;
      cell.set(key, (cell.get(key) || 0) + ms);
      const best = cellTop.get(key);
      if (!best || ms > best.ms) cellTop.set(key, { id: tid, ms });
      a = b;
    }
  }
  return { top, byHour, cell, cellTop, days: days.size, total, longest, count };
}

function rowsOf(aggv) {
  return Array.from(aggv.top.entries())
    .map(([typeId, ms]) => ({ typeId, type: typeById(typeId), ms }))
    .sort((a, b) => b.ms - a.ms);
}

/* 一个类型一种颜色；同一颜色出现多次时（子类型跟分组同色之后很常见），
   后面的按顺序压深/提亮一档，饼图和条形才分得开。 */
function paint(rows) {
  const seen = new Map();
  return rows.map((s) => {
    const base = s.type?.color || '#8B93A7';
    const used = seen.get(base) || 0;
    seen.set(base, used + 1);
    return used ? { ...s, tint: shadeFor(base, used) } : { ...s, tint: base };
  });
}

const colorOf = (s) => s?.tint || s?.type?.color || '#8B93A7';

/* 分布柱 / 热力图里按类型 id 找颜色，走的也是这一套变体 */
let tintMap = new Map();

export function render() {
  const now = Date.now();
  const [from, to] = bounds();
  const cur = agg(from, to, now);
  /* 「比上期」：年看的话要跟去年同一天起算，不能简单减 365 天（闰年会差一天） */
  let prevFrom = from - (to - from);
  if (range === 'year') {
    const d = new Date(from);
    d.setFullYear(d.getFullYear() - 1);
    prevFrom = d.getTime();
  }
  const prev = agg(prevFrom, from, now);
  const rows = paint(rowsOf(cur));
  tintMap = new Map(rows.map((r) => [r.typeId, colorOf(r)]));
  const span = Math.max(1, Math.min(to, now) - from);
  const daysElapsed = Math.max(1, Math.round(span / DAY) || 1);
  const rest = Math.max(0, span - cur.total);
  const pct = prev.total > 0 ? ((cur.total - prev.total) / prev.total) * 100 : null;
  const peak = peakHour(cur.byHour);

  const sub = `${rangeLabel(from)} · 共 ${fmtDur(cur.total)}`
    + (pct === null ? '' : ` · 比上期 ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`)
    + (cur.total && peak ? ` · 最投入 ${peak.h}–${peak.h + 1} 点` : '');

  return `
  <div class="top">
    <div>
      <h1 class="h-title">统计</h1>
      <div class="h-sub">${sub}</div>
    </div>
  </div>

  <div class="chips">
    ${Object.entries(RANGE_LABEL).map(([v, l]) => `<button class="chip ${range === v ? 'on' : ''}" data-range="${v}">${l}</button>`).join('')}
    ${range === 'year' ? `<span class="year-nav">
      <button data-year="-1" aria-label="上一年">‹</button>
      <b>${yearOf(from)}</b>
      <button data-year="1" aria-label="下一年" ${yearOffset >= 0 ? 'disabled' : ''}>›</button>
    </span>` : ''}
  </div>

  ${cur.total === 0 ? `<section class="card glass"><div class="empty" style="padding:44px 0">${rangeLabel(from)}还没有记录</div></section>` : `
  <div class="stats-pair">
  <section class="card glass stats-hero">
    <div class="chart-picks">
      <div class="seg-ctrl mini" data-chart-pick>
        ${CHART_LABEL.map(([v, l]) => `<button class="${chartKind === v ? 'on' : ''}" data-chart="${v}">${l}</button>`).join('')}
      </div>
      <div class="seg-ctrl mini" data-grain-pick>
        ${GRAIN_LABEL.map(([v, l]) => `<button class="${grain === v ? 'on' : ''}" data-grain="${v}">${l}</button>`).join('')}
      </div>
    </div>
    ${chartBody(rows, cur.total)}
    <div class="legend">
      ${rows.slice(0, 5).map((s) => `<span><i style="--c:${colorOf(s)}"></i>${esc(s.type?.name || '未分类')}<b>${pctStr(s.ms, cur.total)}</b></span>`).join('')}
      ${rows.length > 5 ? `<span class="more">等 ${rows.length} 类</span>` : ''}
    </div>
    <div class="kpis">
      <div class="kpi"><b>${fmtDur(cur.total / daysElapsed)}</b><span>日均</span></div>
      <div class="kpi"><b>${cur.count}</b><span>条记录</span></div>
      <div class="kpi"><b>${fmtDurS(cur.longest)}</b><span>最长一段</span></div>
      <div class="kpi"><b>${fmtDur(rest)}</b><span>未记录</span></div>
    </div>
  </section>
  ${hoursCard(now)}
  </div>

  <section class="card glass">
    <div class="card-h"><span class="card-t">分布</span>
      <span class="muted">${range === 'today' ? '0 – 24 时' : range === 'week' ? '本周 7 天' : range === 'month' ? '本月每天' : `${yearOf(from)} 年每月`}</span></div>
    ${bars(from, to, now)}
  </section>

  ${heatCard(cur, rows)}

  <section class="card glass">
    <div class="card-h"><span class="card-t">排行</span>
      <span class="muted">${rows.length} ${grain === 'type' ? '个类型' : '项'}</span></div>
    ${rows.slice(0, 10).map((s) => {
      const share = (s.ms / cur.total) * 100;
      const c = colorOf(s);
      const kids = kidRows(s, from, to, now);
      const before = prev.top.get(s.typeId) || 0;
      const diff = s.ms - before;
      const delta = before > 0 || diff > 0
        ? `<span class="delta ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '↑' : '↓'}${fmtDurS(Math.abs(diff))}</span>`
        : '';
      return `<div class="rank" style="--c:${c}">
        <i class="dot"></i>
        <span class="nm">${esc(s.type?.name || '未分类')}</span>
        ${delta}
        <span class="pct">${share.toFixed(0)}%</span>
        <span class="dur">${fmtDurS(s.ms)}</span>
      </div>${kids.length ? `<div class="rank-sub">${kids.slice(0, 4).map((k) => `<span><i style="--c:${k.type?.color || '#8B93A7'}"></i>${esc(k.type?.name || '未分类')} ${fmtDurS(k.ms)}</span>`).join('')}</div>` : ''}`;
    }).join('')}
  </section>`}

  ${weekHeat(now)}

  ${goalsCard(now)}
  `;
}

/** 分组下的子类型明细，只给分组用；按类型看的时候每行本身就是类型，不用再拆 */
function kidRows(s, from, to, now) {
  if (grain === 'type') return [];
  if (!s.type || !isGroup(s.type)) return [];
  const ids = new Set(descendants(s.typeId));
  // 子类型跟分组同色，这里也按名次调深浅，排行下面的小点才分得开
  return paint(Array.from(sumByType(from, to, now).entries())
    .filter(([tid]) => ids.has(tid))
    .map(([tid, ms]) => ({ typeId: tid, type: typeById(tid), ms }))
    .sort((a, b) => b.ms - a.ms));
}

function peakHour(byHour) {
  let best = -1;
  let bestMs = 0;
  byHour.forEach((ms, h) => { if (ms > bestMs) { bestMs = ms; best = h; } });
  return best < 0 ? null : { h: best, ms: bestMs };
}

function donut(rows, total, opts = {}) {
  const R = 70;
  const C = 2 * Math.PI * R;
  const list = rows.slice();
  if (opts.tail > 0) list.push({ ms: opts.tail, type: null, tail: true });
  let offset = 0;
  const segs = list.map((s) => {
    const len = Math.max(0, (s.ms / total) * C - 2);
    const color = s.tail ? 'rgba(255,255,255,.10)' : colorOf(s);
    const el = `<circle cx="80" cy="80" r="${R}" stroke="${color}"
      stroke-width="13" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}"/>`;
    offset += (s.ms / total) * C;
    return el;
  }).join('');
  return `<svg class="donut${opts.small ? ' sm' : ''}" viewBox="0 0 160 160">
    <circle cx="80" cy="80" r="${R}" stroke="var(--line)" stroke-width="13"/>
    ${segs}
  </svg>`;
}

/** 扇区路径：从 a0 画到 a1（弧度，0 在 3 点钟方向） */
function arcPath(cx, cy, r, a0, a1) {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${big} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

/** 亮底上写深字，暗底上写白字 */
function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? '#0e1118' : '#ffffff';
}

/** 实心饼：名字和百分比直接写在扇区里（只写占比 ≥5% 的，免得挤成一团） */
function pie(rows, total) {
  const cx = 80;
  const cy = 80;
  const R = 74;
  let a = -Math.PI / 2;
  const parts = rows.map((s) => {
    const frac = s.ms / total;
    const a0 = a;
    const a1 = a + frac * (Math.PI * 2);
    a = a1;
    const color = colorOf(s);
    const shape = frac >= 0.9999
      ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${color}"/>`
      : `<path d="${arcPath(cx, cy, R, a0, a1)}" fill="${color}" stroke="var(--glass-bg)" stroke-width="1"/>`;
    let label = '';
    if (frac >= 0.9999) {
      // 一天只有一件事：圆心里写名字，不然整块彩色里一个字都没有
      const nm = (s.type?.name || '未分类').slice(0, 5);
      label = `<text class="p-lb" x="${cx}" y="${cy}" fill="${inkFor(color)}"
        text-anchor="middle" dominant-baseline="central">${esc(nm)} 100%</text>`;
    } else if (frac >= 0.05) {
      const mid = (a0 + a1) / 2;
      const lx = cx + Math.cos(mid) * R * 0.6;
      const ly = cy + Math.sin(mid) * R * 0.6;
      const nm = (s.type?.name || '未分类').slice(0, 4);
      label = `<text class="p-lb" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${inkFor(color)}"
        text-anchor="middle" dominant-baseline="central">${esc(nm)} ${Math.round(frac * 100)}%</text>`;
    }
    return shape + label;
  }).join('');
  return `<svg class="pie" viewBox="0 0 160 160">${parts}</svg>`;
}

/** 条形：一行一个类型，长度就是占比，比读数快 */
function hBars(rows, total) {
  return `<div class="hbars">${rows.slice(0, 8).map((s) => {
    const share = (s.ms / total) * 100;
    const c = colorOf(s);
    return `<div class="hbar" style="--c:${c}">
      <span class="nm">${esc(s.type?.name || '未分类')}</span>
      <span class="t"><i style="width:${Math.max(2, share).toFixed(1)}%"></i></span>
      <span class="d">${fmtDurS(s.ms)}</span>
    </div>`;
  }).join('')}</div>`;
}

/** 主图：按选的画法切换，环形才有中心大数字 */
function chartBody(rows, total) {
  if (chartKind === 'bar') return hBars(rows, total);
  if (chartKind === 'ring') {
    return `<div class="donut-wrap">${donut(rows, total)}
      <div class="donut-c">
        <div class="v">${big(total)}</div>
        <div class="k">共记录</div>
      </div>
    </div>`;
  }
  return `<div class="donut-wrap">${pie(rows, total)}</div>`;
}

function big(ms) {
  const v = ms >= 3600000 ? (ms / 3600000).toFixed(1) : Math.round(ms / 60000);
  return `${v}<span style="font-size:14px;font-weight:500">${ms >= 3600000 ? ' 小时' : ' 分钟'}</span>`;
}

/** 占比文字：小于 1% 但不为 0 的写成「<1%」，别显示成 0% 让人以为没记录 */
function pctStr(ms, total) {
  if (!(ms > 0)) return '0%';
  const p = (ms / total) * 100;
  return p >= 1 ? `${Math.round(p)}%` : '<1%';
}

/** 周期里「一共多久」的说法：一天 24 小时 / 一周 168 小时 / 本月 30 天 / 今年 12 个月 */
function spanName(span, from) {
  if (range === 'today') return '一天 24 小时';
  if (range === 'week') return '一周 168 小时';
  if (range === 'month') return `本月 ${Math.round(span / DAY)} 天`;
  return `${new Date(from).getFullYear()} 年全年`;
}

/** 周期起止的短标签，用来解释「空白」是按哪段算的 */
function spanText(from, to) {
  const d = (t) => {
    const x = new Date(t);
    return `${x.getMonth() + 1} 月 ${x.getDate()} 日`;
  };
  if (range === 'today') return '0:00 – 24:00';
  if (range === 'week') return `${d(from)} – ${d(to - 1)}`;
  if (range === 'month') return `${d(from)} – ${d(to - 1)}`;
  const y = new Date(from).getFullYear();
  return `${y} 年 1 月 – 12 月`;
}

/** 所选周期的占比：整块饼就是这段时间的全长，没记录的部分留成灰 */
function hoursCard(now) {
  const [from, to] = bounds();
  const span = Math.max(1, to - from);
  const a = agg(from, to, now);
  const rows = paint(rowsOf(a));
  const left = Math.max(0, span - a.total);
  const pct = Math.round((a.total / span) * 100);
  const legendRows = rows.slice(0, 4);
  // 已经过去的时长 / 还没到的时长：解释「空白」里有多少是未来的
  const passed = Math.max(0, Math.min(now, to) - from);
  const future = Math.max(0, to - Math.max(now, from));
  const futureTip = future > 600000 ? `（之后 ${fmtDur(future)} 还没到）` : '';
  const blankWord = range === 'today' ? '空白' : '未记';
  return `<section class="card glass hours-card">
    <div class="card-h"><span class="card-t">${spanName(span, from)}</span>
      <span class="muted">${rangeLabel(from)} · 已记 ${pct}%</span></div>
    <div class="hours-body">
      <div class="donut-wrap">
        ${donut(rows, span, { tail: left, small: true })}
        <div class="donut-c"><div class="v" style="font-size:15px">${pct}<span style="font-size:10px;font-weight:500">%</span></div>
          <div class="k" style="font-size:10px">已记录</div></div>
      </div>
      <div class="hours-legend">
        ${legendRows.map((s) => `<span><i style="--c:${colorOf(s)}"></i>${esc(s.type?.name || '未分类')}<b>${pctStr(s.ms, span)}</b></span>`).join('')}
        ${rows.length > 4 ? `<span class="more"><i style="--c:transparent"></i>等 ${rows.length} 类</span>` : ''}
        <span><i style="--c:rgba(255,255,255,.14)"></i>${blankWord}<b>${pctStr(left, span)}</b></span>
      </div>
    </div>
    <div class="hours-foot muted">${spanText(from, to)} · 记录 ${fmtDur(a.total)} · ${blankWord} ${fmtDur(left)}${passed < span ? futureTip : ''}</div>
  </section>`;
}

function bars(from, to, now) {
  const buckets = [];
  let labels = [];
  if (range === 'today') {
    for (let h = 0; h < 24; h++) buckets.push([from + h * 3600000, from + (h + 1) * 3600000]);
    labels = ['0', '', '', '3', '', '', '6', '', '', '9', '', '', '12', '', '', '15', '', '', '18', '', '', '21', '', ''];
  } else if (range === 'week') {
    for (let d = 0; d < 7; d++) buckets.push([from + d * DAY, from + (d + 1) * DAY]);
    labels = buckets.map(([s]) => '日一二三四五六'[new Date(s).getDay()]);
  } else if (range === 'year') {
    for (let m = 0; m < 12; m++) {
      const s = new Date(from);
      s.setMonth(m);
      const e = new Date(from);
      e.setMonth(m + 1);
      buckets.push([s.getTime(), e.getTime()]);
    }
    labels = buckets.map(([s]) => `${new Date(s).getMonth() + 1}月`);
  } else {
    const days = Math.round((to - from) / DAY);
    for (let d = 0; d < days; d++) buckets.push([from + d * DAY, from + (d + 1) * DAY]);
    labels = buckets.map(([s], i) => (i === 0 || (i + 1) % 5 === 0 ? String(new Date(s).getDate()) : ''));
  }

  const per = buckets.map(([a, b]) => {
    const m = new Map();
    for (const c of clipped(a, b, now)) {
      const top = topIdOf(c.rec);
      m.set(top, (m.get(top) || 0) + c.ms);
    }
    return m;
  });

  const max = Math.max(1, ...per.map((m) => Array.from(m.values()).reduce((x, y) => x + y, 0)));

  const cols = per.map((m, i) => {
    const items = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    const last = i === per.length - 1;
    return `<div class="bar-col ${last ? 'cur' : ''}" style="--d:${i * 24}ms">${items.map(([tid, ms]) => {
      const c = tintMap.get(tid) || typeById(tid)?.color || '#8B93A7';
      return `<i style="height:${(ms / max) * 100}%;background:${c}"></i>`;
    }).join('')}</div>`;
  }).join('');

  return `<div class="bars">${cols}</div>
    <div class="bar-x">${labels.map((l) => `<span>${l}</span>`).join('')}</div>`;
}

/** 一周节奏：7 天 × 6 个 4 小时格，颜色取这段时间里占最多的类型 */
function heatCard(cur, rows) {
  if (cur.total === 0) return '';
  const max = Math.max(1, ...Array.from(cur.cell.values()));
  const order = [1, 2, 3, 4, 5, 6, 0];       // 周一开头，符合习惯
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  const lines = order.map((d, ri) => {
    const cells = [];
    for (let b = 0; b < 24 / BUCKET; b++) {
      const key = `${d}-${b}`;
      const ms = cur.cell.get(key) || 0;
      const owner = cur.cellTop.get(key);
      const color = (owner && (tintMap.get(owner.id) || typeById(owner.id)?.color)) || ACCENT;
      const alpha = ms ? (0.14 + 0.76 * (ms / max)) : 0;
      const bg = ms ? hexA(color, alpha) : 'rgba(255,255,255,.045)';
      cells.push(`<i class="hc" style="background:${bg}" title="${Math.round(ms / 60000)} 分钟"></i>`);
    }
    return `<div class="heat-row"><span class="heat-y">${names[ri]}</span>${cells.join('')}</div>`;
  }).join('');
  const top = rows[0];
  return `<section class="card glass">
    <div class="card-h"><span class="card-t">一周节奏</span>
      <span class="muted">${top ? `最多的是${esc(top.type?.name || '未分类')}` : '深浅 = 投入多少'}</span></div>
    <div class="heat">${lines}</div>
    <div class="heat-x"><span></span>${[0, 4, 8, 12, 16, 20].map((h) => `<span>${h}时</span>`).join('')}</div>
  </section>`;
}

/* 周热力图：最近 12 周 × 一周七天，每格 = 那一天的合计时长。
   和上面「一周节奏」分工不同：那边看「一周里哪个时段」，
   这边看「哪些天真的在投入」，跨十来周看连续性最直观。
   只算用户在「我的 → 关注范围」里挑出来的分组/类型；没挑就是全部。 */
const WEEKS = 12;
const LV_ALPHA = [0, 0.22, 0.42, 0.62, 0.86];

function weekHeat(now) {
  const set = focusSet();
  const curWeek = startOfWeek(now);
  const from = curWeek - (WEEKS - 1) * 7 * DAY;
  const byDay = new Map();
  let total = 0;

  for (const c of clipped(from, now, now)) {
    if (set && !set.has(c.rec.typeId)) continue;
    // 一段可能跨过零点，按天切开，不然「昨晚 23:40 到今早 0:30」会被算到一天里
    let a = c.s;
    const e = Math.min(c.e, now);
    while (a < e) {
      const d0 = startOfDay(a);
      const b = Math.min(e, d0 + DAY);
      byDay.set(d0, (byDay.get(d0) || 0) + (b - a));
      total += b - a;
      a = b;
    }
  }

  if (!total && !set) return '';     // 什么都没记、也没设范围：不占位置
  let active = 0;
  let max = 1;
  byDay.forEach((ms) => { if (ms > 0) { active += 1; if (ms > max) max = ms; } });

  const ws = state.settings.weekStart ?? 1;
  const nameOf = ['日', '一', '二', '三', '四', '五', '六'];
  const today = startOfDay(now);
  const cols = [];

  for (let w = 0; w < WEEKS; w++) {
    const wkStart = from + w * 7 * DAY;
    // 月份标签：这一周里出现了 1 号就往回贴一个，省得 12 列挤满字
    let label = '';
    for (let i = 0; i < 7; i++) {
      const d0 = wkStart + i * DAY;
      const d = new Date(d0);
      if (d.getDate() === 1 || (w === 0 && i === 0)) label = `${d.getMonth() + 1}月`;
    }
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d0 = startOfDay(wkStart + i * DAY);
      const ms = byDay.get(d0) || 0;
      const lv = ms > 0 ? Math.min(4, 1 + Math.floor((ms / max) * 3.999)) : 0;
      const d = new Date(d0);
      const tip = `${d.getMonth() + 1}月${d.getDate()}日 · ${ms ? fmtDurS(ms) : '没记录'}`;
      cells.push(`<i class="wkc l${lv}${d0 === today ? ' today' : ''}" title="${tip}" style="--a:${LV_ALPHA[lv]}"></i>`);
    }
    cols.push(`<div class="wk-col"><b>${label}</b>${cells.join('')}</div>`);
  }

  const axis = Array.from({ length: 7 }, (_, i) => `<span>${nameOf[(ws + i) % 7]}</span>`).join('');
  const hint = set
    ? `${focusSummary()} · 最近 ${WEEKS} 周共 ${fmtDur(total)}`
    : `最近 ${WEEKS} 周共 ${fmtDur(total)} · 全部类型`;
  const empty = total === 0
    ? `<div class="muted" style="margin-top:10px">这 ${WEEKS} 周里，选中的范围还没有记录。</div>`
    : '';

  return `<section class="card glass">
    <div class="card-h"><span class="card-t">周热力图</span>
      <span class="muted">${set ? esc(focusSummary()) : '全部类型'}</span></div>
    <div class="wk-wrap">
      <div class="wk-axis">${axis}</div>
      <div class="wk">${cols.join('')}</div>
    </div>
    <div class="wk-foot muted">${hint}${total ? ` · 有记录的 ${active} 天` : ''}</div>
    ${empty}
    <div class="wk-legend"><span>少</span>${LV_ALPHA.map((a) => `<i class="wkc" style="--a:${a}"></i>`).join('')}<span>多</span></div>
  </section>`;
}

function goalsCard(now) {
  if (!state.goals.length) {
    return `<section class="card glass">
      <div class="card-h"><span class="card-t">目标</span><span class="muted">还没有</span></div>
      <div class="muted">在「我的 → 目标」里给自己定一个，比如每周编程 10 小时。</div>
    </section>`;
  }
  return `<section class="card glass">
    <div class="card-h"><span class="card-t">目标</span><span class="muted">${state.goals.length} 个</span></div>
    ${state.goals.map((g) => {
      const p = goalProgress(g, now);
      const c = typeById(g.typeIds?.[0])?.color || ACCENT;
      return `<div class="goal ${p.over && g.mode === 'limit' ? 'over' : ''}" style="--c:${c}">
        <div class="goal-h">
          <span class="nm">${esc(g.name)}</span>
          <span class="st">${fmtDur(p.cur)} / ${fmtDur(p.target)}</span>
        </div>
        <div class="track"><i style="width:${Math.min(100, (p.cur / p.target) * 100).toFixed(1)}%"></i></div>
      </div>`;
    }).join('')}
  </section>`;
}

export function mount(root) {
  root.addEventListener('click', (e) => {
    const yn = e.target.closest('[data-year]');
    if (yn) {
      if (yn.disabled) return;
      yearOffset = Math.min(0, yearOffset + Number(yn.dataset.year));
      window.__app.render();
      return;
    }
    const ch = e.target.closest('[data-chart]');
    if (ch) {
      chartKind = ch.dataset.chart;
      try { localStorage.setItem(CHART_KEY, chartKind); } catch (err) { /* 隐私模式里存不下就算了 */ }
      window.__app.render();
      return;
    }
    const gr = e.target.closest('[data-grain]');
    if (gr) {
      grain = gr.dataset.grain;
      try { localStorage.setItem(GRAIN_KEY, grain); } catch (err) { /* 同上 */ }
      window.__app.render();
      return;
    }
    const b = e.target.closest('[data-range]');
    if (!b) return;
    range = b.dataset.range;
    if (range !== 'year') yearOffset = 0;
    window.__app.render();
  });
}

/** 计时在跑的时候，秒数得动：只更新文字数字（环和柱子等下次重画再对齐） */
export function tick() {
  if (typeof document === 'undefined') return;
  const root = document.querySelector('.view');
  if (!root) return;
  const run = running();
  if (!run) return;
  const now = Date.now();
  const [from, to] = bounds();
  if (now < from || now > to) return;

  const cur = agg(from, to, now);
  const sum = root.querySelector('.h-sub');
  if (sum) {
    const prev = agg(from - (to - from), from, now);
    const pct = prev.total > 0 ? ((cur.total - prev.total) / prev.total) * 100 : null;
    const peak = peakHour(cur.byHour);
    sum.textContent = `${rangeLabel(from)} · 共 ${fmtDur(cur.total)}`
      + (pct === null ? '' : ` · 比上期 ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`)
      + (cur.total && peak ? ` · 最投入 ${peak.h}–${peak.h + 1} 点` : '');
  }

  /* 只认主图那个中心数字：24 小时那块也有 .donut-c，别被这里改掉 */
  const bigEl = root.querySelector('.stats-hero .donut-c .v');
  if (bigEl) bigEl.innerHTML = big(cur.total);

  const kpis = root.querySelectorAll('.kpis .kpi b');
  if (kpis.length === 4) {
    const span = Math.max(1, Math.min(to, now) - from);
    const days = Math.max(1, Math.round(span / DAY) || 1);
    kpis[0].textContent = fmtDur(cur.total / days);
    kpis[1].textContent = String(cur.count);
    kpis[3].textContent = fmtDur(Math.max(0, span - cur.total));
  }
}
