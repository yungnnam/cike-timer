/* 通用 UI：抽屉、提示条、记录编辑 */

import {
  state, typeById, addRecord, updateRecord, deleteRecord, undo, canUndo,
  topTypes, childTypes,
} from './store.js';
import { fmtDur, toLocalInput, fromLocalInput, hexA } from './format.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---------------- 抽屉 ---------------- */

// 还开着的抽屉，每家都登记一个 close。这样「返回键一口气全关」时也能走完整的
// 收尾流程（摘监听、解锁页面滚动），而不是把 DOM 一清了事。
const liveSheets = new Set();

export function openSheet({ title = '', sub = '', body = '', foot = '', onMount, dismissible = true }) {
  const root = document.getElementById('sheet-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  if (title) sheet.setAttribute('aria-label', title);
  sheet.innerHTML = `
    <div class="grab" aria-hidden="true"></div>
    <div class="handle"></div>
    ${title ? `<div class="sheet-h"><div class="sheet-t">${title}</div></div>` : ''}
    ${sub ? `<div class="sheet-sub">${sub}</div>` : ''}
    <div class="sheet-body">${body}</div>
    ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}`;
  root.append(backdrop, sheet);
  // 抽屉开着的时候别让底下的列表跟着手指滚
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => {
    backdrop.classList.add('in');
    sheet.classList.add('in');
  });
  let closed = false;
  // 拖动状态与「压住原生滚动」的临时监听（函数提前声明，close() 里要用）
  let dragY = 0;
  let startY = 0;
  let dragging = false;
  let dragId = -1;
  let guard = null;
  const holdNativeScroll = () => {
    if (guard) return;
    guard = (ev) => { if (dragging) ev.preventDefault(); };
    document.addEventListener('touchmove', guard, { passive: false });
  };
  const releaseNativeScroll = () => {
    if (!guard) return;
    document.removeEventListener('touchmove', guard);
    guard = null;
  };
  const onKey = (ev) => { if (ev.key === 'Escape' && dismissible) close(); };
  document.addEventListener('keydown', onKey);
  const close = () => {
    if (closed) return;
    closed = true;
    liveSheets.delete(close);
    releaseNativeScroll();
    removeTouchHandlers();
    backdrop.classList.remove('in');
    sheet.classList.remove('in');
    // 淡出的这 420ms 里，遮罩和抽屉都别再挡路：否则刚关掉就点一下，
    // 那一下会被还在淡出的遮罩吃掉，看着就是「点了没反应」。
    sheet.classList.add('closing');
    backdrop.style.pointerEvents = 'none';
    sheet.style.pointerEvents = 'none';
    // 已经关掉了就立刻解锁页面滚动，不用等动画走完
    if (!root.querySelector('.sheet:not(.closing)')) document.body.classList.remove('sheet-open');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    setTimeout(() => {
      backdrop.remove();
      sheet.remove();
      if (!root.querySelector('.sheet')) document.body.classList.remove('sheet-open');
    }, 420);
  };
  if (dismissible) backdrop.addEventListener('click', close);
  liveSheets.add(close);

  // 抽屉本身是滚动容器（overflow-y:auto），手指一往下拉，浏览器会先把它当成
  // 「滚动」并派 pointercancel —— 位移就只剩一帧，永远拖不到 96px。
  // 所以在真正开始拖动期间，临时挂一个非 passive 的 touchmove 把默认滚动压住，
  // 只在这次手势内有效，松手立刻摘掉（不影响抽屉内部列表的日常滚动）。

  const swallowClick = () => {
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 80);
  };

  // 真正在滚的是 .sheet-body，不是 .sheet（.sheet 自己 overflow:hidden）。
  // 之前量的是 .sheet，它永远「没有溢出」，于是抽屉里任何位置往下拉都被当成「关抽屉」，
  // 顺手又把 touchmove 压住 —— 表现就是长表单「划不动」。
  const scroller = () => sheet.querySelector('.sheet-body') || sheet;

  /**
   * 「算不算在顶部」。不能严格 === 0：滚动回弹、亚像素取整都会留下 1~3px，
   * 那点余量会让「往下拉关抽屉」时灵时不灵（实测抓到过 scrollTop = 2）。
   */
  const atTop = () => scroller().scrollTop <= 8;

  /** 手指还没决定往哪走之前的待定状态（不压滚动、不动 transform） */
  let candidate = null;
  let grabbing = false;

  const beginDrag = () => {
    dragging = true;
    sheet.classList.add('dragging');
    holdNativeScroll();
  };

  const endDrag = () => {
    dragging = false;
    candidate = null;
    dragId = -1;
    releaseNativeScroll();
    sheet.classList.remove('dragging');
    sheet.style.transform = '';
    backdrop.style.opacity = '';
    dragY = 0;
  };

  /** 把「手指到哪了」画成位移 */
  const paintDrag = (clientY) => {
    if (!dragging) return;
    dragY = Math.max(0, clientY - startY);
    // 手指又往上推了：说明用户想滚内容，立刻交还给原生滚动
    if (dragY < 2 && !grabbing) {
      endDrag();
      return;
    }
    if (dragY < 6) return;
    sheet.style.transform = `translateY(${dragY}px)`;
    backdrop.style.opacity = String(Math.max(0.12, 1 - dragY / 440));
  };

  const finishGesture = () => {
    if (!dragging) {
      candidate = null;
      dragId = -1;
      return;
    }
    const passed = dragY > 96;
    endDrag();
    if (passed) {
      swallowClick();
      close();
    }
  };

  /*
   * 触摸为什么不用 pointer 事件：
   * 手指一按在「可以滚动的内容」上，浏览器会立刻把这次手势交给滚动，
   * 紧接着派 pointercancel —— 实测只收到 1 个 pointermove 就被踢出局，
   * 位移永远到不了 96px 的关闭阈值。
   * 所以触摸走 touch 事件：touchstart 时先只看方向，往下 + 已经在顶部才
   * preventDefault 抢过来（还来得及，因为 touchmove 是非 passive 的），
   * 往上立刻拆掉监听，让原生滚动照常滚 —— 两边都不耽误。
   * 鼠标没有这套竞争，单独用 pointer 事件（且只从把手起拖）。
   */
  let touchJudge = false;
  let touchY0 = 0;
  let touchX0 = 0;
  let touchMoveFn = null;
  let touchEndFn = null;

  const removeTouchHandlers = () => {
    touchMoveFn = null;
    touchEndFn = null;
    touchJudge = false;
  };

  const onTouchStart = (e) => {
    if (!dismissible || closed || dragging) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    // 按在输入框上是要打字，不接管
    if (e.target.closest('input, select, textarea')) return;
    // 按在输入框上是要打字，不接管
    if (e.target.closest('input, select, textarea')) return;
    grabbing = !!e.target.closest('.grab, .handle, .sheet-h');
    touchY0 = t.clientY;
    touchX0 = t.clientX;
    startY = t.clientY;
    dragY = 0;
    candidate = { top: atTop() };
    touchJudge = true;
    if (grabbing) beginDrag();

    touchMoveFn = (ev) => {
      if (!touchJudge) return;
      const tt = ev.touches && ev.touches[0];
      if (!tt) return;
      const dy = tt.clientY - touchY0;
      const dx = tt.clientX - touchX0;
      if (!dragging) {
        // 横着走：不拦
        if (Math.abs(dx) > Math.abs(dy) + 10) {
          removeTouchHandlers();
          return;
        }
        if (dy < -4) {
          // 想往下看内容：彻底放手，让原生滚动接管
          removeTouchHandlers();
          return;
        }
        if (dy > 2 && (candidate && candidate.top || atTop())) {
          beginDrag();
        } else {
          // 还没到判定线，但手指确实在往下走：先把这一下按住，
          // 否则浏览器会抢先当成滚动、派 touchcancel，我们就再也收不到后续事件了。
          if (dy > 0 && (candidate && candidate.top || atTop()) && ev.cancelable) ev.preventDefault();
          return;
        }
      }
      if (ev.cancelable) ev.preventDefault();
      paintDrag(tt.clientY);
    };
    touchEndFn = () => {
      removeTouchHandlers();
      finishGesture();
    };
  };

  // 鼠标：从把手／标题／内容顶部往下拖也能关（和触摸同一套结局，只是不用判方向）
  const onDown = (e) => {
    if (e.pointerType !== 'mouse') return;
    if (!dismissible || closed || dragging) return;
    if (e.button !== 0) return;
    if (e.target.closest('input, select, textarea')) return;
    grabbing = !!e.target.closest('.grab, .handle, .sheet-h');
    if (!grabbing && !atTop()) return;
    dragId = e.pointerId;
    startY = e.clientY;
    dragY = 0;
    beginDrag();
  };
  const onMove = (e) => {
    if (!dragging || e.pointerType !== 'mouse' || e.pointerId !== dragId) return;
    paintDrag(e.clientY);
  };
  const onUp = (e) => {
    if (!dragging || e.pointerType !== 'mouse') return;
    finishGesture();
  };

  sheet.addEventListener('touchstart', onTouchStart, { passive: true });
  // 注意：非 passive 的 touchmove 必须在手势开始之前就挂好。
  // 等 touchstart 里再临时挂，浏览器已经把手势判给滚动了，后续 touchmove 可能不再派给我们
  // （实测：只收到 1 个 touchmove 就被 touchcancel 踢掉）。这里常驻挂一个，内部再看 touchJudge。
  sheet.addEventListener('touchmove', (ev) => {
    if (touchJudge && touchMoveFn) touchMoveFn(ev);
  }, { passive: false });
  sheet.addEventListener('touchend', () => {
    if (touchEndFn) touchEndFn();
  }, { passive: true });
  sheet.addEventListener('touchcancel', () => {
    if (touchEndFn) touchEndFn();
  }, { passive: true });
  sheet.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });

  onMount?.(sheet, { close });
  return { close, el: sheet };
}

export function closeAllSheets() {
  const root = document.getElementById('sheet-root');
  // 逐个走 close()：它会摘掉 keydown / pointermove 那些监听，也会在最后解锁滚动。
  // 以前这里直接 innerHTML = '' —— 抽屉是没了，但 body 上的 sheet-open 还留着，
  // 于是按系统返回键关掉抽屉之后，底下的列表再也滚不动（这是真 bug）。
  const list = Array.from(liveSheets);
  liveSheets.clear();
  list.forEach((close) => close());
  if (!list.length) root.innerHTML = '';
  document.body.classList.remove('sheet-open');
}

/* ---------------- 提示条 ---------------- */

let toastTimer = null;

const UNDO_MS = () => {
  const v = Number(state?.settings?.undoMs);
  return Number.isFinite(v) && v >= 1000 ? Math.min(60000, v) : 5000;
};

export function toast(msg, { undoable = false, ms } = {}) {
  const root = document.getElementById('toast-root');
  // 撤销条停多久由设置决定（默认 5 秒，可在「我的 → 交互」里改）
  const life = ms ?? (undoable ? UNDO_MS() : 5000);
  // 旧的那条先往上飘走，再放新的，不要硬删
  Array.from(root.children).forEach((old) => {
    old.classList.remove('in');
    old.classList.add('out');
    setTimeout(() => old.remove(), 260);
  });
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--toast-ms', `${life}ms`);
  el.innerHTML = `<div class="msg">${msg}</div>${undoable ? '<button class="undo">撤销</button>' : ''}${undoable ? '<i class="bar"></i>' : ''}`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const hide = () => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 320);
  };
  if (undoable) {
    const btn = el.querySelector('.undo');
    btn.addEventListener('click', async () => {
      hide();
      const ok = await undo();
      // 撤销成功也得给一句回执，否则点完什么都没变的样子（实测过：旧版这里静默）
      toast(ok ? '已撤销' : '没有可撤销的操作');
    });
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, life);
  return hide;
}

/* ---------------- 类型胶囊 ---------------- */

export function typeChips(selectedId) {
  const order = [];
  for (const t of topTypes()) {
    order.push({ t, kid: false });
    if (t.isGroup || state.types.some((x) => x.parentId === t.id)) {
      childTypes(t.id).forEach((c) => order.push({ t: c, kid: true }));
    }
  }
  return `<div class="chips tchips">${order.map(({ t, kid }) => `
    <button class="chip ${kid ? 'kid' : ''} ${t.id === selectedId ? 'on' : ''}" data-tid="${t.id}">
      <i class="cdot" style="background:${t.color}"></i>${esc(t.name)}
    </button>`).join('')}</div>`;
}

export function wireTypeChips(sheet, onChange) {
  const box = $('.tchips', sheet);
  if (!box) return;
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tid]');
    if (!btn) return;
    $$('.chip', box).forEach((c) => c.classList.toggle('on', c === btn));
    onChange?.(btn.dataset.tid);
  });
}

/* ---------------- 记录编辑抽屉 ---------------- */

export function openRecordEditor({ rec = null, start, end, typeId } = {}) {
  const isNew = !rec;
  const wasRunning = !!rec && rec.end == null;
  let tid = typeId || rec?.typeId || state.settings.lastType || state.types[0]?.id || null;
  const s0 = rec ? rec.start : (start ?? Date.now() - 15 * 60000);
  const e0 = rec ? (rec.end ?? Date.now()) : (end ?? Date.now());
  const color = typeById(tid)?.color || '#6C7BFF';
  const eInit = toLocalInput(e0);

  const body = `
    <div class="field"><label>类型</label>${typeChips(tid)}</div>
    <div class="two">
      <div class="field"><label>开始</label><input class="inp" type="datetime-local" data-k="start" value="${toLocalInput(s0)}"></div>
      <div class="field"><label>结束</label><input class="inp" type="datetime-local" data-k="end" value="${eInit}"></div>
    </div>
    <div class="field"><label>时长预览</label><div class="dur-preview" data-dur>${fmtDur(e0 - s0)}</div></div>
    <div class="field"><label>备注</label><textarea class="inp" data-k="note" placeholder="当时在做什么，或者为什么延长了">${esc(rec?.note || '')}</textarea></div>
    <div class="field"><label>标签</label><input class="inp" data-k="tags" placeholder="用空格分隔，例如：深度 复习" value="${esc((rec?.tags || []).join(' '))}"></div>
    ${wasRunning ? '<div class="hint">这条还在计时。不动「结束」直接保存，它会接着往下走。</div>' : ''}
  `;

  const foot = isNew
    ? `<button class="btn" data-do="cancel">取消</button>
       <button class="btn primary" data-do="save" style="--c:${color}">记下</button>`
    : `<button class="btn danger" data-do="del">删除</button>
       <button class="btn primary" data-do="save" style="--c:${color}">保存</button>`;

  openSheet({
    title: isNew ? '补记一段时间' : '编辑记录',
    sub: isNew ? '拖动墨带选的范围可以在这里微调' : '',
    body, foot,
    onMount(sheet, { close }) {
      wireTypeChips(sheet, (id) => { tid = id; });

      const inpStart = $('[data-k="start"]', sheet);
      const inpEnd = $('[data-k="end"]', sheet);
      const durEl = $('[data-dur]', sheet);
      // 「结束」没被动过 → 对一条正在计时的记录来说，就是「接着记」
      const endTouched = () => inpEnd.value !== eInit;
      const refresh = () => {
        const a = fromLocalInput(inpStart.value);
        const b = fromLocalInput(inpEnd.value);
        const fixed = Number.isFinite(a) && Number.isFinite(b) && b > a;
        durEl.textContent = fixed ? fmtDur(b - a) : '时间不对';
        durEl.style.color = fixed ? 'var(--text)' : '#ff8a80';
      };
      inpStart.addEventListener('input', refresh);
      inpEnd.addEventListener('input', refresh);

      sheet.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-do]');
        if (!btn) return;
        const act = btn.dataset.do;
        if (act === 'cancel') return close();

        if (act === 'del') {
          close();
          await deleteRecord(rec.id);
          toast('已删除这条记录', { undoable: true });
          return;
        }

        if (act === 'save') {
          const a = fromLocalInput(inpStart.value);
          const b = fromLocalInput(inpEnd.value);
          const keepRunning = wasRunning && !endTouched();
          if (!Number.isFinite(a) || !Number.isFinite(b) || (!keepRunning && b <= a)) { refresh(); return; }
          if (!tid) { toast('先选一个类型'); return; }
          const note = $('[data-k="note"]', sheet).value.trim();
          const tags = $('[data-k="tags"]', sheet).value.split(/\s+/).filter(Boolean);
          if (isNew) {
            const { trimmed } = await addRecord({ typeId: tid, start: a, end: b, note, tags });
            close();
            toast(
              `已记下 ${fmtDur(b - a)}${trimmed > 0 ? `，覆盖了重叠的 ${fmtDur(trimmed)}` : ''}`,
              { undoable: true },
            );
          } else {
            await updateRecord(rec.id, { typeId: tid, start: a, end: keepRunning ? null : b, note, tags });
            close();
            toast(keepRunning ? '已保存，计时继续' : '已保存', { undoable: true });
          }
        }
      });
    },
  });
}

/* ---------------- 快速选类型 ---------------- */

export function openTypePicker({ title = '开始记录', onPick }) {
  const body = `<div class="grid">${state.types.map((t) => `
    <button class="tile glass" data-pick="${t.id}" style="--c:${t.color};--c-soft:${hexA(t.color, .3)}">
      <span class="tic">${`<svg class="ic"><use href="#i-t-${t.icon || 'book'}"/></svg>`}</span>
      <span class="tdot"></span>
      <span class="tname">${esc(t.name)}</span>
    </button>`).join('')}</div>`;
  openSheet({ title, body, onMount(sheet, { close }) {
    sheet.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      close();
      onPick?.(b.dataset.pick);
    });
  } });
}

export function canUndoNow() { return canUndo(); }
