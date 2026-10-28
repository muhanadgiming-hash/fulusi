// منطق الحسابات — منقول من معادلات ملف Excel «فلوسي بوضوح» كما هي.
// دوال نقية بلا أي اعتماد على المتصفح، حتى يمكن اختبارها مباشرة مقابل نتائج Excel.

export const TYPES = { INCOME: 'دخل', EXPENSE: 'مصروف', SAVING: 'ادخار' };
export const GENERAL_SAVING = 'ادخار عام';
export const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو',
  'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const DEFAULT_EXPENSE_CATS = ['السكن', 'الطعام والمقاضي', 'المواصلات', 'الفواتير', 'الصحة', 'التسوق',
  'العناية الشخصية', 'الترفيه', 'الالتزامات والأقساط', 'الهدايا', 'أخرى'];
export const DEFAULT_INCOME_CATS = ['الراتب', 'دخل إضافي', 'عمل حر', 'أخرى'];
export const MAX_GOALS = 6;

const pad = (n) => String(n).padStart(2, '0');
export const monthKey = (y, m) => `${y}-${pad(m)}`;            // m: 1..12
export const monthLabel = (y, m) => `${MONTHS[m - 1]} ${y}`;

/** Excel's N(): numbers stay, everything else becomes 0. */
export const N = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

/** Convert user input (Arabic-Indic digits, commas, «ر.س») to a number, or NaN. */
export function parseAmount(input) {
  if (typeof input === 'number') return input;
  let s = String(input ?? '').trim();
  s = s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660))
       .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6F0))
       .replace(/٫/g, '.')
       .replace(/[\s,٬،]/g, '')
       .replace(/(ر\.?س\.?|ريال|SAR|SR)/gi, '');
  if (s === '' || !/^-?\d*\.?\d+$/.test(s)) return NaN;
  return Number(s);
}

/** A valid ISO date string YYYY-MM-DD (the app stores dates as strings: no time-zone drift). */
export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const inMonth = (tx, y, m) => typeof tx.date === 'string' && tx.date.startsWith(monthKey(y, m) + '-');
const sumWhere = (txs, pred) => txs.reduce((t, x) => (pred(x) ? t + N(x.amount) : t), 0);

/** ورقة «ملخص أموالي»: C10..C14 */
export function monthSummary(txs, y, m) {
  const income = sumWhere(txs, (x) => x.type === TYPES.INCOME && inMonth(x, y, m));
  const expense = sumWhere(txs, (x) => x.type === TYPES.EXPENSE && inMonth(x, y, m));
  const saving = sumWhere(txs, (x) => x.type === TYPES.SAVING && inMonth(x, y, m));
  return {
    income, expense, saving,
    remaining: income - expense - saving,                 // C13 = C10-C11-C12
    expenseRatio: income > 0 ? expense / income : null,   // C14 = IF(C10>0,C11/C10,"—")
  };
}

/** C15: كل الادخار المسجل في كل الأشهر + «مدخر سابقًا» لكل الأهداف */
export function totalSavedAllTime(txs, goals) {
  return sumWhere(txs, (x) => x.type === TYPES.SAVING) + goals.reduce((t, g) => t + N(g.prev), 0);
}

/** B16: رسالة الملخص */
export function summaryMessage(s) {
  if (s.income === 0) return { level: 'info', text: 'سجّلي دخل هذا الشهر لتظهر لكِ النتيجة كاملة.' };
  if (s.remaining < 0) return { level: 'bad', text: 'صرفتِ وادّخرتِ أكثر من دخلك هذا الشهر. راجعي أكبر التصنيفات بالأسفل.' };
  if (s.expense / s.income <= 0.7) return { level: 'good', text: 'ممتاز! مصروفاتك أقل من 70% من دخلك.' };
  return { level: 'warn', text: 'جيد، حاولي أن تبقى المصروفات أقل من 70% من الدخل.' };
}

/** «أين ذهبت مصروفاتي؟»: C21:D32 + ملاحظة B33 */
export function expensesByCategory(txs, y, m, cats) {
  const total = sumWhere(txs, (x) => x.type === TYPES.EXPENSE && inMonth(x, y, m));
  const rows = cats.map((name) => {
    const amount = sumWhere(txs, (x) => x.type === TYPES.EXPENSE && x.cat === name && inMonth(x, y, m));
    return { name, amount, share: total > 0 ? amount / total : 0 };
  });
  const categorized = rows.reduce((t, r) => t + r.amount, 0);
  return { rows, categorized, uncategorized: total - categorized > 0.005 ? total - categorized : 0 };
}

/** ورقة «ميزانية الشهر»: الحالة G8 */
export function budgetStatus(budget, actual) {
  const b = N(budget);
  if (b === 0) return actual > 0 ? 'none' : 'empty';    // «حدّدي ميزانية» / «—»
  if (actual > b) return 'over';                         // تجاوزتِ
  if (actual >= 0.8 * b) return 'near';                  // اقتربتِ
  return 'ok';                                           // ممتاز
}
export const STATUS_LABEL = { none: 'حدّدي ميزانية', empty: '—', over: 'تجاوزتِ', near: 'اقتربتِ', ok: 'ممتاز' };

export function budgetTable(txs, y, m, cats, budgets, income) {
  const rows = cats.map((name, i) => {
    const budget = N(budgets[i]);
    const actual = sumWhere(txs, (x) => x.type === TYPES.EXPENSE && x.cat === name && inMonth(x, y, m));
    return {
      name, budget, actual,
      remaining: budget > 0 ? budget - actual : 0,         // E8
      ratio: budget > 0 ? actual / budget : null,          // F8
      status: budgetStatus(budget, actual),                // G8
    };
  });
  const totalBudget = rows.reduce((t, r) => t + r.budget, 0);   // C19
  const totalActual = rows.reduce((t, r) => t + r.actual, 0);   // D19
  return {
    rows, totalBudget, totalActual,
    totalRemaining: totalBudget - totalActual,                   // E19
    totalRatio: totalBudget > 0 ? totalActual / totalBudget : null, // F19
    fit: { income, budgets: totalBudget, leftForSaving: income - totalBudget }, // E24:E26
  };
}

/** ورقة «أهداف الادخار» لكل هدف: C14..C18. today: 'YYYY-MM-DD' */
export function goalProgress(goal, txs, today) {
  const target = N(goal.target);
  const saved = !goal.name ? 0 : N(goal.prev) + sumWhere(txs, (x) => x.type === TYPES.SAVING && x.cat === goal.name);
  const remaining = Math.max(0, target - saved);
  const ratio = target > 0 ? Math.min(1, saved / target) : 0;
  const filled = Math.round(ratio * 10);
  let monthly;
  if (!goal.date || remaining === 0) monthly = null;                  // «—»
  else if (goal.date <= today) monthly = 'expired';                   // «انتهى الموعد»
  else {
    const [ty, tm] = goal.date.split('-').map(Number);
    const [cy, cm] = today.split('-').map(Number);
    monthly = remaining / Math.max(1, (ty - cy) * 12 + tm - cm);
  }
  return { target, saved, remaining, ratio, bar: '█'.repeat(filled) + '░'.repeat(10 - filled), monthly };
}

export function goalsSummary(goals, txs, today) {
  const list = goals.map((g) => ({ goal: g, ...goalProgress(g, txs, today) }));
  const totalSaved = list.reduce((t, x) => t + x.saved, 0);            // C6
  const totalTarget = goals.reduce((t, g) => t + N(g.target), 0);
  return { list, totalSaved, overall: totalTarget > 0 ? Math.min(1, totalSaved / totalTarget) : 0 }; // C7
}

/** «مراجعة نهاية الشهر»: أعلى 3 تصنيفات (التعادل يُحسم بترتيب القائمة كما في Excel) */
export function topCategories(txs, y, m, cats, n = 3) {
  const { rows } = expensesByCategory(txs, y, m, cats);
  const total = rows.reduce((t, r) => t + r.amount, 0) || 0;
  const expense = sumWhere(txs, (x) => x.type === TYPES.EXPENSE && inMonth(x, y, m));
  return rows.map((r, i) => ({ ...r, i }))
    .sort((a, b) => (b.amount - a.amount) || (a.i - b.i))
    .slice(0, n)
    .map((r) => (r.amount > 0 ? { name: r.name, amount: r.amount, share: expense > 0 ? r.amount / expense : 0 }
                              : { name: null, amount: 0, share: 0 }));
}

/** C19..C23 */
export function budgetVsActual(txs, y, m, cats, budgets) {
  const t = budgetTable(txs, y, m, cats, budgets, 0);
  const expense = monthSummary(txs, y, m).expense;
  const overCount = t.rows.filter((r) => r.budget > 0 && r.actual > r.budget).length;
  let message;
  if (t.totalBudget === 0) message = 'حدّدي ميزانيتك في «الميزانية» لتظهر المقارنة.';
  else if (overCount === 0) message = 'رائع! لم تتجاوزي أي ميزانية هذا الشهر.';
  else message = 'انظري صفحة «الميزانية» لمعرفة التصنيفات الحمراء.';
  return { totalBudget: t.totalBudget, actual: expense, diff: t.totalBudget - expense, overCount, message };
}

/** A3 في السجل */
export function logStats(txs) {
  const count = txs.filter((x) => typeof x.amount === 'number' && isFinite(x.amount)).length;
  const bal = sumWhere(txs, (x) => x.type === TYPES.INCOME) - sumWhere(txs, (x) => x.type === TYPES.EXPENSE)
            - sumWhere(txs, (x) => x.type === TYPES.SAVING);
  return { count, balance: bal };
}

/** قائمة التصنيفات حسب النوع (التحقق من البيانات في عمود التصنيف) */
export function categoriesFor(type, settings, goals) {
  if (type === TYPES.INCOME) return settings.incomeCats;
  if (type === TYPES.SAVING) return [GENERAL_SAVING, ...goals.map((g) => g.name).filter(Boolean)];
  return settings.expenseCats;
}

// ---------- التنسيق ----------
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const fmtMoney = (v, decimals = false) => `${(decimals ? nf2 : nf0).format(Math.round(v * 100) / 100)} ر.س`;
export const fmtPct = (r) => (r === null || r === undefined ? '—' : `${Math.round(r * 100)}%`);
