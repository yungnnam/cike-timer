/* 时间格式化工具（带语言：中文 / English） */

import { isEn } from './i18n.js';

export const pad2 = (n) => String(n).padStart(2, '0');

/** 把乱七八糟的输入（NaN / undefined / 负数）收成安全的毫秒数 */
const safeMs = (ms) => (Number.isFinite(ms) ? Math.max(0, ms) : 0);

/** 计时器：1:23:45 / 23:45 */
export function fmtTimer(ms) {
  const t = Math.floor(safeMs(ms) / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** 人类可读时长：1小时23分 / 23分 / <1分；英文 1h 23m / 23m / <1m */
export function fmtDur(ms) {
  const v = safeMs(ms);
  const en = isEn();
  if (v < 60000) return en ? '<1m' : '<1分';
  const min = Math.round(v / 60000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return en ? `${m}m` : `${m}分`;
  return en ? `${h}h ${m}m` : `${h}小时${m}分`;
}

/** 紧凑时长：1时05分 / 23分（用于类型格、排行）；英文 1h05m / 23m */
export function fmtDurS(ms) {
  const min = Math.round(safeMs(ms) / 60000);
  const en = isEn();
  if (min <= 0) return en ? '0m' : '0分';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (en) return h > 0 ? `${h}h${pad2(m)}m` : `${m}m`;
  return h > 0 ? `${h}时${pad2(m)}分` : `${m}分`;
}

/** 小时数，一位小数：1.8h */
export function fmtHour(ms) {
  return (safeMs(ms) / 3600000).toFixed(1).replace('.0', '');
}

export function fmtClock(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(ts) {
  const d = new Date(ts);
  return isEn() ? `${MONTHS_EN[d.getMonth()]} ${d.getDate()}` : `${d.getMonth() + 1}月${d.getDate()}日`;
}

const WK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function fmtWeekday(ts) {
  const i = new Date(ts).getDay();
  return isEn() ? WK_EN[i] : WK[i];
}

/** 今天 / 昨天 / 11月1日 周六（英文 Today / Yesterday / Nov 1 Sat） */
export function fmtDay(ts, dayStart = 0) {
  const now = Date.now();
  const d0 = dayStartOf(now, dayStart);
  const d1 = dayStartOf(ts, dayStart);
  const diff = Math.round((d0 - d1) / 86400000);
  const en = isEn();
  if (diff === 0) return en ? 'Today' : '今天';
  if (diff === 1) return en ? 'Yesterday' : '昨天';
  if (diff === 2 && !en) return '前天';
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  if (en) {
    return sameYear ? `${fmtDate(ts)} ${fmtWeekday(ts)}` : `${fmtDate(ts)}, ${d.getFullYear()}`;
  }
  return sameYear ? `${fmtDate(ts)} ${fmtWeekday(ts)}` : `${d.getFullYear()}年${fmtDate(ts)}`;
}

export function dayStartOf(ts, dayStart = 0) {
  const d = new Date(ts);
  d.setHours(dayStart, 0, 0, 0);
  let v = d.getTime();
  if (v > ts) v -= 86400000;
  return v;
}

/** 2026-11-01 08:15（CSV 用） */
export function fmtISO(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** datetime-local 输入框值 */
export function toLocalInput(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fromLocalInput(v) {
  if (!v) return NaN;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** #RRGGBB + alpha -> rgba() */
export function hexA(hex, a) {
  let h = String(hex || '#6c7bff').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return `rgba(108,123,255,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 同一个颜色的第 k 个变体：色相不变，只把明度挪一档。
    子类型跟分组同色之后，饼图里同组的几块还能靠深浅分开。 */
const SHADES = [0, -0.085, -0.16, -0.235, 0.07, -0.31, 0.125];

export function shadeFor(hex, k = 0) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m || !k) return hex;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const nl = Math.min(0.88, Math.max(0.22, l + SHADES[k % SHADES.length]));
  // 压暗时把饱和度抬一点点，免得深色变糊
  const ns = nl < l ? Math.min(1, s * 1.06) : s;
  const q = nl < 0.5 ? nl * (1 + ns) : nl + ns - nl * ns;
  const p = 2 * nl - q;
  const to = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const ch = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${ch(to(h + 1 / 3))}${ch(to(h))}${ch(to(h - 1 / 3))}`;
}


/** 5 分钟吸附 */
export function snap(ts, step = 5 * 60000) {
  return Math.round(ts / step) * step;
}
