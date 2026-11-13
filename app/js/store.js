/* 状态、计时引擎、撤销栈 */

import * as db from './db.js';
import { dayStartOf } from './format.js';
import { detectLang, renameSeedName, seedName, setLang } from './i18n.js';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const DEFAULT_SETTINGS = {
  theme: 'dark',    // dark | light | auto
  lang: 'zh',       // zh | en | auto（auto = 跟浏览器/系统语言）
  motion: 'on',     // on | off
  fx: 'solid',      // 只有 pure solid 一种界面：不透明底 + 细线，无毛玻璃、无光晕
  haptics: true,    // 点按时轻微震动
  undoMs: 5000,     // 撤销提示条停留多久（毫秒）：3 / 5 / 8 / 10 秒可选
  focusIds: [],     // 统计只看这些分组/类型（空 = 全部）；选中分组时子类型自动算进来
  tipDone: false,   // 「三件事就够用了」那张提示卡关掉了没有
  dayStart: 0,      // 一天的起点（0-6 点）
  weekStart: 1,     // 1 = 周一
  minDur: 0,        // 短于 N 秒的记录自动丢弃，0 = 不丢弃
  lastType: null,
  seeded: false,
  groupMigrated: false, // 老数据是否已经按新结构归好分组
  colorUnified: false,  // 子类型是否已经统一成所在分组的颜色
  version: 1,
};

export const state = {
  types: [],
  records: [],
  goals: [],
  settings: { ...DEFAULT_SETTINGS },
  ready: false,
};

/* 默认类型：分组（isGroup）里放子类型，id 固定，方便示例数据对上号 */
const SEED = [
  { id: 't1', name: '学习', icon: 'book', color: '#6C7BFF', isGroup: true },
  { id: 't2', name: '英语', icon: 'globe', color: '#58B6E8', parentId: 't1' },
  { id: 't3', name: '编程', icon: 'code', color: '#A78BFA', parentId: 't1' },
  { id: 't4', name: '阅读', icon: 'leaf', color: '#8FBF6A', parentId: 't1' },
  { id: 'g2', name: '生活', icon: 'heart', color: '#FF8E7A', isGroup: true },
  { id: 't6', name: '运动', icon: 'dumbbell', color: '#E8735A', parentId: 'g2' },
  { id: 't7', name: '睡眠', icon: 'moon', color: '#8B93A7', parentId: 'g2' },
  { id: 't8', name: '吃饭', icon: 'utensils', color: '#D9A57B', parentId: 'g2' },
  { id: 't5', name: '工作', icon: 'case', color: '#E8B04B' },
  { id: 't9', name: '通勤', icon: 'bus', color: '#4FBF9F' },
];

export const PALETTE = [
  '#6C7BFF', '#58B6E8', '#A78BFA', '#E58BB0', '#FF8E7A', '#E8735A',
  '#E8B04B', '#D9A57B', '#B08A5E', '#8FBF6A', '#4FBF9F', '#8B93A7',
  // 第二批：给子类型更多可挑的颜色（同样是低饱和，深色底上不刺眼）
  '#7C5CFF', '#4FC3F7', '#9CCC65', '#FFD166', '#FF9E7A', '#F06292',
  '#4DB6AC', '#B39DDB', '#90A4AE', '#C5A46D', '#7ED0B0', '#EF9A9A',
];

export const ICONS = [
  'book', 'code', 'globe', 'leaf', 'case', 'dumbbell',
  'moon', 'utensils', 'bus', 'phone', 'music', 'pen',
  'heart', 'coffee', 'game', 'chat', 'home', 'cart',
  'film', 'drop', 'star', 'run', 'pill', 'sun',
  'layers',
];

const listeners = new Set();
export function sub(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(tag) { for (const fn of listeners) { try { fn(tag); } catch (e) { console.error(e); } } }

/* ---------------- 初始化 ---------------- */

export async function init() {
  const [types, records, goals, settings] = await Promise.all([
    db.all('types'), db.all('records'), db.all('goals'), db.kvGet('settings', null),
  ]);
  state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  state.types = types || [];
  // 库里的数据也洗一遍：老版本可能留下时间字段缺失的记录
  state.records = cleanRecords(records || []);
  state.goals = goals || [];

  // 只在第一次时铺默认类型；用户把类型删光了也要尊重，不复活
  if (!state.settings.seeded) {
    // 第一次打开：跟着系统语言走（英文系统直接给英文类型名，省得再去设置里切）
    if (!state.settings.lang || state.settings.lang === 'zh') {
      const auto = detectLang('auto');
      state.settings.lang = auto;
      setLang(auto);
    } else {
      setLang(state.settings.lang);
    }
    if (!state.types.length) {
      // 首次铺种子：英文界面下用英文类型名（这是数据，只有创建时翻译这一次）
      const seeded = SEED.map((t, i) => ({
        parentId: null, counts: false, isGroup: false, ...t, name: seedName(t.name), order: i,
      }));
      state.types = seeded;
      await db.bulkPut('types', seeded);
    }
    state.settings.seeded = true;
    await db.kvSet('settings', state.settings);
  }

  // 一次性迁移：老版本是 9 个平铺类型，新版把它们归到「学习」「生活」两个分组里。
  // 只有在用户完全没动过默认类型时才动手，改过名字/加过类型的一律不碰。
  if (!state.settings.groupMigrated) {
    const OLD = ['学习', '英语', '编程', '阅读', '工作', '运动', '睡眠', '吃饭', '通勤'];
    const untouched = state.types.length === 9
      && state.types.every((t, i) => t.id === 't' + (i + 1) && t.name === OLD[i] && !t.parentId);
    if (untouched) {
      pushUndo();
      const under = { t2: 't1', t3: 't1', t4: 't1', t6: 'g2', t7: 'g2', t8: 'g2' };
      state.types = state.types.map((t) => (
        under[t.id] ? { ...t, parentId: under[t.id] } : (t.id === 't1' ? { ...t, isGroup: true } : t)
      ));
      state.types.push({
        id: 'g2', name: '生活', icon: 'heart', color: '#FF8E7A',
        parentId: null, order: 3.5, counts: false, isGroup: true,
      });
      await db.clear('types');
      await db.bulkPut('types', state.types);
    }
    state.settings.groupMigrated = true;
    await db.kvSet('settings', state.settings);
  }

  // 一次性迁移：子类型跟分组同色。以前子类型各自从色板取色，于是同一个分组里
  // 蓝的绿的紫的混着，分组卡片和统计图里的颜色对不上。改动可撤销。
  if (!state.settings.colorUnified) {
    const changed = [];
    for (const g of state.types.filter((t) => !t.parentId)) {
      for (const k of state.types.filter((t) => t.parentId === g.id)) {
        if (k.color !== g.color) {
          k.color = g.color;
          changed.push(k);
        }
      }
    }
    if (changed.length) {
      pushUndo();
      await db.bulkPut('types', changed);
    }
    state.settings.colorUnified = true;
    await db.kvSet('settings', state.settings);
  }

  state.ready = true;
  return state;
}

/* ---------------- 查询 ---------------- */

export const typeById = (id) => state.types.find((t) => t.id === id);
export const liveTypes = () => state.types.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
export const groupTypes = () => liveTypes().filter((t) => !t.parentId);
export const childTypes = (pid) => liveTypes().filter((t) => t.parentId === pid);

/* ---------------- 分组 ----------------
   两级模型：顶级类型，有子类型（或标了 isGroup）就是分组。
   分组自己也能记录时间，统计时把子类型的时间一起算进来。 */

export const isGroup = (t) => !!t && (t.isGroup === true || state.types.some((x) => x.parentId === t.id));
export const topTypes = () => liveTypes().filter((t) => !t.parentId);
export const groupList = () => topTypes().filter(isGroup);
export const plainTypes = () => topTypes().filter((t) => !isGroup(t));

export function descendants(id) {
  const out = [];
  const walk = (pid) => state.types.forEach((t) => {
    if (t.parentId === pid) { out.push(t.id); walk(t.id); }
  });
  walk(id);
  return out;
}

/* 「学习 / 编程」这样的路径，记录和统计里都这么显示 */
export function typePath(id) {
  const t = typeById(id);
  if (!t) return '未分类';
  const p = t.parentId ? typeById(t.parentId) : null;
  return p ? `${p.name} / ${t.name}` : t.name;
}

/* ---------------- 关注范围 ----------------
   统计页的「周热力图」只算用户挑出来的分组和类型。
   存的是 id 数组：选分组就是整个分组（子类型自动展开），选子类型就只算它。
   空数组 = 不筛选，全部类型。 */
export function focusIds() {
  const raw = Array.isArray(state.settings.focusIds) ? state.settings.focusIds : [];
  // 类型删掉之后设置里可能留着死 id，读的时候顺手滤掉
  return raw.filter((id) => !!typeById(id));
}

/** 展开成一组具体类型 id；没设过返回 null（= 全部） */
export function focusSet() {
  const ids = focusIds();
  if (!ids.length) return null;
  const set = new Set();
  for (const id of ids) {
    set.add(id);
    for (const kid of descendants(id)) set.add(kid);
  }
  return set;
}

/** 一句说明：「全部类型」/「学习、编程」/「学习、编程 等 4 项」 */
export function focusSummary() {
  const names = focusIds().map((id) => typeById(id)?.name || '').filter(Boolean);
  if (!names.length) return '全部类型';
  return names.length <= 2 ? names.join('、') : `${names.slice(0, 2).join('、')} 等 ${names.length} 项`;
}

/* 按顶级类型汇总（分组合并子类型），统计页环形图和排行用 */
export function sumByTop(from, to, now = Date.now()) {
  const map = new Map();
  for (const c of clipped(from, to, now)) {
    const t = typeById(c.rec.typeId);
    const top = t && t.parentId ? t.parentId : c.rec.typeId;
    map.set(top, (map.get(top) || 0) + c.ms);
  }
  return map;
}

export function running() {
  return state.records.find((r) => r.end == null) || null;
}

export function elapsed(rec, now = Date.now()) {
  if (!rec || !Number.isFinite(rec.start)) return 0;
  const stop = rec.end != null ? rec.end : (rec.pausedAt != null ? rec.pausedAt : now);
  if (!Number.isFinite(stop)) return 0;
  return Math.max(0, stop - rec.start - (rec.pausedMs || 0));
}

export const isPaused = (rec) => !!rec && rec.pausedAt != null;

/* ---------------- 区间工具 ---------------- */

export function startOfDay(ts = Date.now()) {
  return dayStartOf(ts, state.settings.dayStart || 0);
}
export function endOfDay(ts = Date.now()) {
  return startOfDay(ts) + 86400000;
}
export function startOfWeek(ts = Date.now()) {
  const s = startOfDay(ts);
  const ws = state.settings.weekStart ?? 1;
  const day = new Date(s).getDay();
  return s - ((day - ws + 7) % 7) * 86400000;
}
export function startOfMonth(ts = Date.now()) {
  const d = new Date(startOfDay(ts));
  d.setDate(1);
  return d.getTime();
}

/** 与 [from,to) 相交的记录，裁剪后返回 { rec, s, e, ms }
    暂停中的记录按「暂停的那一刻」算，不会因为你忘了按继续就一直在涨。 */
export function clipped(from, to, now = Date.now()) {
  const out = [];
  for (const r of state.records) {
    if (!Number.isFinite(r.start)) continue;
    const rs = r.start;
    const re = r.end != null ? r.end : (r.pausedAt != null ? r.pausedAt : now);
    if (!Number.isFinite(re) || re <= from || rs >= to) continue;
    const s = Math.max(rs, from);
    const e = Math.min(re, to);
    if (e > s) out.push({ rec: r, s, e, ms: e - s });
  }
  out.sort((a, b) => a.s - b.s);
  return out;
}

export function sumByType(from, to, now = Date.now()) {
  const map = new Map();
  for (const c of clipped(from, to, now)) {
    map.set(c.rec.typeId, (map.get(c.rec.typeId) || 0) + c.ms);
  }
  return map;
}

export function totalMs(from, to, now = Date.now()) {
  let t = 0;
  for (const c of clipped(from, to, now)) t += c.ms;
  return t;
}

export function dayMs(ts, typeId = null) {
  const from = startOfDay(ts);
  const to = from + 86400000;
  if (typeId) {
    const ids = new Set([typeId, ...descendants(typeId)]);
    let t = 0;
    for (const c of clipped(from, to)) if (ids.has(c.rec.typeId)) t += c.ms;
    return t;
  }
  return totalMs(from, to);
}

/* ---------------- 持久化 ---------------- */

async function persistSettings() {
  await db.kvSet('settings', state.settings);
}

async function persistAll() {
  await db.clear('records');
  await db.bulkPut('records', state.records);
  await db.clear('types');
  await db.bulkPut('types', state.types);
  await db.clear('goals');
  await db.bulkPut('goals', state.goals);
  await persistSettings();
}

/* ---------------- 撤销 ---------------- */

const undoStack = [];
const snapshot = () => ({
  records: state.records.map((r) => ({ ...r })),
  types: state.types.map((t) => ({ ...t })),
  goals: state.goals.map((g) => ({ ...g, typeIds: (g.typeIds || []).slice() })),
});

export function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 20) undoStack.shift();
  state.canUndo = true;
}

export function canUndo() { return undoStack.length > 0; }

export async function undo() {
  const snap = undoStack.pop();
  if (!snap) return false;
  state.records = snap.records;
  state.types = snap.types;
  state.goals = snap.goals;
  await persistAll();
  emit();
  return true;
}

/* ---------------- 计时动作 ---------------- */

function closeRecord(rec, at = Date.now()) {
  const stop = rec.pausedAt != null ? rec.pausedAt : at;
  rec.end = Math.max(stop, rec.start);
  if (rec.pausedAt != null) rec.pausedAt = null;
  return rec;
}

function tooShort(rec) {
  const min = (state.settings.minDur || 0) * 1000;
  return min > 0 && elapsed(rec) < min;
}

export async function startType(typeId) {
  const now = Date.now();
  // 已经是这一种在跑：当成「继续」，别再开一条 0 秒的新记录（连点两下也不怕）
  const same = running();
  if (same && same.typeId === typeId) {
    if (same.pausedAt != null) await resumeRunning();
    return same;
  }
  pushUndo();
  const cur = running();
  let dropped = null;
  if (cur) {
    closeRecord(cur, now);
    if (tooShort(cur)) {
      dropped = cur;
      state.records = state.records.filter((r) => r.id !== cur.id);
    }
  }
  const rec = {
    id: uid(), typeId, start: now, end: null,
    pausedMs: 0, pausedAt: null, note: '', tags: [],
  };
  state.records = state.records.filter((r) => r.id !== rec.id).concat(rec);
  state.settings = { ...state.settings, lastType: typeId };

  if (dropped) await db.del('records', dropped.id);
  await db.put('records', rec);
  if (cur && cur !== dropped) await db.put('records', cur);
  await persistSettings();
  emit('timer');
  return rec;
}

export async function stopRunning() {
  const cur = running();
  if (!cur) return null;
  pushUndo();
  closeRecord(cur, Date.now());
  if (tooShort(cur)) {
    state.records = state.records.filter((r) => r.id !== cur.id);
    await db.del('records', cur.id);
    emit('timer');
    return null;
  }
  await db.put('records', cur);
  emit('timer');
  return cur;
}

export async function pauseRunning() {
  const cur = running();
  if (!cur || cur.pausedAt != null) return;
  pushUndo();
  cur.pausedAt = Date.now();
  await db.put('records', cur);
  emit('timer');
}

export async function resumeRunning() {
  const cur = running();
  if (!cur || cur.pausedAt == null) return;
  pushUndo();
  cur.pausedMs = (cur.pausedMs || 0) + (Date.now() - cur.pausedAt);
  cur.pausedAt = null;
  await db.put('records', cur);
  emit('timer');
}

/* ---------------- 记录增删改 ---------------- */

/** 只把变动的那几条写进库。以前是「clear 全部 + bulkPut 全部」，
    记录一多（几千条）每补一条都要重写整张表，手机上会卡一下。 */
function sameRecord(a, b) {
  return a && b
    && a.typeId === b.typeId && a.start === b.start && a.end === b.end
    && (a.pausedMs || 0) === (b.pausedMs || 0) && (a.pausedAt ?? null) === (b.pausedAt ?? null)
    && (a.note || '') === (b.note || '')
    && (a.tags || []).join('\u0001') === (b.tags || []).join('\u0001');
}

async function saveRecordsDiff(prev, next) {
  const before = new Map(prev.map((r) => [r.id, r]));
  const after = new Set(next.map((r) => r.id));
  const put = [];
  for (const r of next) if (!sameRecord(before.get(r.id), r)) put.push(r);
  const del = prev.filter((r) => !after.has(r.id)).map((r) => r.id);
  if (put.length) await db.bulkPut('records', put);
  for (const id of del) await db.del('records', id);
}

/** 把 list 里跟 [start,end) 重叠的部分裁掉，返回 { kept, trimmed }。
    已经结束的记录：左边留头、右边留尾（尾巴换个新 id）。
    正在计时的记录：同样在插入点断开，右边那段接着记，计时不会停。 */
function trimAround(list, start, end, now = Date.now()) {
  const kept = [];
  let trimmed = 0;
  for (const r of list) {
    const eff = r.end != null ? r.end : (r.pausedAt != null ? r.pausedAt : now);
    if (!Number.isFinite(r.start) || !Number.isFinite(eff)) { kept.push(r); continue; }
    if (eff <= start || r.start >= end) { kept.push(r); continue; }
    trimmed += Math.min(eff, end) - Math.max(r.start, start);
    const running = r.end == null;
    if (running) {
      if (r.start < start) kept.push({ ...r, end: start, pausedAt: null });
      if (end < eff) {
        kept.push({
          ...r, id: uid(), start: end, end: null, pausedMs: 0,
          pausedAt: r.pausedAt != null && r.pausedAt > end ? r.pausedAt : null,
        });
      }
      continue;
    }
    if (r.start < start) kept.push({ ...r, end: start });
    if (end < eff) kept.push({ ...r, id: uid(), start: end, end: eff, pausedMs: 0, pausedAt: null });
  }
  return { kept, trimmed };
}

/** 补记：会裁剪掉重叠的记录（新记录优先），返回被裁掉的毫秒数 */
export async function addRecord({ typeId, start, end, note = '', tags = [] }) {
  pushUndo();
  const now = Date.now();
  // 时间给歪了也别写进去：缺头用尾补，倒着的调过来，未来的一律压到现在
  let s = Number.isFinite(start) ? start : (Number.isFinite(end) ? end : now);
  let e = Number.isFinite(end) ? end : null;
  if (e != null && e < s) { const t = s; s = e; e = t; }
  if (s > now) s = now;
  if (e != null && e > now) e = now;
  const rec = { id: uid(), typeId, start: s, end: e, pausedMs: 0, pausedAt: null, note, tags };
  const prev = state.records;
  const { kept, trimmed } = trimAround(prev, s, e, now);
  kept.push(rec);
  state.records = kept;
  await saveRecordsDiff(prev, kept);
  emit();
  return { rec, trimmed };
}

export async function updateRecord(id, patch) {
  const rec = state.records.find((r) => r.id === id);
  if (!rec) return;
  pushUndo();
  Object.assign(rec, patch);

  // 时间被改动之后可能压到别人身上：跟补记一样裁剪（自己不算在内）
  if (!Number.isFinite(rec.start)) rec.start = Date.now();
  if (rec.end != null) {
    if (!Number.isFinite(rec.end) || rec.end < rec.start) rec.end = rec.start;
    if (rec.pausedAt != null) rec.pausedAt = null;
  }
  const eff = rec.end != null ? rec.end : (rec.pausedAt != null ? rec.pausedAt : Date.now());
  const prev = state.records;
  const others = prev.filter((r) => r.id !== id);
  const { kept } = trimAround(others, rec.start, eff, Date.now());
  state.records = kept.concat(rec);

  await saveRecordsDiff(prev, state.records);
  emit();
}

export async function deleteRecord(id) {
  const i = state.records.findIndex((r) => r.id === id);
  if (i < 0) return;
  pushUndo();
  state.records.splice(i, 1);
  await db.del('records', id);
  emit();
}

export async function duplicateRecord(id) {
  const r = state.records.find((x) => x.id === id);
  if (!r) return;
  // 用「真正计时了多久」来复制，暂停掉的那段不算
  const len = Math.max(60000, elapsed(r, Date.now()));
  const now = Date.now();
  // 接着原记录的结尾往后放；若结尾在未来（时间填歪了），
  // 改成「刚好在现在结束」——否则 addRecord 会把两头都压到现在，复制出 0 秒的记录
  let at = r.end != null ? r.end : now;
  if (at + len > now) at = Math.max(0, now - len);
  return addRecord({
    typeId: r.typeId,
    start: at,
    end: at + len,
    note: r.note,
    tags: r.tags || [],
  });
}

/* ---------------- 类型 ---------------- */

export async function addType(data) {
  pushUndo();
  const maxOrder = state.types.reduce((m, t) => Math.max(m, t.order || 0), 0);
  const parent = data?.parentId ? state.types.find((t) => t.id === data.parentId) : null;
  const t = {
    id: uid(), name: '新类型', icon: 'book',
    // 子类型默认跟分组同色，一眼就能看出它属于哪一组
    color: (parent && parent.color) || PALETTE[state.types.length % PALETTE.length],
    parentId: null, order: maxOrder + 1, counts: false, isGroup: false, ...data,
  };
  if (t.color == null) t.color = (parent && parent.color) || PALETTE[0];
  state.types.push(t);
  await db.put('types', t);
  emit();
  return t;
}

/* 改类型。opts.withKids 默认 true：分组改色时子类型跟着换 —— 同组一色，
   分组卡片、类型胶囊、统计图里的颜色才对得上。 */
export async function updateType(id, patch, opts = {}) {
  const t = state.types.find((x) => x.id === id);
  if (!t) return;
  pushUndo();
  Object.assign(t, patch);
  const touched = [t];
  if (patch.color != null && opts.withKids !== false) {
    for (const k of state.types.filter((x) => x.parentId === id)) {
      if (k.color !== patch.color) {
        k.color = patch.color;
        touched.push(k);
      }
    }
  }
  await db.bulkPut('types', touched);
  emit();
}

/**
 * 换语言之后，把「还叫默认名字」的类型名跟着换一下。
 * 只动精确匹配种子名的那些（学习→Study、英语→English…），
 * 用户自己起的名字一律不碰；整个操作可撤销。
 */
export async function followLangNames() {
  const next = new Map();
  for (const t of state.types) {
    const nn = renameSeedName(t.name);
    if (nn && nn !== t.name) next.set(t.id, nn);
  }
  if (!next.size) return 0;
  pushUndo();
  const touched = [];
  for (const t of state.types) {
    if (next.has(t.id)) { t.name = next.get(t.id); touched.push(t); }
  }
  await db.bulkPut('types', touched);
  emit('order');
  return touched.length;
}

export async function deleteType(id) {
  const gone = new Set(state.types.filter((t) => t.id === id || t.parentId === id).map((t) => t.id));
  if (!gone.size) return;
  pushUndo();
  state.types = state.types.filter((t) => !gone.has(t.id));
  await db.clear('types');
  await db.bulkPut('types', state.types);

  // 记录保留，展示为「未分类」。但如果正在计时的那种类型被删了，
  // 一定要把计时器停掉——否则状态卡会顶着一个不存在的类型一直往下跑。
  const touched = [];
  for (const r of state.records) {
    if (!gone.has(r.typeId)) continue;
    r.typeId = null;
    if (r.end == null) {
      r.end = Math.max(r.pausedAt != null ? r.pausedAt : Date.now(), r.start);
      r.pausedAt = null;
    }
    touched.push(r);
  }
  if (touched.length) await db.bulkPut('records', touched);
  emit('timer');
}

/* 拖动排序：把 id 挪到 parentId 名下、排到 beforeId 之前（beforeId 为 null 就排最后）。
   只碰 parentId 和 order 两个字段，其余原样。两级封顶：分组不能再塞进分组。 */
export async function moveType(id, parentId = null, beforeId = null) {
  const t = state.types.find((x) => x.id === id);
  if (!t) return { ok: false, why: 'missing' };
  const dest = parentId ? state.types.find((x) => x.id === parentId) : null;
  if (parentId && !dest) return { ok: false, why: 'missing' };
  if (dest && dest.id === id) return { ok: false, why: 'self' };
  if (dest && dest.parentId) return { ok: false, why: 'too-deep' };
  if (dest && state.types.some((x) => x.parentId === id)) return { ok: false, why: 'has-kids' };

  const from = t.parentId || null;
  if (from === (parentId || null) && beforeId === id) return { ok: false, why: 'same' };

  const pick = (pid) => state.types
    .filter((x) => (x.parentId || null) === (pid || null) && x.id !== id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const destList = pick(parentId || null);
  const at = beforeId ? destList.findIndex((x) => x.id === beforeId) : -1;

  pushUndo();
  t.parentId = parentId || null;
  // 拖动只决定「放在哪」，不改颜色 —— 手动调过的深浅不能被一次拖动抹掉。
  // 同组一色靠两处显式动作：新建时继承父级颜色、改分组颜色时子类型跟着换。
  destList.splice(at < 0 ? destList.length : at, 0, t);
  destList.forEach((x, i) => { x.order = i; });

  const touched = [...destList];
  if (from !== (parentId || null)) {
    pick(from).forEach((x, i) => { x.order = i; touched.push(x); });
  }
  await db.bulkPut('types', touched);
  emit('order');
  return { ok: true };
}

/* ---------------- 目标 ---------------- */

export async function addGoal(data) {
  pushUndo();
  const g = {
    id: uid(), name: '新目标', typeIds: [], period: 'week', mode: 'reach',
    targetMin: 600, ...data,
  };
  state.goals.push(g);
  await db.put('goals', g);
  emit();
  return g;
}

export async function updateGoal(id, patch) {
  const g = state.goals.find((x) => x.id === id);
  if (!g) return;
  pushUndo();
  Object.assign(g, patch);
  await db.put('goals', g);
  emit();
}

export async function deleteGoal(id) {
  pushUndo();
  state.goals = state.goals.filter((g) => g.id !== id);
  await db.del('goals', id);
  emit();
}

export function goalRange(g, now = Date.now()) {
  if (g.period === 'day') return [startOfDay(now), endOfDay(now)];
  if (g.period === 'year') {
    const d = new Date(now);
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    const e = new Date(d);
    e.setFullYear(e.getFullYear() + 1);
    return [d.getTime(), e.getTime()];
  }
  if (g.period === 'month') {
    const d = new Date(startOfMonth(now));
    const e = new Date(d); e.setMonth(e.getMonth() + 1);
    return [d.getTime(), e.getTime()];
  }
  return [startOfWeek(now), startOfWeek(now) + 7 * 86400000];
}

export function goalProgress(g, now = Date.now()) {
  const [from, to] = goalRange(g, now);
  let cur = 0;
  if (!g.typeIds || !g.typeIds.length) {
    cur = totalMs(from, to, now);
  } else {
    // 选中分组时把子类型一起算进来
    const ids = new Set();
    for (const id of g.typeIds) { ids.add(id); descendants(id).forEach((d) => ids.add(d)); }
    for (const c of clipped(from, to, now)) {
      if (ids.has(c.rec.typeId)) cur += c.ms;
    }
  }
  const target = Math.max(1, (g.targetMin || 0) * 60000);
  return { cur, target, pct: Math.min(1, cur / target), over: cur > target };
}

/* ---------------- 设置 ---------------- */

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await persistSettings();
  emit();
}

/* ---------------- 导入导出 ---------------- */

export function exportBundle() {
  return {
    app: 'cike', version: 1, exportedAt: new Date().toISOString(),
    types: state.types, records: state.records, goals: state.goals, settings: state.settings,
  };
}

/** 把外面进来的数据洗一遍：缺字段、时间不是数字、引用不到的类型，都收拾干净再存，
    免得一份坏备份把整个列表画成 NaN */
function cleanRecords(list) {
  const out = [];
  let openSeen = false;
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const start = Number(r.start);
    if (!Number.isFinite(start)) continue;
    const end = r.end == null ? null : Number(r.end);
    const pausedAt = r.pausedAt == null ? null : Number(r.pausedAt);
    const rec = {
      id: typeof r.id === 'string' && r.id ? r.id : uid(),
      typeId: typeof r.typeId === 'string' ? r.typeId : '',
      start,
      end: Number.isFinite(end) && end >= start ? end : null,
      pausedMs: Number.isFinite(Number(r.pausedMs)) ? Math.max(0, Number(r.pausedMs)) : 0,
      pausedAt: Number.isFinite(pausedAt) ? pausedAt : null,
      note: typeof r.note === 'string' ? r.note : '',
      tags: Array.isArray(r.tags) ? r.tags.filter((x) => typeof x === 'string') : [],
    };
    if (rec.end == null) {
      // 只允许一条「正在计时」，多出来的按已结束处理
      if (openSeen) rec.end = Math.max(start, rec.pausedAt ?? start);
      else openSeen = true;
    }
    if (rec.end != null) rec.pausedAt = null;
    out.push(rec);
  }
  return out;
}

function cleanTypes(list, fallback) {
  const seen = new Set();
  const out = [];
  for (const t of Array.isArray(list) ? list : []) {
    if (!t || typeof t !== 'object' || !t.name) continue;
    const id = typeof t.id === 'string' && t.id && !seen.has(t.id) ? t.id : uid();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: String(t.name).slice(0, 40),
      icon: ICONS.includes(t.icon) ? t.icon : 'book',
      color: typeof t.color === 'string' ? t.color : PALETTE[out.length % PALETTE.length],
      parentId: typeof t.parentId === 'string' && t.parentId !== id ? t.parentId : null,
      order: Number.isFinite(Number(t.order)) ? Number(t.order) : out.length,
      counts: !!t.counts,
      isGroup: !!t.isGroup,
    });
  }
  // 父级引用不存在的，就当没分组；父级本身也是子类型的，也只留两层
  const byId = new Map(out.map((t) => [t.id, t]));
  for (const t of out) {
    if (!t.parentId) continue;
    const p = byId.get(t.parentId);
    if (!p || p.parentId) t.parentId = null;
  }
  return out.length ? out : fallback;
}

function cleanGoals(list, typeIds) {
  return (Array.isArray(list) ? list : [])
    .filter((g) => g && typeof g === 'object' && g.name)
    .map((g) => ({
      id: typeof g.id === 'string' && g.id ? g.id : uid(),
      name: String(g.name).slice(0, 40),
      typeIds: (Array.isArray(g.typeIds) ? g.typeIds : []).filter((id) => typeIds.has(id)),
      period: ['day', 'week', 'month', 'year'].includes(g.period) ? g.period : 'week',
      mode: g.mode === 'limit' ? 'limit' : 'reach',
      targetMin: Number.isFinite(Number(g.targetMin)) ? Math.max(1, Number(g.targetMin)) : 60,
    }));
}

export async function importBundle(obj) {
  if (!obj || !Array.isArray(obj.records)) throw new Error('文件格式不对');
  pushUndo();
  state.types = cleanTypes(obj.types, state.types);
  state.records = cleanRecords(obj.records);
  state.goals = cleanGoals(obj.goals, new Set(state.types.map((t) => t.id)));
  if (obj.settings && typeof obj.settings === 'object') {
    state.settings = { ...DEFAULT_SETTINGS, ...obj.settings };
    // 备份里的关注范围可能指向这份文件里没有的类型，落地前先滤一遍
    const have = new Set(state.types.map((t) => t.id));
    state.settings.focusIds = (Array.isArray(state.settings.focusIds) ? state.settings.focusIds : []).filter((id) => have.has(id));
  }
  await persistAll();
  emit();
}

export async function wipeAll() {
  pushUndo();
  state.records = [];
  state.goals = [];
  await persistAll();
  emit();
}

/* ---------------- 示例数据 ---------------- */

/** 只在一条记录都没有时铺一周虚构时间表，方便先看界面 */
export async function seedDemo() {
  if (state.records.length) return false;

  const H = 3600000;
  const M = 60000;
  const today = startOfDay();
  // [类型, 开始时刻, 结束时刻, 备注, 标签]
  const plan = [
    ['t9', 7 * H + 30 * M, 8 * H + 15 * M, '', []],
    ['t8', 8 * H + 20 * M, 9 * H, '煎蛋和牛奶', []],
    ['t3', 9 * H + 10 * M, 11 * H + 40 * M, '把时间记录 App 的撤销做完了', ['深度', '专注']],
    ['t8', 11 * H + 45 * M, 12 * H + 25 * M, '', []],
    ['t4', 12 * H + 30 * M, 13 * H + 10 * M, '《深度工作》第三章', ['读书']],
    ['t5', 13 * H + 20 * M, 17 * H + 50 * M, '', ['会议']],
    ['t6', 18 * H + 10 * M, 19 * H, '跑步 5 公里', ['户外']],
    ['t8', 19 * H + 5 * M, 19 * H + 45 * M, '', []],
    ['t2', 20 * H, 21 * H + 30 * M, '听力精听 + 跟读', ['英语']],
    ['t1', 21 * H + 40 * M, 22 * H + 20 * M, '', []],
  ];
  const weekend = [
    ['t6', 10 * H, 11 * H + 20 * M, '羽毛球', ['户外']],
    ['t4', 14 * H, 16 * H, '', ['读书']],
    ['t7', 16 * H + 30 * M, 17 * H + 30 * M, '午睡', []],
  ];
  const rand = (lo, hi) => lo + Math.floor(((Math.sin(Date.now() / 1000 + lo + hi) + 1) / 2) * (hi - lo));

  const recs = [];
  for (let d = 6; d >= 0; d--) {
    const day = today - d * 86400000;
    const dow = new Date(day).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const items = isWeekend ? [...weekend] : plan;
    for (const [typeId, s, e, note, tags] of items) {
      const jitter = isWeekend ? 0 : rand(-8, 12) * M;
      const st = day + Math.max(0, s + jitter);
      const en = day + e + (isWeekend ? 0 : rand(-6, 10) * M);
      if (d === 0 && st > Date.now()) continue; // 今天还没到的就别造了
      recs.push({
        id: uid(), typeId, start: st, end: Math.min(en, d === 0 ? Date.now() : en),
        pausedMs: 0, pausedAt: null, note, tags,
      });
    }
    // 睡眠跨天
    const sleepStart = day + 23 * H + 20 * M;
    if (sleepStart < Date.now()) {
      recs.push({
        id: uid(), typeId: 't7', start: sleepStart, end: Math.min(day + 86400000 + 7 * H, Date.now()),
        pausedMs: 0, pausedAt: null, note: '', tags: [],
      });
    }
  }
  recs.sort((a, b) => a.start - b.start);

  pushUndo();
  state.records = recs;
  await db.clear('records');
  await db.bulkPut('records', recs);

  if (!state.goals.length) {
    const goals = [
      { id: uid(), name: '每周编程 10 小时', typeIds: ['t3'], period: 'week', mode: 'reach', targetMin: 600 },
      { id: uid(), name: '每天睡眠不超过 8 小时', typeIds: ['t7'], period: 'day', mode: 'limit', targetMin: 480 },
    ];
    state.goals = goals;
    await db.clear('goals');
    await db.bulkPut('goals', goals);
  }
  emit();
  return true;
}
