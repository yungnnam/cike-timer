/**
 * 原生桥：只在装成 APK 时有效（网页里 window.CikeNative 不存在，全部静默跳过）。
 *
 * 现在只做一件事 —— 把「正在计时」同步到通知栏：
 *  - 开始 / 暂停 / 继续 / 停止时各推一次；
 *  - 应用回到前台时再推一次（防止系统把通知清掉、或用户在应用外改了状态）；
 *  - 秒数不靠网页推 —— 通知用 setUsesChronometer，系统自己跳，省电。
 */
import { running, elapsed, typeById } from './store.js';
import { fmtDur } from './format.js';
import { t as tr } from './i18n.js';

const MAX_MS = 24 * 3600 * 1000;

function bridge() {
  if (typeof window === 'undefined') return null;
  return window.CikeNative || null;
}

/** 当前有没有原生能力（网页版返回 false，界面上不用提示任何东西） */
export function hasNotify() {
  const b = bridge();
  return !!b && typeof b.notifyTimer === 'function';
}

/**
 * 把当前计时状态推给通知栏。
 * 返回 true 表示确实交给原生处理了；false 表示这是网页版，什么都不用做。
 */
export function syncTimerNotification() {
  const b = bridge();
  if (!b || typeof b.notifyTimer !== 'function') return false;

  const r = running();

  // 没有在计时：把通知摘掉
  if (!r) {
    if (typeof b.notifyClear === 'function') b.notifyClear();
    return true;
  }

  const t = typeById(r.typeId);
  const paused = r.pausedAt != null;
  const ms = Math.min(MAX_MS, Math.max(0, elapsed(r, Date.now())));
  // 副标题只在暂停时给一句；正常计时时留空，别把「今天已记」塞进通知里。
  // 这句直接进系统通知栏，不经过 DOM，所以要自己翻（tr() 走的是同一份词典）。
  const note = paused ? `${tr('已暂停')} · ${fmtDur(ms)}` : '';

  try {
    b.notifyTimer(
      t ? t.name : tr('未分类'),
      note,
      (t && t.color) || '#6C7BFF',
      r.start,
      paused,
      ms,
    );
  } catch (e) {
    // 原生侧出问题不能影响网页计时
    console.warn('[native] notifyTimer failed', e);
  }
  return true;
}

/** 通知/锁屏的当前状态；网页版或没有桥时返回 null */
export function notifyStatus() {
  const b = bridge();
  if (!b || typeof b.notifyStatus !== 'function') return null;
  try {
    const raw = b.notifyStatus();
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/** 打开系统的「通知」设置页，让用户自己决定锁屏上要不要显示 */
export function openNotifySettings() {
  const b = bridge();
  if (!b || typeof b.openNotifySettings !== 'function') return false;
  try {
    b.openNotifySettings();
    return true;
  } catch (e) {
    return false;
  }
}

/** 用户之前拒绝了通知权限时，再问一次 */
export function requestNotify() {
  const b = bridge();
  if (!b || typeof b.askNotify !== 'function') return false;
  try {
    b.askNotify();
    return true;
  } catch (e) {
    return false;
  }
}

/** 应用启动时（以及从后台回来时）对一次账 */
export function installNativeTimer() {
  if (!hasNotify()) return;
  syncTimerNotification();
  const again = () => syncTimerNotification();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') again();
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('pageshow', again);
  }
}

/* ---------------- 系统深浅色 ---------------- */

/**
 * 系统现在是深色还是浅色。
 *
 * 网页里问 matchMedia 就行；但装成 APK 时 WebView 的 prefers-color-scheme 是跟着
 * **应用自己的主题**（我们用的是浅色 Theme.DeviceDefault）走的，系统开了深色它也报浅色，
 * 于是「跟随系统」永远停在浅色 —— 看起来就像坏了。所以 APK 里直接问原生。
 *
 * 返回值：true 表示系统深色，false 表示浅色，null 表示不知道（按浅色处理）。
 */
export function systemDark() {
  const b = bridge();
  if (b && typeof b.systemDark === 'function') {
    try {
      return !!b.systemDark();
    } catch (e) {
      return null;
    }
  }
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 系统深浅色变化时叫我一声（网页用 matchMedia；APK 由 MainActivity 回调 __sysTheme） */
export function onSystemThemeChange(cb) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', cb);
    else if (mq.addListener) mq.addListener(cb);
  }
  window.addEventListener('cike:system-theme', cb);
}
