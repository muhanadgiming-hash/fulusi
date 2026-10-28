// تخزين محلي في IndexedDB. كل الدوال تُرجع Promise لا يُحلّ إلا بعد اكتمال المعاملة فعليًا (oncomplete).
import { DEFAULT_EXPENSE_CATS, DEFAULT_INCOME_CATS, TYPES, isValidDate, MAX_GOALS } from './calc.js';

const DB_NAME = 'fulusi-bewuduh';
const DB_VERSION = 1;
export const BACKUP_FORMAT = 'fulusi-bewuduh-backup';
export const BACKUP_VERSION = 1;

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) return reject(new Error('المتصفح لا يدعم التخزين المحلي (IndexedDB).'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tx')) {
        const s = db.createObjectStore('tx', { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbp = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('أغلقي النوافذ الأخرى المفتوحة للتطبيق ثم أعيدي المحاولة.'));
  });
  return dbp;
}

/** Run fn(stores) inside one transaction; resolves with fn's result only after the transaction commits. */
async function run(storeNames, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    let result;
    const t = db.transaction(storeNames, mode);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error || new Error('تعذّر الحفظ'));
    t.onabort = () => reject(t.error || new Error('أُلغيت عملية الحفظ'));
    const stores = Object.fromEntries(storeNames.map((n) => [n, t.objectStore(n)]));
    try {
      const r = fn(stores, t);
      if (r && typeof r.then === 'function') r.then((v) => { result = v; }, (e) => { t.abort(); reject(e); });
      else result = r;
    } catch (e) { try { t.abort(); } catch (_) {} reject(e); }
  });
}
const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const uid = () => (self.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ---------- defaults ----------
export const defaultState = () => ({
  settings: { expenseCats: [...DEFAULT_EXPENSE_CATS], incomeCats: [...DEFAULT_INCOME_CATS] },
  budgets: DEFAULT_EXPENSE_CATS.map(() => 0),
  goals: [],
  reviews: {},
  meta: { lastBackup: null, createdAt: new Date().toISOString() },
});
const KV_KEYS = ['settings', 'budgets', 'goals', 'reviews', 'meta'];

export async function loadAll() {
  return run(['tx', 'kv'], 'readonly', async ({ tx, kv }) => {
    const [txs, kvs] = await Promise.all([req2p(tx.getAll()), req2p(kv.getAll())]);
    const d = defaultState();
    for (const { key, value } of kvs) if (KV_KEYS.includes(key)) d[key] = value;
    return { ...d, transactions: txs };
  });
}

// ---------- validation ----------
export function validateTx(t, { expenseCats, incomeCats }, goals) {
  const errors = [];
  if (!isValidDate(t.date)) errors.push('التاريخ غير صحيح.');
  if (![TYPES.INCOME, TYPES.EXPENSE, TYPES.SAVING].includes(t.type)) errors.push('اختاري نوع العملية.');
  if (typeof t.amount !== 'number' || !isFinite(t.amount)) errors.push('اكتبي المبلغ رقمًا، مثل 150 أو ١٥٠.');
  else if (t.amount <= 0) errors.push('المبلغ يجب أن يكون أكبر من صفر.');
  else if (t.amount > 1e9) errors.push('المبلغ كبير جدًا.');
  if (!t.cat) errors.push('اختاري التصنيف.');
  if (typeof t.desc === 'string' && t.desc.length > 200) errors.push('الوصف طويل جدًا.');
  return errors;
}

// ---------- transactions ----------
export async function saveTx(t) {
  const now = new Date().toISOString();
  const rec = { ...t, id: t.id || uid(), createdAt: t.createdAt || now, updatedAt: now };
  await run(['tx'], 'readwrite', ({ tx }) => { tx.put(rec); });
  return rec;
}
export async function deleteTx(id) { await run(['tx'], 'readwrite', ({ tx }) => { tx.delete(id); }); }

export async function setKV(key, value) {
  if (!KV_KEYS.includes(key)) throw new Error('مفتاح غير معروف');
  await run(['kv'], 'readwrite', ({ kv }) => { kv.put({ key, value }); });
}

/** Rename a category (or goal) and move every transaction using the old name, atomically. */
export async function renameCategory({ kind, index, newName, state }) {
  const old = kind === 'goal' ? state.goals[index].name : state.settings[kind][index];
  const type = kind === 'expenseCats' ? TYPES.EXPENSE : kind === 'incomeCats' ? TYPES.INCOME : TYPES.SAVING;
  return run(['tx', 'kv'], 'readwrite', async ({ tx, kv }) => {
    let moved = 0;
    if (old && old !== newName) {
      const all = await req2p(tx.getAll());
      for (const t of all) if (t.type === type && t.cat === old) { tx.put({ ...t, cat: newName, updatedAt: new Date().toISOString() }); moved++; }
    }
    if (kind === 'goal') {
      const goals = state.goals.map((g, i) => (i === index ? { ...g, name: newName } : g));
      kv.put({ key: 'goals', value: goals });
    } else {
      const settings = { ...state.settings, [kind]: state.settings[kind].map((c, i) => (i === index ? newName : c)) };
      kv.put({ key: 'settings', value: settings });
    }
    return moved;
  });
}

// ---------- backup ----------
export function buildBackup(state) {
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(),
    data: {
      settings: state.settings, budgets: state.budgets, goals: state.goals, reviews: state.reviews,
      transactions: state.transactions,
    },
  };
}

/** Validate a parsed backup; returns { ok, errors, data, counts }. Nothing is written here. */
export function checkBackup(obj) {
  const errors = [];
  if (!obj || obj.format !== BACKUP_FORMAT) return { ok: false, errors: ['هذا الملف ليس نسخة احتياطية من «فلوسي بوضوح».'] };
  if (obj.version > BACKUP_VERSION) return { ok: false, errors: ['النسخة الاحتياطية من إصدار أحدث من التطبيق. حدّثي التطبيق أولًا.'] };
  const d = obj.data || {};
  const s = d.settings;
  if (!s || !Array.isArray(s.expenseCats) || !Array.isArray(s.incomeCats) || !s.expenseCats.every((c) => typeof c === 'string' && c))
    errors.push('إعدادات التصنيفات تالفة.');
  if (!Array.isArray(d.budgets) || !d.budgets.every((b) => typeof b === 'number' && isFinite(b) && b >= 0)) errors.push('بيانات الميزانية تالفة.');
  if (!Array.isArray(d.goals) || d.goals.length > MAX_GOALS) errors.push('بيانات الأهداف تالفة.');
  if (!Array.isArray(d.transactions)) errors.push('سجل العمليات مفقود.');
  if (errors.length) return { ok: false, errors };
  const bad = d.transactions.filter((t) => !t || typeof t.id !== 'string' || validateTx(t, s, d.goals).length);
  if (bad.length) errors.push(`يوجد ${bad.length} عملية غير صالحة في الملف.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], data: d, counts: { transactions: d.transactions.length, goals: d.goals.length } };
}

/** Replace everything with the backup content in ONE transaction: either all is restored or nothing changes. */
export async function restoreBackup(data) {
  await run(['tx', 'kv'], 'readwrite', ({ tx, kv }) => {
    tx.clear(); kv.clear();
    for (const t of data.transactions) tx.put(t);
    kv.put({ key: 'settings', value: data.settings });
    kv.put({ key: 'budgets', value: data.budgets });
    kv.put({ key: 'goals', value: data.goals });
    kv.put({ key: 'reviews', value: data.reviews || {} });
    kv.put({ key: 'meta', value: { ...defaultState().meta, lastBackup: null, restoredAt: new Date().toISOString() } });
  });
}

export async function wipeAll() { await run(['tx', 'kv'], 'readwrite', ({ tx, kv }) => { tx.clear(); kv.clear(); }); }

export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch (_) {}
  return false;
}
