/* 手感：按下反馈、触感、页面切换的方向感。
   目标只有一个——点了立刻有反应，松手回弹，不要等到下一次重绘才看见结果。 */

let hapticsOn = true;

export function setHaptics(v) {
  hapticsOn = v !== false;
}

export function motionOff() {
  return document.documentElement.dataset.motion === 'off';
}

/** 装了 APK 就走原生桥（WebView 没有 navigator.vibrate）；
    浏览器里退回振动 API；都没有（桌面、iOS Safari）就安静跳过 */
export function haptic(ms = 8) {
  if (!hapticsOn || motionOff()) return;
  try {
    const native = window.CikeNative;
    if (native && typeof native.vibrate === 'function') {
      native.vibrate(ms);
      return;
    }
    navigator.vibrate?.(ms);
  } catch (e) { /* 忽略 */ }
}

const PRESSABLE = '[data-type], .btn, .tab, .icon-btn, .chip, .pick, .gplay, .gfold, .tile, .pill, .li, .sw, .rec, .seg-ctrl button';
const HAPTIC_RE = /^(btn|tab|icon-btn|gplay|gfold|chip|pick)$/;
/** 会漾开水波的地方：主要控件，笔尖粗的地方则不撒 */
const RIPPLE = '.btn, .tab, .icon-btn, .chip, .pick, .tile, .pill, .gplay, .gfold, .li';
/** 松手后带一点回弹的：动作类
    底部导航不在名单里 —— 整条标签缩放会把图标和 10.5px 的字重新栅格化，
    在手机上看就是「糊一下 / 变形」。它只换底色，不缩放。 */
const POP_RE = /^(btn|icon-btn|gplay|chip|pick)$/;

/** 从手指落点漾开一圈水波，58ms 铺满就散掉 */
function spawnRipple(el, cx, cy) {
  if (motionOff()) return;
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.2;
  const span = document.createElement('span');
  span.className = 'rip';
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.style.left = `${cx - r.left - size / 2}px`;
  span.style.top = `${cy - r.top - size / 2}px`;
  el.appendChild(span);
  setTimeout(() => span.remove(), 640);
}

/** 松手回弹：先压过一点再弹回来 */
function pop(el) {
  if (motionOff()) return;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  setTimeout(() => el.classList.remove('pop'), 420);
}

/** 全局按下反馈：pointerdown 立刻缩一下 + 水波，松手回弹，滚动或拖远就取消 */
export function installPress() {
  let cur = null;
  let pointerId = -1;
  let x0 = 0;
  let y0 = 0;
  let moved = false;

  const release = (ev) => {
    if (!cur) return;
    const el = cur;
    cur = null;
    el.classList.remove('down');
    // 手一抬（或者一开始滚页面）就把水波收掉，别留一层动画在底下干扰滚动
    const rip = el.querySelector?.(':scope > .rip');
    if (rip) rip.remove();
    // 只有真的点下去又原地松手才回弹；滚动、移出、取消都不弹
    if (!moved && ev && ev.type === 'pointerup') {
      const first = el.className.split(' ')[0];
      if (POP_RE.test(first) || el.dataset.type) pop(el);
    }
  };

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest?.(PRESSABLE);
    if (!el || el.disabled) return;
    release();
    cur = el;
    pointerId = e.pointerId;
    x0 = e.clientX;
    y0 = e.clientY;
    moved = false;
    el.classList.add('down');
    if (el.matches?.(RIPPLE)) spawnRipple(el, e.clientX, e.clientY);
    if (el.dataset.type || HAPTIC_RE.test(el.className.split(' ')[0])) haptic(8);
  }, { passive: true });

  document.addEventListener('pointermove', (e) => {
    if (!cur || e.pointerId !== pointerId) return;
    // 手指在滑页面：取消按下态，别让它看起来像卡住了
    if (Math.hypot(e.clientX - x0, e.clientY - y0) > 12) {
      moved = true;
      release();
    }
  }, { passive: true });

  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  window.addEventListener('blur', release);
  window.addEventListener('scroll', release, { passive: true, capture: true });
}

/** 让「状态卡」在内容替换时不突兀：先亮一帧再换，换完淡入 */
export function flash(el, cls = 'flash') {
  if (!el || motionOff()) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 420);
}

/** 给一段内容做错峰入场：容器里每个直接子元素依次晚 18ms */
export function stagger(el, step = 18) {
  if (!el || motionOff()) return;
  Array.from(el.children).forEach((c, i) => {
    c.style.animationDelay = `${i * step}ms`;
    c.classList.add('rise');
  });
}

/** 缓缓展开：像纸从折痕里摊平，先窄后宽、自下往上落到位。
    只动 transform / opacity，不碰高度和 clip，所以毛玻璃不会每帧重算。 */
export function unfold(el, step = 46, max = 9) {
  if (!el || motionOff()) return;
  Array.from(el.children).forEach((c, i) => {
    if (i >= max) return;
    c.style.animationDelay = `${i * step}ms`;
    c.classList.add('unfold');
  });
}

/** 列表逐行摊开：记录、排行这类长列表，越往后越晚一点，最多铺 12 行 */
export function unfoldRows(container, step = 26, max = 12) {
  if (!container || motionOff()) return;
  Array.from(container.children).forEach((c, i) => {
    if (i >= max) return;
    c.style.animationDelay = `${60 + i * step}ms`;
    c.classList.add('unfold-row');
  });
}
