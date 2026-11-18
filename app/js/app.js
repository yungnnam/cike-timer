/* 启动、路由、主题、每秒心跳 */

import { state, init, sub, seedDemo, followLangNames, running, elapsed } from './store.js';
import { installPress, setHaptics, unfold, haptic } from './motion.js';
import { closeAllSheets, toast } from './ui.js';
import { installNativeTimer, syncTimerNotification, systemDark, onSystemThemeChange, markLongRun, hasNotify } from './native.js';
import { setLang, installAutoTranslate, translateRoot, getLang } from './i18n.js';
import * as nowView from './views/now.js';
import * as recordsView from './views/records.js';
import * as statsView from './views/stats.js';
import * as meView from './views/me.js';

const views = { now: nowView, records: recordsView, stats: statsView, me: meView };
const ROUTES = ['now', 'records', 'stats', 'me'];

let root = document.getElementById('view');

let route = 'now';

function routeFromHash() {
  const h = location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(h) ? h : 'now';
}

function applyTheme() {
  let theme = state.settings.theme || 'dark';
  if (theme === 'auto') {
    // 网页里问 matchMedia；APK 里问原生（WebView 的 prefers-color-scheme 跟着应用主题走，
    // 不问原生就会永远停在浅色）
    theme = systemDark() ? 'dark' : 'light';
  }
  const html = document.documentElement;
  html.dataset.theme = theme;
  html.dataset.motion = state.settings.motion === 'off' ? 'off' : 'on';
  // 界面上只有纯色一种画法：不透明底 + 细线，不再有毛玻璃和大光晕
  html.dataset.fx = 'solid';
  setHaptics(state.settings.haptics !== false);
  // 语言：中文 / English / 跟随系统（auto 时看浏览器或系统语言）
  setLang(state.settings.lang || 'zh');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#eef1f7' : '#06070c');
}

/** 底部导航的滑块：跟着选中的标签走，带一点缓动。
    ms 要和页面平移同一个时长，否则会出现「页面到位了、滑块还在半路」的错位感。 */
function moveTabInd(animate = false, ms = 460) {
  const bar = document.querySelector('.tabbar');
  const ind = bar?.querySelector('.tab-ind');
  const on = bar?.querySelector('.tab.on');
  if (!ind || !on) return;
  if (animate) {
    ind.style.transition = `transform ${ms}ms ${PAGER_EASE}`;
  } else {
    ind.style.transition = 'none';
  }
  ind.style.width = `${on.offsetWidth}px`;
  ind.style.transform = `translate3d(${on.offsetLeft}px, 0, 0)`;
  if (!animate) {
    void ind.offsetWidth;
    ind.style.transition = '';
  }
}

let lastRoute = null;
let suppressAnim = false;   // 平移分页自己已经把页面挪到位，render 时别再叠入场动画

/* ---------------- 平移分页 ----------------
   和系统相册/桌面一样：手指按住左右推，当前页 1:1 跟手，隔壁那页从旁边贴上来；
   松手按「推了多远」和「甩得多快」决定落位还是弹回。点底部四个标签走同一套动画，
   所以点着换栏也是「一页推走、一页推来」，不再是一下子硬切。 */
const PAGER_MS = 260;
const PAGER_EASE = 'cubic-bezier(.22, .61, .36, 1)';
const ENGAGE_X = 12;        // 横向超过 12px 才认为是在翻页
const ENGAGE_RATIO = 1.15;  // 横向得明显大于纵向，斜着推当滚动
const FLING_V = 0.45;       // px/ms，甩得够快就翻页
const COMMIT_RATIO = 0.26;  // 或者推过屏宽的 26%
const EDGE_DAMP = 0.28;     // 到头那一页的阻尼：推 100px 只动 28px

let busy = false;    // 落位动画进行中，不接新的手势

function motionIsOff() {
  return document.documentElement.dataset.motion === 'off';
}

/** 一页到底多宽：桌面/平板上 .view 有 max-width，不能拿 window.innerWidth 当步长 */
function viewWidth() {
  const w = root?.getBoundingClientRect?.().width;
  return Math.round(w || window.innerWidth) || window.innerWidth;
}

function makePeek(name, dir) {
  const el = document.createElement('main');
  el.className = 'view peek';
  el.setAttribute('aria-hidden', 'true');
  el.style.transform = `translate3d(${dir * viewWidth()}px, 0, 0)`;
  try {
    el.innerHTML = views[name].render();
  } catch (e) {
    return null;
  }
  // 必须挂在当前页所在的那个舞台（.pager）里：贴片和正式页共享同一坐标系、
  // 同一个裁切框，落位时摘掉 .peek 就是原地扶正，不会跨容器跳一下。
  (root?.parentNode || document.body).appendChild(el);
  return el;
}

/** 把当前页和隔壁页一起推到该在的位置。
    落位前如果用户又点了别的标签，就先把上一段立刻收尾（不卡手），再接着推。 */
let pending = null;
let backTimer = 0;   // 松手回弹的收尾定时器，新的手势要能把它取消

/** 丢弃正在进行的那一段换页（浏览器后退、中途又点标签、页面重画时用） */
function cancelPending() {
  if (pending) {
    clearTimeout(pending.timer);
    pending.peek?.remove();
    pending = null;
  }
  if (backTimer) {
    clearTimeout(backTimer);
    backTimer = 0;
  }
  if (root) {
    root.classList.remove('dragging');
    root.style.transition = '';
    root.style.transform = '';
  }
  busy = false;
}

function slideTo(name, dir, opts = {}) {
  if (!ROUTES.includes(name)) return;
  if (busy) settleNow();
  // 上一次可能刚把目标落好（滑到一半又点回同一个标签），别再把同一页推一遍
  if (name === route) { syncTabs(name, false); return; }
  if (backTimer) { clearTimeout(backTimer); backTimer = 0; }   // 别让回弹的收尾打断这次
  const W = viewWidth();
  const peek = opts.peek || makePeek(name, dir);

  if (!peek || motionIsOff()) {
    peek?.remove();
    navInstantly(name);
    return;
  }

  busy = true;
  root.classList.remove('dragging');
  root.style.transition = `transform ${PAGER_MS}ms ${PAGER_EASE}`;
  root.style.transform = `translate3d(${-dir * W}px, 0, 0)`;
  peek.style.transition = `transform ${PAGER_MS}ms ${PAGER_EASE}`;
  peek.style.transform = 'translate3d(0, 0, 0)';

  // 翻页过程中不动底部导航：栏里的滑块、图标一旦跟着动，在 WebView 上会被
  // 和页面一起重采样（就是「变形」）。等落位那一帧再一次性切。
  pending = { target: name, peek, timer: setTimeout(settleNow, PAGER_MS + 20) };
}

/** 动画走到头（或被打断时立刻）落位：把已经画好的贴片直接扶正 */
function settleNow() {
  if (!pending) { busy = false; return; }
  clearTimeout(pending.timer);
  const { target, peek } = pending;
  pending = null;

  // 贴片被别处摘掉过（比如中途触发了重画），就老老实实重建一次
  if (!peek || !peek.isConnected) {
    busy = false;
    render();
    return;
  }

  try {
    route = target;
    try {
      history.pushState({ tab: target }, '', `#/${target}`);
    } catch (e) {
      location.hash = `#/${target}`;
    }

    // 这里不新建节点、也不重新渲染：贴片本来就是按目标栏画好的整页，
    // 把它扶正就完成了换页。以前是「新建一页 → 插进去 → 删掉贴片」，
    // 那一瞬间新旧两页同时在文档里，WebView 会闪一下（就是切换时那下卡闪）。
    const old = root;
    peek.classList.remove('peek');
    peek.removeAttribute('aria-hidden');
    peek.removeAttribute('style');
    peek.id = 'view';
    peek.setAttribute('role', 'main');
    views[target].mount?.(peek);   // 贴片当初只 render 过，委托监听还没挂
    root = peek;
    old.remove();
    root.scrollTop = 0;
    lastRoute = target;

    syncTabs(target, false);       // 已经到位，滑块吸附上去，别再重启过渡
  } catch (e) {
    // 落位出错也不能把 busy 锁死，否则之后所有手势都没反应
    console.error(e);
    cancelPending();
    render();
  } finally {
    busy = false;
  }
}

/** 不带动画地换栏（关掉动效、或者有些极端情况下走这条） */
function navInstantly(name) {
  if (name === route) return;
  route = name;
  try {
    history.pushState({ tab: name }, '', `#/${name}`);
  } catch (e) {
    location.hash = `#/${name}`;
  }
  render();
  moveTabInd(true, PAGER_MS);
}

/** 松手没到门槛：两个页面一起弹回原位 */
function springBack(d) {
  const W = d.w;
  if (motionIsOff()) {
    d.peek?.remove();
    root.classList.remove('dragging');
    root.style.transition = 'none';
    root.style.transform = '';
    return;
  }
  busy = true;
  // 先摘掉 dragging（那条规则用 !important 关掉了过渡），否则弹回是瞬移
  root.classList.remove('dragging');
  root.style.transition = `transform ${PAGER_MS}ms ${PAGER_EASE}`;
  root.style.transform = 'translate3d(0, 0, 0)';
  if (d.peek) {
    d.peek.style.transition = `transform ${PAGER_MS}ms ${PAGER_EASE}`;
    d.peek.style.transform = `translate3d(${d.dir * W}px, 0, 0)`;
  }
  // 收尾定时器记进 backTimer：用户在回弹途中又滑一次的话，要先把它取消，
  // 否则它会在新动画跑到一半时把 root 的 transform 抹掉 —— 看着就是「顿一下弹回原处」。
  backTimer = setTimeout(() => {
    backTimer = 0;
    d.peek?.remove();
    root.classList.remove('dragging');
    root.style.transition = 'none';
    root.style.transform = '';
    void root.offsetWidth;
    root.style.transition = '';
    busy = false;
  }, PAGER_MS + 20);
}
/** 把某一栏画进给定的容器（不负责挂到 DOM 上，也不动导航） */
function paintInto(node, name) {
  const view = views[name];
  node.id = 'view';
  node.className = 'view';
  node.setAttribute('role', 'main');
  node.innerHTML = view.render();
  view.mount?.(node);
  // 英文模式下在这里就地换掉文案：视图代码不用关心语言
  if (getLang() === 'en') translateRoot(node);
  return node;
}

/** 导航栏的高亮 + 滑块跟着当前栏走 */
function syncTabs(name, animate = false) {
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.nav === name;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  moveTabInd(animate, PAGER_MS);
}

function render() {
  if (!state.ready) return;
  // 正推到一半时被别处叫来重画（比如刚记了一笔触发了 emit）：把那一段作废，
  // 否则贴片会在定时器到点后把新画好的页换掉，用户会觉得「跳回去了」。
  if (pending) cancelPending();
  const top = root.scrollTop;
  const name = route;

  // 每次渲染换一个新容器：视图在容器上挂的是委托监听，
  // 复用同一个节点会让监听越积越多（一次点击触发好几次）。
  const prev = root;
  const next = document.createElement('main');
  paintInto(next, name);
  prev.replaceWith(next);
  root = next;

  root.scrollTop = lastRoute === name ? top : 0;
  const changedRoute = lastRoute !== name;
  lastRoute = name;

  syncTabs(name, changedRoute && !suppressAnim);

  // 只在真的翻页时摊开一次。以前每次重绘（加一条记录、改个设置）都会让整页
  // 重新播一遍 780ms 的入场，正好赶上用户接着滑动，就变成了「滚不动」。
  // 平移分页落位后自己已经把页面放在正确位置，这里就不能再叠动画。
  if (changedRoute && !suppressAnim) unfold(root, 52);
}

function tick() {
  const v = views[route];
  try { v?.tick?.(); } catch (e) { /* 忽略 */ }
  try { checkLongRun(); } catch (e) { /* 提醒失败不能影响计时 */ }
}

/**
 * 计时太久没停：满 N 小时提醒一次。
 * 通知栏那张卡片会被换成「已计时 N 小时，还在继续吗？」，同时轻震一下。
 * 只在装成 APK 时有声音有震动；网页版只弹一条 toast，免得静默什么都没发生。
 */
function checkLongRun() {
  const hours = Number(state.settings.longWarnH) || 0;
  if (!hours) return;
  const r = running();
  if (!r || r.pausedAt != null) return;
  if (elapsed(r, Date.now()) < hours * 3600 * 1000) return;
  if (!markLongRun(r.id, hours)) return;
  // 通知栏那张卡片换成提醒文案（APK）；网页版没有通知栏，靠下面这条 toast
  syncTimerNotification();
  // 原生服务到点会自己震一次，这里再震就是双震；只有网页版补这一下
  if (!hasNotify() && state.settings.haptics !== false) haptic(30);
  const name = state.types.find((x) => x.id === r.typeId)?.name;
  toast(name ? `「${name}」已计时 ${hours} 小时，还在继续吗？` : `已计时 ${hours} 小时，还在继续吗？`);
}

function fatal(msg) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(var(--nav-h) + 20px);z-index:99;'
    + 'padding:12px 14px;border-radius:16px;background:rgba(60,16,22,.92);color:#ffd9d6;'
    + 'border:1px solid rgba(255,138,128,.35);font-size:12.5px;line-height:1.6';
  box.textContent = '出了点问题：' + msg;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 8000);
}

/* 左右推换栏目（此刻 / 记录 / 统计 / 我的）。
   这里只负责「认手势 + 跟手移动」，落位交给 slideTo / springBack。
   竖着滚、拖胶囊、拖墨带、拖卡片排序一律不抢。 */
const SWIPE_SKIP = '.chips, .rbar, .pill, .tile, .gtiles, .dragghost, .sheet, .backdrop, input, textarea, select';

function installSwipe() {
  let sw = null;
  let swallow = 0;

  const neighbour = (dir) => {
    const j = ROUTES.indexOf(route) + dir;
    return j >= 0 && j < ROUTES.length ? ROUTES[j] : null;
  };

  document.addEventListener('pointerdown', (e) => {
    sw = null;
    if (busy) {
      if (pending) return;   // 落位动画还在跑，别插队
      // 回弹还没收完就让用户重新起手：把那一段直接掐掉，否则它会在新拖动中途
      // 把 transform 抹回 0，看着像「滑到一半被拽回去」
      if (backTimer) { clearTimeout(backTimer); backTimer = 0; }
      root.classList.remove('dragging');
      root.style.transition = '';
      root.style.transform = '';
      busy = false;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target instanceof Element ? e.target : null;
    if (!el || !el.closest('.view')) return;
    // 这些地方自己要用横向手势（胶囊条横滑、墨带拖补记、胶囊/格子拖动排序）
    if (el.closest(SWIPE_SKIP)) return;
    sw = {
      id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(),
      lastX: e.clientX, lastT: Date.now(), v: 0, engaged: false,
    };
  }, { passive: true });

  document.addEventListener('pointermove', (e) => {
    const s = sw;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;

    if (!s.engaged) {
      if (Math.abs(dx) < ENGAGE_X) return;
      if (Math.abs(dx) < Math.abs(dy) * ENGAGE_RATIO) { sw = null; return; }
      // 认下来：把隔壁那页预先摆到旁边，之后就是 1:1 跟手
      const dir = dx < 0 ? 1 : -1;
      const target = neighbour(dir);
      s.engaged = true;
      s.dir = dir;
      s.target = target;
      s.w = viewWidth();
      s.peek = target ? makePeek(target, dir) : null;
      root.classList.add('dragging');
      haptic(4);
    }

    const d = s.target ? dx : dx * EDGE_DAMP;
    s.d = d;
    root.style.transform = `translate3d(${d}px, 0, 0)`;
    if (s.peek) {
      s.peek.style.transform = `translate3d(${s.dir * s.w + d}px, 0, 0)`;
    }

    const now = Date.now();
    const dt = now - s.lastT;
    if (dt > 0) {
      s.v = (e.clientX - s.lastX) / dt;
      s.lastX = e.clientX;
      s.lastT = now;
    }
  }, { passive: true });

  const finish = (e, cancelled) => {
    const s = sw;
    sw = null;
    if (!s || (e && e.pointerId !== s.id)) return;
    if (!s.engaged) return;

    const dx = (e ? e.clientX : s.lastX) - s.x;
    const far = Math.abs(dx) > s.w * COMMIT_RATIO;
    const fast = Math.abs(s.v) > FLING_V && Math.abs(dx) > 24 && Math.sign(s.v) === Math.sign(dx);
    const commit = !cancelled && s.target && (far || fast);

    if (commit) {
      // 手抬起来时浏览器会补一个 click，吞掉它就够了。窗口别设太长，
      // 否则「滑完马上点一下类型格」也会被吃掉，用户以为点坏了。
      swallow = Date.now() + 220;
      haptic(8);
      slideTo(s.target, s.dir, { peek: s.peek });
    } else {
      haptic(s.target ? 5 : 7);     // 到头那一下给个短震
      springBack(s);
    }
  };

  document.addEventListener('pointerup', (e) => finish(e, false), { passive: true });
  document.addEventListener('pointercancel', (e) => finish(e, true), { passive: true });

  // 手抬起来时浏览器还会补一个 click，别让它点到滑过的那个格子。
  // 但底部导航和抽屉里的点击照常放行 —— 否则刚滑完 480ms 内点标签会没反应。
  document.addEventListener('click', (e) => {
    if (swallow <= Date.now()) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest('.tabbar, .sheet, .backdrop, .toast')) return;
    swallow = 0;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}

function boot2() {
  window.addEventListener('error', (e) => fatal(e.message || '脚本报错'));
  window.addEventListener('unhandledrejection', (e) => fatal(String(e.reason && e.reason.message || e.reason)));
}

// ?native=1 用的假桥：让浏览器里也能把「原生才走」的分支点一遍
function installNativeMock(qs) {
  if (qs.get('native') !== '1' || window.CikeNative) return;
  window.CikeNative = {
    vibrate(ms) { console.log('[mock] CikeNative.vibrate', ms); },
    saveFile(name, text) {
      const a = document.createElement('a');
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      console.log('[mock] CikeNative.saveFile', name, text.length, 'bytes → 已作为浏览器下载保存');
      return '浏览器下载目录';
    },
    // 通知栏：电脑上没法真弹通知，但把每次调用记下来，
    // 这样自动化测试能验证「开始/暂停/停止时网页确实通知了原生」。
    notifyTimer(title, note, color, start, paused, elapsed) {
      (window.__notifyLog = window.__notifyLog || []).push({
        kind: 'timer', title, note, color, start, paused, elapsed,
      });
      console.log('[mock] CikeNative.notifyTimer', title, paused ? '暂停' : '计时中', elapsed);
    },
    // 电脑上假装「通知已开启、渠道已建」，这样「我的」页那一行也能被测试到
    notifyStatus() {
      return JSON.stringify({ enabled: true, channel: true, importance: 3, lockscreen: 1, sdk: 34 });
    },
    openNotifySettings() { console.log('[mock] CikeNative.openNotifySettings'); },
    askNotify() { console.log('[mock] CikeNative.askNotify'); },
    notifyClear() {
      (window.__notifyLog = window.__notifyLog || []).push({ kind: 'clear' });
      console.log('[mock] CikeNative.notifyClear');
    },
    // 系统深浅色：测试可以用 window.__mockDark = true/false 改它，
    // 再派发 cike:system-theme 事件，验证「跟随系统」真的跟上了
    systemDark() {
      return typeof window.__mockDark === 'boolean'
        ? window.__mockDark
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
    },
  };
  console.log('%c[native mock] 已模拟 APK 原生桥：震动打日志、存文件走浏览器下载', 'color:#6c7bff;font-weight:600');
}

async function boot() {
  boot2();
  window.__app = { render, applyTheme };
  try {
    await init();
  } catch (e) {
    root.innerHTML = `<div class="empty">数据打不开：${e?.message || e}<br>试试刷新页面，或在浏览器设置里允许本站存储。</div>`;
    return;
  }
  // ?demo=1 时，如果还是空的就铺一周示例数据，方便一眼看到界面
  try {
    const qs = new URLSearchParams(location.search);
    if (qs.get('demo') === '1' && !state.records.length) await seedDemo();
  } catch (e) { /* 忽略 */ }

  route = routeFromHash();

  // 排查用：?motion=off 关动效。只影响这一次打开，不写进设置。
  const qs = new URLSearchParams(location.search);
  if (qs.get('motion')) state.settings.motion = qs.get('motion');
  // 排查用：?lang=en / ?lang=zh 直接换界面语言（同样不写进设置）
  if (qs.get('lang')) state.settings.lang = qs.get('lang');

  // 排查用：?native=1 假装自己是 APK 里的 WebView。
  // 电脑上测不到「原生确认框 / 震动 / 存到 Downloads」，用这个开关把原生分支也走一遍：
  // 震动打日志、存文件改成浏览器下载，其余行为与真机一致。
  installNativeMock(qs);

  // 装成 APK 时，把「正在计时」挂到通知栏上（网页版没有桥，自动跳过）
  installNativeTimer();

  applyTheme();
  // 界面是英文时，把「还叫默认名字」的类型名换成英文（学习 → Study）。
  // 只认精确的种子名，自己起的名字不动；这一步在首帧之前做完，用户看不到中文一闪。
  if (getLang() === 'en') {
    try { await followLangNames(); } catch (e) { /* 名字换不掉不影响用 */ }
  }
  // 外壳里的静态文字（标题、底部四个标签）也换掉；之后新插入的内容由 observer 兜住
  if (getLang() === 'en') {
    translateRoot(document.body);
    document.title = 'Cike · Time Tracker';
  }
  installAutoTranslate();
  installPress();
  installSwipe();
  render();
  sub((tag) => {
    // 通知栏：开始/暂停/继续/停止都在这一刻推给原生
    if (tag === 'timer') syncTimerNotification();
    // 开始/停止/暂停这类高频动作：只改状态卡和格子高亮，不重建整页
    if (tag === 'timer' && route === 'now' && nowView.patchTimer?.(root)) return;
    // 拖动排序：DOM 已经挪好了，只把合计数字跟上，别重画（重画会把卡片重新摊一遍）
    if (tag === 'order' && route === 'now' && nowView.refreshSums?.(root)) return;
    render();
  });

  setInterval(tick, 1000);

  window.addEventListener('hashchange', () => {
    // 浏览器后退 / 安卓返回键：先把抽屉收掉，再换页，别让抽屉压在新页面上
    closeAllSheets();
    // 正在推的那一页作废（否则它的定时器落位后会把你拽回刚才那栏）
    if (pending || backTimer) cancelPending();
    route = routeFromHash();
    render();
  });

  // 安卓返回键先问这里：抽屉开着就先关掉（返回 true 表示这一下被吃掉了）
  window.__androidBack = () => {
    // 正在淡出的抽屉不算「开着」，否则关掉之后再按一次会被它白吃一下
    if (document.querySelector('.sheet:not(.closing)')) {
      closeAllSheets();
      return true;
    }
    return false;
  };

  window.addEventListener('resize', () => moveTabInd(false));
  window.addEventListener('orientationchange', () => setTimeout(() => moveTabInd(false), 120));

  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => {
      const next = t.dataset.nav;
      if (route === next) { root.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      // 点标签就走「立刻切」：滑动手势才有跟手平移。
      // 以前点标签也走 260ms 平移，那 260ms 里要先同步建出目标页的 DOM，
      // 手机上就是「点一下先卡住、再滑过去」。
      haptic(6);
      navInstantly(next);
    });
  });

  // 系统深浅色变了就重新套一次（只有「跟随系统」时才动）
  const followSystem = () => {
    if ((state.settings.theme || 'dark') !== 'auto') return;
    applyTheme();
  };
  onSystemThemeChange(followSystem);
  // APK 里 MainActivity 改了配置（用户切系统深色）会调这个
  window.__sysTheme = followSystem;

  // 每秒心跳之外，回到前台时补一次
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  // 装进 APK 后（cike.local）文件本来就在安装包里，Service Worker 只会碍事，跳过
  const embedded = location.hostname === 'cike.local';
  if (!embedded && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 离线缓存不可用也不影响使用 */ });
    // 申请「持久」存储：浏览器在空间紧张时不会先把你的时间记录清掉
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  }
}

boot();
