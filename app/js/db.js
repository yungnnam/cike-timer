/* 极简 IndexedDB 封装
   两条底线：
   1. IndexedDB 完全不可用（隐私模式、老 WebView）时自动退回 localStorage；
   2. 连接被浏览器单方面关掉（清站点数据、另一个标签升级版本、安卓回收存储）
      不是一次就废 —— 捕获到 InvalidStateError 就重连一次再试。
*/

const NAME = 'cike-db';
const VER = 1;
const STORES = ['types', 'records', 'goals', 'kv'];
const LS_PREFIX = 'cike:';

let _db = null;
let _fallback = false;

function lsRead(storeName) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + storeName);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function lsWrite(storeName, arr) {
  try { localStorage.setItem(LS_PREFIX + storeName, JSON.stringify(arr)); } catch (e) { /* 配额满 */ }
}

export async function openDB() {
  if (_db || _fallback) return _db;
  try {
    _db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: s === 'kv' ? 'k' : 'id' });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexeddb open failed'));
      req.onblocked = () => reject(new Error('indexeddb blocked'));
    });
    _db.onclose = () => { _db = null; };          // 被关掉了，下次调用自己重开
    _db.onversionchange = () => { _db?.close(); _db = null; };
  } catch (e) {
    console.warn('[db] IndexedDB 不可用，改用 localStorage：', e && e.message);
    _fallback = true;
    _db = null;
  }
  return _db;
}

/** 拿一个 objectStore；连接有问题就重连一次。拿不到（无 IndexedDB）返回 null。 */
async function store(storeName, mode) {
  await openDB();
  if (!_db) return null;
  try {
    return _db.transaction(storeName, mode).objectStore(storeName);
  } catch (e) {
    // InvalidStateError：连接正在关闭 / 已被关闭
    console.warn('[db] 连接失效，重连一次：', e && e.name);
    try { _db.close(); } catch (_) { /* 已经关了 */ }
    _db = null;
    await openDB();
    if (!_db) return null;
    try {
      return _db.transaction(storeName, mode).objectStore(storeName);
    } catch (e2) {
      console.warn('[db] 重连后仍失败，这次走内存/降级：', e2 && e2.name);
      return null;
    }
  }
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const keyOf = (name, v) => (name === 'kv' ? v.k : v.id);

export async function all(name) {
  const s = await store(name, 'readonly');
  if (!s) return lsRead(name);
  return wrap(s.getAll());
}

export async function put(name, value) {
  const s = await store(name, 'readwrite');
  if (!s) {
    const arr = lsRead(name);
    const k = keyOf(name, value);
    const i = arr.findIndex((x) => keyOf(name, x) === k);
    if (i >= 0) arr[i] = value; else arr.push(value);
    lsWrite(name, arr);
    return value;
  }
  await wrap(s.put(value));
  return value;
}

export async function del(name, key) {
  const s = await store(name, 'readwrite');
  if (!s) {
    lsWrite(name, lsRead(name).filter((x) => keyOf(name, x) !== key));
    return;
  }
  await wrap(s.delete(key));
}

export async function bulkPut(name, values) {
  if (!values || !values.length) return;
  const s = await store(name, 'readwrite');
  if (!s) {
    // 降级路径：按 key 合并，不能整张表覆盖——现在只写「变动的那几条」，
    // 覆盖会把没变的记录全冲掉。
    const arr = lsRead(name);
    const at = new Map(arr.map((x, i) => [keyOf(name, x), i]));
    for (const v of values) {
      const k = keyOf(name, v);
      const i = at.get(k);
      if (i == null) { at.set(k, arr.length); arr.push(v); } else { arr[i] = v; }
    }
    lsWrite(name, arr);
    return;
  }
  await new Promise((resolve, reject) => {
    const t = s.transaction;
    for (const v of values) s.put(v);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function clear(name) {
  const s = await store(name, 'readwrite');
  if (!s) { lsWrite(name, []); return; }
  await wrap(s.clear());
}

export async function kvGet(k, fallback = null) {
  const s = await store('kv', 'readonly');
  if (!s) {
    const rows = lsRead('kv');
    const hit = rows.find((x) => x.k === k);
    return hit ? hit.v : fallback;
  }
  const row = await wrap(s.get(k));
  return row ? row.v : fallback;
}

export async function kvSet(k, v) {
  return put('kv', { k, v });
}
