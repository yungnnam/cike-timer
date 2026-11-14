/* 此刻：状态卡 + 类型网格 + 24 小时墨带 */

import {
  state, running, elapsed, typeById, startType, stopRunning, pauseRunning,
  resumeRunning, clipped, totalMs, startOfDay, dayMs, isPaused, saveSettings,
  groupList, plainTypes, childTypes, moveType,
} from '../store.js';
import { fmtTimer, fmtDur, fmtDurS, fmtClock, fmtDay, hexA, snap } from '../format.js';
import { openRecordEditor, openTypePicker, toast, esc } from '../ui.js';
import { openTypeEditor } from '../editors.js';
import { flash, haptic } from '../motion.js';

const DAY = 86400000;

export function render() {
  const now = Date.now();
  const cur = running();
  const dayStart = startOfDay(now);
  const total = totalMs(dayStart, dayStart + DAY, now);

  return `
  <div class="top">
    <div>
      <h1 class="h-title">此刻</h1>
      <div class="h-sub">${fmtDay(now, state.settings.dayStart || 0)} · 今天已记 ${fmtDur(total)}</div>
    </div>
    <div class="h-act">
      <button class="icon-btn" data-act="add-past" title="补记">
        <svg class="ic sm"><use href="#i-plus"/></svg>
      </button>
    </div>
  </div>

  ${statusHtml(now, cur)}

  ${state.settings.tipDone || state.records.length ? '' : `
  <div class="tip glass" data-tip>
    <b>使用说明</b>
    <div>点击类型开始计时，再次点击停止；<br>在时间轴上按住拖动可补记一段时间；<br>长按胶囊或大格子可拖动排序、更换分组。</div>
    <button class="tip-x" data-act="tip-done" aria-label="知道了"><svg class="ic sm"><use href="#i-x"/></svg></button>
  </div>`}

  ${groupList().map((g) => groupCard(g, now, cur)).join('')}

  <div class="grid">
    ${plainTypes().map((t) => {
      const ms = dayMs(now, t.id);
      const on = cur && cur.typeId === t.id;
      return `<button class="tile glass ${on ? 'on' : ''}" data-type="${t.id}" style="--c:${t.color}">
        <span class="tic"><svg class="ic"><use href="#i-t-${t.icon || 'book'}"/></svg></span>
        <span class="tdot"></span>
        <span class="tname">${esc(t.name)}</span>
        <span class="tuse">${ms > 0 ? fmtDurS(ms) : '—'}</span>
      </button>`;
    }).join('')}
    <button class="tile glass add" data-act="new-type">
      <span class="plus"><svg class="ic sm"><use href="#i-plus"/></svg></span>
      <span class="tname">新类型</span>
    </button>
    <button class="tile glass add" data-act="new-group">
      <span class="plus"><svg class="ic sm"><use href="#i-layers"/></svg></span>
      <span class="tname">新分组</span>
    </button>
  </div>

  ${ribbon(now, dayStart)}
  `;
}

/* ---------------- 状态卡 ---------------- */

function statusHtml(now, cur) {
  const curType = cur ? typeById(cur.typeId) : null;
  const color = curType?.color || '#6C7BFF';
  const dayStart = startOfDay(now);
  const todayMs = totalMs(dayStart, dayStart + DAY, now);

  if (!cur) {
    return `
  <section class="status glass" style="--c:rgba(108,123,255,.55)">
    <div class="s-top"><span>尚未开始 · 点击下方任意类型开始计时</span></div>
    <div class="timer idle">00:00</div>
    <div class="s-meta"><span>今天已记 <b>${fmtDur(todayMs)}</b></span><span>空白 <b>${fmtDur(Math.max(0, now - dayStart - todayMs))}</b></span></div>
    <div class="row">
      <button class="btn primary" data-act="pick">
        <svg class="ic sm"><use href="#i-play"/></svg>开始记录
      </button>
    </div>
  </section>`;
  }

  return `
  <section class="status glass" style="--c:${color}">
    <div class="s-top">
      ${isPaused(cur) ? '<span class="live" style="animation:none;opacity:.45"></span>' : '<span class="live"></span>'}
      <span class="name">${esc(curType?.name || '未分类')}</span>
      <span>${isPaused(cur) ? '已暂停' : '进行中'}</span>
    </div>
    <div class="timer" data-timer>${fmtTimer(elapsed(cur, now))}</div>
    <div class="s-meta">
      <span>开始 <b>${fmtClock(cur.start)}</b></span>
      <span>今天 <b data-today>${fmtDur(todayMs)}</b></span>
    </div>
    <div class="row">
      <button class="btn" data-act="${isPaused(cur) ? 'resume' : 'pause'}">
        <svg class="ic sm"><use href="#i-${isPaused(cur) ? 'play' : 'pause'}"/></svg>
        ${isPaused(cur) ? '继续' : '暂停'}
      </button>
      <button class="btn primary" style="--c:${color}" data-act="stop">
        <svg class="ic sm"><use href="#i-stop"/></svg>停止
      </button>
    </div>
  </section>`;
}

/** 只重画「开始/停止/暂停」影响到的那几块，不重建整个页面。
    返回 true 表示已经处理完，外面不用再整页渲染。 */
export function patchTimer(root) {
  if (!root) return false;
  const status = root.querySelector('.status');
  if (!status) return false;

  const now = Date.now();
  const cur = running();
  const tmp = document.createElement('div');
  tmp.innerHTML = statusHtml(now, cur);
  const fresh = tmp.firstElementChild;

  status.className = fresh.className;
  status.setAttribute('style', fresh.getAttribute('style') || '');
  status.innerHTML = fresh.innerHTML;
  flash(status);

  const curId = cur?.typeId || null;
  root.querySelectorAll('[data-type]').forEach((btn) => {
    const on = btn.dataset.type === curId;
    btn.classList.toggle('on', on);
    if (btn.classList.contains('gplay')) {
      const icon = on ? (isPaused(cur) ? 'play' : 'stop') : 'play';
      btn.innerHTML = `<svg class="ic sm"><use href="#i-${icon}"/></svg>`;
    }
  });

  refreshSums(root);
  tick(now);
  return true;
}

/** 拖动排序之后只刷新数字：分组合计、每个胶囊/格子的今日时长。
    不重画 DOM，所以卡片不会又摊一遍。 */
export function refreshSums(root) {
  if (!root) return false;
  const now = Date.now();
  root.querySelectorAll('.gcard').forEach((card) => {
    const sum = card.querySelector('.gsum');
    if (!sum) return;
    const ms = dayMs(now, card.dataset.g);
    sum.textContent = ms > 0 ? fmtDurS(ms) : '今天还没记';
  });
  root.querySelectorAll('[data-type]').forEach((el) => {
    const slot = el.classList.contains('tile') ? el.querySelector('.tuse')
      : el.classList.contains('pill') ? el.querySelector('.pt') : null;
    if (!slot) return;
    const ms = dayMs(now, el.dataset.type);
    slot.textContent = ms > 0 ? fmtDurS(ms) : '—';
  });
  return true;
}

/* ---------------- 分组卡片 ---------------- */

const FOLD_KEY = 'cike:fold';
const folded = new Set((() => {
  try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '[]'); } catch { return []; }
})());

function isFolded(id) { return folded.has(id); }

export function toggleFold(id) {
  if (folded.has(id)) folded.delete(id); else folded.add(id);
  try { localStorage.setItem(FOLD_KEY, JSON.stringify([...folded])); } catch { /* 忽略 */ }
}

function groupCard(g, now, cur) {
  const kids = childTypes(g.id);
  const ms = dayMs(now, g.id);
  const on = cur && cur.typeId === g.id;
  const paused = on && isPaused(cur);
  const open = !isFolded(g.id);

  const pills = kids.map((c) => {
    const cms = dayMs(now, c.id);
    const con = cur && cur.typeId === c.id;
    return `<button class="pill ${con ? 'on' : ''}" data-type="${c.id}" style="--c:${c.color}">
      <i class="cdot"></i>
      <span class="pn">${esc(c.name)}</span>
      <span class="pt">${cms > 0 ? fmtDurS(cms) : '—'}</span>
    </button>`;
  }).join('');

  return `
  <section class="gcard glass" data-g="${g.id}" style="--c:${g.color}">
    <div class="gh">
      <button class="gfold ${open ? 'on' : ''}" data-fold="${g.id}" aria-label="${open ? '收起' : '展开'}">
        <svg class="ic sm"><use href="#i-chevron"/></svg>
      </button>
      <span class="gdot"></span>
      <button class="gname" data-edit="${g.id}">${esc(g.name)}</button>
      <span class="gsum">${ms > 0 ? fmtDurS(ms) : '今天还没记'}</span>
      <button class="gplay ${on ? 'on' : ''}" data-type="${g.id}" aria-label="记录${esc(g.name)}">
        <svg class="ic sm"><use href="#i-${on ? (paused ? 'play' : 'stop') : 'play'}"/></svg>
      </button>
    </div>
    <div class="gbody ${open ? '' : 'hide'}">
      <div class="gtiles">
        ${pills}
      </div>
      ${kids.length ? '' : '<div class="ghint">该分组暂无子类型 · 可在「我的 → 类型」中添加</div>'}
    </div>
  </section>`;
}

function ribbon(now, dayStart) {
  const entries = clipped(dayStart, dayStart + DAY, now);
  const segs = entries.map((c) => {
    const t = typeById(c.rec.typeId);
    const left = ((c.s - dayStart) / DAY) * 100;
    const w = Math.max((c.ms / DAY) * 100, 0.28);
    const run = c.rec.end == null;
    return `<div class="seg ${run ? 'run' : ''} ${c.rec.pausedAt ? 'paused' : ''}"
      data-rid="${c.rec.id}" ${run ? 'data-seg-run' : ''}
      style="left:${left}%;width:${w}%;--c:${t?.color || '#8B93A7'}"></div>`;
  }).join('');

  const nowLeft = ((now - dayStart) / DAY) * 100;
  const total = totalMs(dayStart, dayStart + DAY, now);
  const labels = [0, 6, 12, 18, 24].map((h) => {
    const d = new Date(dayStart + h * 3600000);
    return h === 24 ? `${new Date(dayStart).getHours() === 0 ? '24' : d.getHours()}时` : `${d.getHours()}时`;
  });

  return `<section class="ribbon glass">
    <div class="r-head">
      <span>今天 · 24 小时</span>
      <span><b>${fmtDur(total)}</b> 已记 · <b>${fmtDur(Math.max(0, DAY - total))}</b> 空白</span>
    </div>
    <div class="rbar" data-rbar>
      ${segs}
      <div class="nowline" data-now style="left:${nowLeft}%"></div>
    </div>
    <div class="hours">${labels.map((l) => `<span>${l}</span>`).join('')}</div>
  </section>`;
}

/* ---------------- 交互 ---------------- */

export function mount(root) {
  root.addEventListener('click', (e) => {
    const fold = e.target.closest('[data-fold]');
    if (fold) {
      const id = fold.dataset.fold;
      toggleFold(id);
      const card = fold.closest('.gcard');
      const body = card?.querySelector('.gbody');
      const open = !isFolded(id);
      fold.classList.toggle('on', open);
      fold.setAttribute('aria-label', open ? '收起' : '展开');
      body?.classList.toggle('hide', !open);
      return;
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      openTypeEditor(typeById(edit.dataset.edit));
      return;
    }
    const typeBtn = e.target.closest('[data-type]');
    if (typeBtn) {
      const id = typeBtn.dataset.type;
      const cur = running();
      if (cur && cur.typeId === id) {
        haptic(14);
        // 暂停中的再点一下就是继续，别的按钮才是停止
        if (isPaused(cur)) { resumeRunning(); return; }
        stopRunning().then((kept) => {
          toast(kept ? '已停止并保存' : '记录时间过短，未保存（可在设置中关闭此限制）', { undoable: true });
        });
        return;
      }
      // 先把这一格点亮，等它画出来再换状态卡 —— 点击有即时反回，不会「等一下才动」
      typeBtn.classList.add('on');
      haptic(10);
      requestAnimationFrame(() => startType(id));
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'stop') {
      haptic(14);
      stopRunning().then((kept) => {
        toast(kept ? '已停止并保存' : '记录时间过短，未保存（可在设置中关闭此限制）', { undoable: true });
      });
    }
    if (act === 'pause') { haptic(10); pauseRunning(); }
    if (act === 'resume') { haptic(10); resumeRunning(); }
    if (act === 'pick') openTypePicker({ onPick: (id) => startType(id) });
    if (act === 'add-past') {
      const now = Date.now();
      openRecordEditor({ start: now - 30 * 60000, end: now });
    }
    if (act === 'new-type') openTypeEditor(null);
    if (act === 'new-group') openTypeEditor(null, { isGroup: true });
    if (act === 'tip-done') {
      haptic(8);
      const tip = e.target.closest('[data-tip]');
      if (tip) {
        tip.style.transition = 'opacity .22s, transform .22s';
        tip.style.opacity = '0';
        tip.style.transform = 'translateY(-6px)';
        setTimeout(() => tip.remove(), 240);
      }
      saveSettings({ tipDone: true });
    }
  });

  mountRibbon(root);
  mountKidsDrag(root);
}

/* ---------------- 拖动排序：胶囊和大格子都能拖 ----------------
   手指长按 260ms（鼠标拖 7px）拎起来：浮起来的副本跟着手走，原位变成虚线空位。
   三个落点：别的分组（换组）、没分组的大格子网格（取消分组）、原处调顺序。 */

const ITEM = '.pill[data-type], .tile[data-type]';
const LONG_PRESS = 260;
const MOUSE_SLOP = 7;
const TOUCH_SLOP = 12;

let dragState = null;
let pendingPress = null;
let docBound = false;

function bindDoc() {
  if (docBound) return;
  docBound = true;
  document.addEventListener('pointermove', onDragMove, { passive: true });
  document.addEventListener('pointerup', onDragEnd);
  document.addEventListener('pointercancel', onDragEnd);
  // 页面一开始滚，就说明手指不是要拎东西
  window.addEventListener('scroll', () => {
    if (pendingPress) { clearTimeout(pendingPress.timer); pendingPress = null; }
  }, { passive: true, capture: true });
}

/* 拖动的时候才拦页面滚动。
   早先这里挂了一个常驻的 { passive: false } touchmove —— 只要页面上有非 passive 的
   touchmove 监听，浏览器每个触摸移动都要先问一句 JS 才敢滚，整个 App 就变得「推不动」。
   现在改成拎起来的那一刻才挂，松手立刻摘掉。 */
let touchBlocker = null;
function blockScroll(on) {
  if (on && !touchBlocker) {
    touchBlocker = (e) => { if (dragState) e.preventDefault(); };
    document.addEventListener('touchmove', touchBlocker, { passive: false });
  } else if (!on && touchBlocker) {
    document.removeEventListener('touchmove', touchBlocker);
    touchBlocker = null;
  }
}

function mountKidsDrag(root) {
  bindDoc();
  root.addEventListener('pointerdown', onDragDown);
}

function onDragDown(e) {
  if (dragState) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const el = e.target.closest(ITEM);
  if (!el || el.classList.contains('add')) return;
  pendingPress = {
    el, id: el.dataset.type, x: e.clientX, y: e.clientY,
    touch: e.pointerType !== 'mouse', timer: null,
  };
  if (pendingPress.touch) {
    pendingPress.timer = setTimeout(() => beginDrag(pendingPress.x, pendingPress.y), LONG_PRESS);
  }
}

function onDragMove(e) {
  if (dragState) { moveDrag(e); return; }
  if (!pendingPress) return;
  const dist = Math.hypot(e.clientX - pendingPress.x, e.clientY - pendingPress.y);
  if (dist < (pendingPress.touch ? TOUCH_SLOP : MOUSE_SLOP)) return;
  if (pendingPress.touch) {
    // 长按还没到就先动了 → 用户是在滚页面，放弃这次拖动
    clearTimeout(pendingPress.timer);
    pendingPress = null;
    return;
  }
  beginDrag(e.clientX, e.clientY);
}

function beginDrag(x, y) {
  if (!pendingPress) return;
  clearTimeout(pendingPress.timer);
  const { el, id } = pendingPress;
  pendingPress = null;

  const rect = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.classList.remove('on', 'down', 'drag-src');
  ghost.classList.add('dragghost');
  ghost.setAttribute('style',
    `${el.getAttribute('style') || ''};left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`);
  document.body.appendChild(ghost);

  el.classList.add('drag-src');
  document.body.classList.add('is-dragging');
  dragState = {
    id, src: el, ghost, rect0: rect, sx: x, sy: y, moved: false,
    zone: null,
    homeParent: el.parentElement,
    homeNext: el.nextElementSibling,
  };
  haptic(12);
  blockScroll(true);
}

/** 手指下面是哪个落点区：分组里的 .gtiles，或没分组大格子的 .grid */
function zoneAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || !el.closest) return null;
  const card = el.closest('.gcard');
  if (card) {
    const host = card.querySelector('.gtiles');
    return host ? { host, parentId: card.dataset.g, card } : null;
  }
  const grid = el.closest('.grid');
  if (grid) return { host: grid, parentId: null, card: null };
  return null;
}

function moveDrag(e) {
  const d = dragState;
  if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 3) d.moved = true;
  d.ghost.style.transform =
    `translate3d(${e.clientX - d.sx}px, ${e.clientY - d.sy}px, 0) scale(1.03)`;

  const zone = zoneAt(e.clientX, e.clientY);
  if (!zone) return;

  // 拖到折起来的分组上：自动展开，好让东西能落进去
  const body = zone.card?.querySelector('.gbody');
  if (body && body.classList.contains('hide')) {
    toggleFold(zone.card.dataset.g);
    body.classList.remove('hide');
    zone.card.querySelector('.gfold')?.classList.add('on');
  }

  if (zone.card !== d.zone?.card) {
    d.zone?.card?.classList.remove('drop-hot');
    zone.card?.classList.add('drop-hot');
  }
  d.zone = zone;
  placeItem(zone.host, d.src, e.clientX, e.clientY);
}

/** 按「阅读顺序」（先上后下、同行先左后右）找插在哪；末尾的「＋」按钮永远排最后 */
function placeItem(host, src, x, y) {
  const kids = [...host.querySelectorAll(ITEM)].filter((el) => el !== src);
  const tail = [...host.children].find((el) => el.classList.contains('add')) || null;

  let before = null;
  for (const el of kids) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (y < cy - r.height * 0.34 || (y <= cy + r.height * 0.34 && x < cx)) { before = el; break; }
  }

  if (before) {
    if (src.nextElementSibling !== before) host.insertBefore(src, before);
  } else if (tail) {
    if (src.nextElementSibling !== tail) host.insertBefore(src, tail);
  } else if (host.lastElementChild !== src) {
    host.appendChild(src);
  }
}

function onDragEnd() {
  if (!dragState) {
    if (pendingPress) { clearTimeout(pendingPress.timer); pendingPress = null; }
    return;
  }
  const d = dragState;
  dragState = null;
  blockScroll(false);
  document.body.classList.remove('is-dragging');
  d.zone?.card?.classList.remove('drop-hot');
  d.src.classList.remove('drag-src');

  // 松手后这一下点击不应该被当成「开始计时」
  const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  document.addEventListener('click', swallow, true);
  setTimeout(() => document.removeEventListener('click', swallow, true), 360);

  // 没落在任何区域（拖到墨带、空白处松手）→ 退回原位，什么都不改
  if (!d.zone) {
    d.homeParent?.insertBefore(d.src, d.homeNext || null);
    settleGhost(d);
    return;
  }

  const to = d.src.getBoundingClientRect();
  d.ghost.style.transition = 'transform .24s var(--ease), opacity .18s';
  d.ghost.style.transform =
    `translate3d(${to.left - d.rect0.left}px, ${to.top - d.rect0.top}px, 0) scale(1)`;
  d.ghost.style.opacity = '0';
  setTimeout(() => d.ghost.remove(), 260);

  const parentId = d.zone.parentId;
  let beforeId = null;
  for (let el = d.src.nextElementSibling; el; el = el.nextElementSibling) {
    if (el.matches?.(ITEM)) { beforeId = el.dataset.type; break; }
  }

  const oldParent = typeById(d.id)?.parentId || null;
  const wasInGrid = !!d.homeParent?.classList.contains('grid');
  const nowInGrid = !!d.zone.host.classList.contains('grid');
  if (beforeId === d.id) return;

  moveType(d.id, parentId, beforeId).then((res) => {
    if (!res.ok) {
      if (res.why === 'has-kids') toast(`「${typeById(d.id)?.name || '这个类型'}」里面有子类型，不能再塞进别的分组`);
      else if (res.why === 'too-deep') toast('只能两层：分组里不能再放分组');
      window.__app?.render?.();
      return;
    }
    if ((parentId || null) !== oldParent) {
      haptic(10);
      toast(`已移到「${typeById(parentId)?.name || '未分组'}」`, { undoable: true });
    }
    // 胶囊 ↔ 大格子换了形状，必须重画；只是调顺序就只刷数字
    if (wasInGrid !== nowInGrid) window.__app?.render?.();
    else refreshSums(document.querySelector('.view'));
  });
}

function settleGhost(d) {
  d.ghost.style.transition = 'transform .2s var(--ease), opacity .15s';
  d.ghost.style.opacity = '0';
  setTimeout(() => d.ghost.remove(), 210);
}

function mountRibbon(root) {
  const bar = root.querySelector('[data-rbar]');
  if (!bar) return;

  let drag = null;
  let draftEl = null;

  const frac = (x) => {
    const r = bar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / r.width));
  };
  const timeAt = (x) => startOfDay(Date.now()) + frac(x) * DAY;

  const paint = () => {
    if (!drag || !draftEl) return;
    const a = Math.min(drag.t0, drag.t1);
    const b = Math.max(drag.t0, drag.t1);
    const ds = startOfDay(Date.now());
    draftEl.style.left = `${((a - ds) / DAY) * 100}%`;
    draftEl.style.width = `${Math.max(((b - a) / DAY) * 100, 0.3)}%`;
    if (drag.moved) {
      tipEl.textContent = `${fmtClock(a)}–${fmtClock(b)} · ${fmtDur(b - a)}`;
      tipEl.classList.add('on');
    }
  };

  let tipEl = document.createElement('div');
  tipEl.className = 'rdrag';
  bar.parentElement.appendChild(tipEl);

  bar.addEventListener('pointerdown', (e) => {
    const seg = e.target.closest('.seg');
    if (seg) {
      const rec = state.records.find((r) => r.id === seg.dataset.rid);
      if (rec) openRecordEditor({ rec });
      return;
    }
    e.preventDefault();
    try { bar.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 */ }
    const t = snap(timeAt(e.clientX), 5 * 60000);
    drag = { startX: e.clientX, t0: t, t1: t + 5 * 60000, moved: false };
    draftEl = document.createElement('div');
    draftEl.className = 'seg draft';
    bar.appendChild(draftEl);
    paint();
  });

  bar.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.startX) > 6) drag.moved = true;
    drag.t1 = snap(timeAt(e.clientX), 5 * 60000);
    paint();
  });

  const finish = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    const el = draftEl;
    draftEl = null;
    if (el) el.remove();
    tipEl.classList.remove('on');

    const ds = startOfDay(Date.now());
    let a;
    let b;
    if (!d.moved) {
      b = Math.min(d.t0, Date.now());
      a = b - 30 * 60000;
    } else {
      a = Math.min(d.t0, d.t1);
      b = Math.max(d.t0, d.t1);
      if (b - a < 5 * 60000) b = a + 5 * 60000;
    }
    if (b <= ds || a >= ds + DAY) return;
    const s = Math.max(a, ds);
    const e = Math.min(b, Date.now());
    // 只拖到「现在以后」的地方没有可记的时间，别弹一个 0 分钟的抽屉
    if (e - s < 60000) {
      toast('所选时间尚未到达，无法记录');
      return;
    }
    openRecordEditor({ start: s, end: e });
  };

  bar.addEventListener('pointerup', finish);
  bar.addEventListener('pointercancel', () => {
    if (draftEl) draftEl.remove();
    drag = null; draftEl = null;
    tipEl.classList.remove('on');
  });
}

/* ---------------- 每秒刷新 ---------------- */

export function tick(now = Date.now()) {
  const cur = running();
  const ds = startOfDay(now);

  const t = document.querySelector('[data-timer]');
  if (t && cur) t.textContent = fmtTimer(elapsed(cur, now));

  const nl = document.querySelector('[data-now]');
  if (nl) nl.style.left = `${((now - ds) / DAY) * 100}%`;

  const total = totalMs(ds, ds + DAY, now);

  // 合计跟着秒走：不重画页面，只改几处文字，跑着的时候数字才是活的
  const meta = document.querySelector('[data-today]');
  if (meta) meta.textContent = fmtDur(total);
  const sub = document.querySelector('.h-sub');
  if (sub) sub.textContent = `${fmtDay(now, state.settings.dayStart || 0)} · 今天已记 ${fmtDur(total)}`;
  const rh = document.querySelector('.r-head span:last-child');
  if (rh) rh.innerHTML = `<b>${fmtDur(total)}</b> 已记 · <b>${fmtDur(Math.max(0, DAY - total))}</b> 空白`;

  if (cur) {
    const seg = document.querySelector('[data-seg-run]');
    if (seg) {
      const s = Math.max(cur.start, ds);
      const e = cur.pausedAt != null ? cur.pausedAt : now;
      seg.style.left = `${((s - ds) / DAY) * 100}%`;
      seg.style.width = `${Math.max(((e - s) / DAY) * 100, 0.28)}%`;
    }
  }
}
