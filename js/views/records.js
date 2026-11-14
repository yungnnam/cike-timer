/* 记录：按天分组、搜索、范围筛选
   列表用「区间裁剪后的段」来渲染：昨晚 23:00 睡到今天 06:00 的睡眠，
   在今天这一页里显示成 00:00–06:00 的 6 小时，跟墨带和统计口径一致。 */

import {
  state, typeById, elapsed, startOfDay, startOfWeek, startOfMonth, clipped,
} from '../store.js';
import { fmtDur, fmtDurS, fmtClock, fmtDay, fmtWeekday, dayStartOf, fmtTimer } from '../format.js';
import { openRecordEditor, esc } from '../ui.js';
import { unfoldRows } from '../motion.js';

const DAY = 86400000;
let range = 'today';
let query = '';
let searching = false;

function bounds() {
  const now = Date.now();
  const ds = startOfDay(now);
  if (range === 'yesterday') return [ds - DAY, ds];
  if (range === 'week') { const s = startOfWeek(now); return [s, s + 7 * DAY]; }
  if (range === 'month') {
    const s = startOfMonth(now);
    const d = new Date(s); d.setMonth(d.getMonth() + 1);
    return [s, d.getTime()];
  }
  return [ds, ds + DAY];
}

function match(rec, q) {
  if (!q) return true;
  const tt = typeById(rec.typeId);
  const name = `${tt?.name || ''} ${tt?.parentId ? (typeById(tt.parentId)?.name || '') : ''}`.toLowerCase();
  return name.includes(q) || (rec.note || '').toLowerCase().includes(q)
    || (rec.tags || []).join(' ').toLowerCase().includes(q);
}

/** 这个范围内的所有段（跨天的会被裁到边界），新的在上面 */
function segs() {
  const [from, to] = bounds();
  const q = query.trim().toLowerCase();
  return clipped(from, to, Date.now())
    .filter((c) => match(c.rec, q))
    .reverse();
}

export function render() {
  const list = segs();
  const sum = list.reduce((a, c) => a + c.ms, 0);
  const now = Date.now();

  return `
  <div class="top">
    <div>
      <h1 class="h-title">记录</h1>
      <div class="h-sub">${list.length} 条 · 合计 ${fmtDur(sum)}</div>
    </div>
    <div class="h-act">
      <button class="icon-btn" data-act="search">
        <svg class="ic sm"><use href="#i-${searching ? 'x' : 'search'}"/></svg>
      </button>
      <button class="icon-btn" data-act="add" style="color:var(--text)">
        <svg class="ic sm"><use href="#i-plus"/></svg>
      </button>
    </div>
  </div>

  <div class="chips">
    ${[['today', '今天'], ['yesterday', '昨天'], ['week', '本周'], ['month', '本月']]
      .map(([v, l]) => `<button class="chip ${range === v ? 'on' : ''}" data-range="${v}">${l}</button>`).join('')}
  </div>

  ${searching ? `<div class="field" style="margin-top:12px">
      <input class="inp" data-search placeholder="搜类型、备注、标签" value="${esc(query)}" autofocus>
    </div>` : ''}

  <div class="rec-body">${listHtml(list, now)}</div>`;
}

function listHtml(list, now) {
  if (!list.length) {
    return `<div class="empty">${query ? '没有匹配结果，请更换关键词' : '这段时间还没有记录<br>回到「此刻」点击类型即可开始'}</div>`;
  }
  const groups = new Map();
  for (const c of list) {
    const k = dayStartOf(c.s, state.settings.dayStart || 0);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  return Array.from(groups.entries()).map(([k, arr]) => {
    const total = arr.reduce((a, c) => a + c.ms, 0);
    return `<div class="day-group">
      <div class="day-h"><span class="d">${fmtDay(k, state.settings.dayStart || 0)} · ${fmtWeekday(k)}</span><span class="t">${fmtDur(total)}</span></div>
      ${arr.map((c) => rowHtml(c, now)).join('')}
    </div>`;
  }).join('');
}

function rowHtml(c, now) {
  const r = c.rec;
  const t = typeById(r.typeId);
  const parent = t?.parentId ? typeById(t.parentId) : null;
  const color = t?.color || '#8B93A7';
  const run = r.end == null && r.pausedAt == null;
  const paused = r.pausedAt != null;
  const openEnd = r.end != null ? r.end : (r.pausedAt != null ? r.pausedAt : now);
  // 这条记录是不是被这一页的边界切开过
  const cut = c.s !== r.start || c.e !== openEnd;
  const sub = [
    `${fmtClock(c.s)} – ${fmtClock(c.e)}`,
    cut ? '跨天' : '',
    r.note ? esc(r.note) : '',
  ].filter(Boolean).join(' · ');
  return `<button class="rec" data-rid="${r.id}" style="--c:${color}">
    <i class="rail"></i>
    <span class="mid">
      <span class="nm">${parent ? `<b class="par">${esc(parent.name)}</b>${esc(t.name)}` : esc(t?.name || '未分类')}${run ? '<span class="pin">进行中</span>' : (paused ? '<span class="pin">暂停</span>' : '')}</span>
      <span class="sub">${sub}</span>
    </span>
    <span class="dur">${run ? fmtTimer(c.ms) : fmtDurS(c.ms)}</span>
  </button>`;
}

export function mount(root) {
  root.addEventListener('click', (e) => {
    const rangeBtn = e.target.closest('[data-range]');
    if (rangeBtn) { range = rangeBtn.dataset.range; window.__app.render(); return; }

    const rec = e.target.closest('[data-rid]');
    if (rec) {
      const r = state.records.find((x) => x.id === rec.dataset.rid);
      if (r) openRecordEditor({ rec: r });
      return;
    }

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'search') {
      searching = !searching;
      if (!searching) query = '';
      window.__app.render();
    }
    if (act === 'add') {
      const now = Date.now();
      openRecordEditor({ start: now - 30 * 60000, end: now });
    }
  });

  const input = root.querySelector('[data-search]');
  if (input) {
    input.addEventListener('input', () => {
      query = input.value;
      const body = root.querySelector('.rec-body');
      if (body) {
        body.innerHTML = listHtml(segs(), Date.now());
        unfoldRows(body, 16, 10);
      }
    });
    setTimeout(() => input.focus(), 60);
  }

  // 记录一格一格摊开，不是整块砸下来
  unfoldRows(root.querySelector('.rec-body'), 28, 12);
}

/** 每秒只改「进行中」那一条的秒数和顶部合计，不重画整页 */
export function tick() {
  if (typeof document === 'undefined') return;
  const root = document.querySelector('.view');
  if (!root) return;
  const now = Date.now();
  const [from, to] = bounds();
  const r = state.records.find((x) => x.end == null);
  if (r) {
    const row = root.querySelector(`.rec[data-rid="${r.id}"]`);
    const dur = row?.querySelector('.dur');
    // 暂停的那条时长是定住的，只有真在跑才往上跳
    if (dur && r.pausedAt == null) dur.textContent = fmtTimer(elapsed(r, now));
  }
  const sub = root.querySelector('.h-sub');
  if (sub) {
    const list = clipped(from, to, now).filter((c) => match(c.rec, query.trim().toLowerCase()));
    sub.textContent = `${list.length} 条 · 合计 ${fmtDur(list.reduce((a, c) => a + c.ms, 0))}`;
  }
}
