import * as C from './calc.js';
import * as db from './db.js';
import { APP_VERSION } from './version.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v, dec = false) => `<span class="num">${esc(C.fmtMoney(v, dec))}</span>`;
const pct = (r) => `<span class="num">${esc(C.fmtPct(r))}</span>`;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };

const S = {
  data: null,
  y: new Date().getFullYear(),
  m: new Date().getMonth() + 1,
  logAll: false,
  installPrompt: null,
};
const saved = (store.get('fulusi.month') || '').match(/^(\d{4})-(\d{2})$/);
if (saved) { S.y = +saved[1]; S.m = +saved[2]; }

// ---------------- boot ----------------
async function boot() {
  try {
    S.data = await db.loadAll();
  } catch (e) {
    $('#view').innerHTML = `<div class="msg bad">تعذّر فتح التخزين المحلي على هذا الجهاز: ${esc(e.message)}<br>إذا كنتِ في «التصفح الخاص» فافتحي التطبيق في نافذة عادية.</div>`;
    return;
  }
  fillMonthSelectors();
  window.addEventListener('hashchange', render);
  document.addEventListener('click', onClick);
  $('#sel-month').addEventListener('change', (e) => setMonth(S.y, +e.target.value));
  $('#sel-year').addEventListener('change', (e) => setMonth(+e.target.value, S.m));
  $('#btn-more').addEventListener('click', () => { location.hash = '#/more'; });
  $('#fab').addEventListener('click', () => openTxSheet());
  $('#sheet-wrap').addEventListener('click', (e) => { if (e.target.id === 'sheet-wrap') closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet-wrap').hidden) closeSheet(); });
  window.addEventListener('online', updateNetBanner);
  window.addEventListener('offline', updateNetBanner);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installPrompt = e; if (route()[0] === 'more') render(); });
  render();
  registerSW();
  document.documentElement.dataset.ready = '1';
}

function route() { return (location.hash.replace(/^#\/?/, '') || 'home').split('/'); }

function setMonth(y, m) {
  if (m < 1) { y--; m = 12; } else if (m > 12) { y++; m = 1; }
  S.y = y; S.m = m; store.set('fulusi.month', C.monthKey(y, m));
  fillMonthSelectors(); render();
}
function fillMonthSelectors() {
  const years = new Set([S.y]);
  const cy = new Date().getFullYear();
  for (let y = cy - 2; y <= cy + 5; y++) years.add(y);
  for (const t of S.data?.transactions || []) if (t.date) years.add(+t.date.slice(0, 4));
  $('#sel-month').innerHTML = C.MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === S.m ? 'selected' : ''}>${n}</option>`).join('');
  $('#sel-year').innerHTML = [...years].sort().map((y) => `<option value="${y}" ${y === S.y ? 'selected' : ''}>${y}</option>`).join('');
}

// ---------------- render ----------------
const VIEWS = { home: viewHome, log: viewLog, budget: viewBudget, goals: viewGoals, review: viewReview, more: viewMore };
function render() {
  const [r, sub] = route();
  const view = VIEWS[r] ? r : 'home';
  document.querySelectorAll('.tabs a').forEach((a) => { if (a.dataset.tab === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#month-bar').hidden = !['home', 'log', 'budget', 'review'].includes(view) || (view === 'log' && S.logAll);
  $('#fab').hidden = !['home', 'log'].includes(view);
  $('#view').innerHTML = VIEWS[view](sub);
  afterRender(view);
  updateNetBanner();
}
const txs = () => S.data.transactions;

function demoNotice() {
  return S.data.meta?.demo ? `<div class="msg info">هذه بيانات تجريبية للتعرّف على التطبيق. احذفيها من ⚙︎ ← «حذف كل البيانات» قبل أن تبدئي ببياناتك.</div>` : '';
}
function backupReminder() {
  const n = txs().length; const lb = S.data.meta?.lastBackup;
  if (S.data.meta?.demo || n < 10) return '';
  const days = lb ? (Date.now() - Date.parse(lb)) / 864e5 : Infinity;
  if (days < 30) return '';
  return `<div class="msg warn">بياناتك محفوظة على هذا الجهاز فقط. ${lb ? 'مرّ أكثر من شهر على آخر نسخة احتياطية.' : 'لم تأخذي نسخة احتياطية بعد.'} <a href="#/more/backup">خذي نسخة الآن</a></div>`;
}

function viewHome() {
  if (!txs().length && !S.data.goals.length) {
    return `<h1 class="view-title">أهلًا بكِ 🌿</h1>
      <div class="card"><p>هذا التطبيق يساعدكِ على معرفة أين يذهب راتبك، والتحكم في مصروفاتك، والبدء بالادخار ولو بمبلغ صغير.</p>
      <ol class="steps"><li>اضغطي <b>+</b> وسجّلي راتبك كعملية نوعها «دخل».</li><li>سجّلي مصروفاتك أولًا بأول.</li>
      <li>حدّدي ميزانية كل تصنيف من «الميزانية».</li><li>ضعي هدف ادخار من «الأهداف».</li><li>راجعي شهرك من «المراجعة».</li></ol></div>
      <div class="msg info">📱 على الآيفون: ثبّتي التطبيق على الشاشة الرئيسية <b>قبل</b> إدخال بياناتك. <a href="#/more/install">طريقة التثبيت</a></div>
      <div class="btn-row"><button class="btn primary" data-act="add">+ أضيفي أول عملية</button>
      <button class="btn ghost" data-act="demo">جرّبي التطبيق ببيانات وهمية</button></div>`;
  }
  const s = C.monthSummary(txs(), S.y, S.m);
  const msg = C.summaryMessage(s);
  const cats = C.expensesByCategory(txs(), S.y, S.m, S.data.settings.expenseCats);
  const total = C.totalSavedAllTime(txs(), S.data.goals);
  const max = Math.max(0, ...cats.rows.map((r) => r.amount));
  return `${demoNotice()}${backupReminder()}
    <h1 class="view-title">ملخص ${esc(C.monthLabel(S.y, S.m))}</h1>
    <div class="kpis">
      <div class="kpi hero ${s.remaining < 0 ? 'neg' : ''}"><div class="l">👛 المتبقي معكِ</div><div class="v" data-k="remaining">${money(s.remaining)}</div><div class="l">الدخل − المصروفات − الادخار</div></div>
      <div class="kpi"><div class="l">💰 إجمالي الدخل</div><div class="v" data-k="income">${money(s.income)}</div></div>
      <div class="kpi"><div class="l">🛒 إجمالي المصروفات</div><div class="v" data-k="expense">${money(s.expense)}</div></div>
      <div class="kpi"><div class="l">🌱 ادخرتِ هذا الشهر</div><div class="v" data-k="saving">${money(s.saving)}</div></div>
      <div class="kpi"><div class="l">📉 المصروفات من الدخل</div><div class="v" data-k="ratio">${pct(s.expenseRatio)}</div></div>
      <div class="kpi" style="grid-column:1/-1"><div class="l">🏦 إجمالي ما ادخرتِه (كل الأشهر + المدخر سابقًا في الأهداف)</div><div class="v" data-k="totalSaved">${money(total)}</div></div>
    </div>
    <div class="msg ${msg.level}" data-k="message">${esc(msg.text)}</div>
    <h2 class="sec">أين ذهبت مصروفاتي؟</h2>
    ${s.expense === 0 ? '<p class="empty">لا توجد مصروفات في هذا الشهر.</p>' : `<ul class="bars">${cats.rows.filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount).map((r) => `
      <li><span class="n">${esc(r.name)}</span><span class="a">${money(r.amount)} · ${pct(r.share)}</span>
      <span class="bar"><i style="width:${max ? (r.amount / max) * 100 : 0}%"></i></span></li>`).join('')}</ul>`}
    ${cats.uncategorized ? `<p class="hint neg">ملاحظة: ${money(cats.uncategorized)} من المصروفات بتصنيف غير موجود في القائمة.</p>` : ''}`;
}

function viewLog() {
  const st = C.logStats(txs());
  let list = txs().slice();
  if (!S.logAll) list = list.filter((t) => t.date?.startsWith(C.monthKey(S.y, S.m) + '-'));
  list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  let html = `<h1 class="view-title">سجل الدخل والمصروفات</h1>
    <div class="stats" data-k="logstats">عدد العمليات المسجلة: <b class="num">${st.count}</b> · رصيد كل الأشهر: <b>${money(st.balance)}</b></div>
    <div class="filter" role="group" aria-label="عرض"><button class="chip" data-act="log-month" aria-pressed="${!S.logAll}">${esc(C.monthLabel(S.y, S.m))}</button>
    <button class="chip" data-act="log-all" aria-pressed="${S.logAll}">كل الأشهر</button></div>`;
  if (!list.length) return html + `<p class="empty">لا توجد عمليات${S.logAll ? '' : ' في هذا الشهر'}. اضغطي <b>+</b> لإضافة عملية.</p>`;
  let day = null;
  for (const t of list) {
    if (t.date !== day) { day = t.date; html += `<div class="day num">${esc(fmtDay(day))}</div>`; }
    const cls = t.type === C.TYPES.INCOME ? 'in' : t.type === C.TYPES.SAVING ? 'sav' : 'out';
    const sign = t.type === C.TYPES.INCOME ? '+' : '−';
    html += `<button class="tx" data-act="edit-tx" data-id="${esc(t.id)}"><span class="dot ${cls}">${esc(t.type[0])}</span>
      <span class="mid"><span class="c">${esc(t.cat)}</span><span class="d">${esc(t.desc || t.type)}</span></span>
      <span class="amt ${cls}"><span class="num">${sign}${esc(C.fmtMoney(t.amount, true))}</span></span></button>`;
  }
  return html;
}
function fmtDay(iso) {
  if (!C.isValidDate(iso)) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${C.MONTHS[m - 1]} ${y}`;
}

function viewBudget() {
  const s = C.monthSummary(txs(), S.y, S.m);
  const t = C.budgetTable(txs(), S.y, S.m, S.data.settings.expenseCats, S.data.budgets, s.income);
  return `<h1 class="view-title">ميزانية ${esc(C.monthLabel(S.y, S.m))}</h1>
    <p class="hint">اكتبي المبلغ المسموح لكل تصنيف شهريًا (يبقى نفسه لكل الأشهر). المصروف الفعلي يأتي من السجل تلقائيًا.</p>
    ${t.rows.map((r, i) => `<div class="brow ${r.status}">
      <div class="h"><b>${esc(r.name)}</b><span class="status ${r.status}" data-k="bst${i}">${esc(C.STATUS_LABEL[r.status])}</span></div>
      <div class="g"><label>الميزانية ✏️<input class="in-money num" inputmode="decimal" data-budget="${i}" value="${r.budget ? r.budget : ''}" placeholder="0" aria-label="ميزانية ${esc(r.name)}"></label>
      <span>الفعلي<strong>${money(r.actual)}</strong></span><span>المتبقي<strong class="${r.remaining < 0 ? 'neg' : ''}">${money(r.remaining)}</strong></span></div>
      ${r.budget > 0 ? `<span class="bar ${r.status}" style="margin-top:8px;display:block"><i style="width:${Math.min(100, (r.ratio || 0) * 100)}%"></i></span><span class="hint">${pct(r.ratio)} من الميزانية</span>` : ''}
    </div>`).join('')}
    <div class="card"><b>الإجمالي</b><div class="brow" style="border:0;padding:0;margin:6px 0 0"><div class="g">
      <span>الميزانية<strong data-k="btot">${money(t.totalBudget)}</strong></span><span>الفعلي<strong>${money(t.totalActual)}</strong></span>
      <span>المتبقي<strong class="${t.totalRemaining < 0 ? 'neg' : ''}">${money(t.totalRemaining)}</strong></span></div></div>
      <p class="hint">نسبة الاستهلاك: ${pct(t.totalRatio)} · 🟢 أقل من 80% · 🟡 من 80% إلى 100% · 🔴 تجاوزتِ</p></div>
    <h2 class="sec">هل ميزانيتك مناسبة لدخلك؟</h2>
    <div class="card"><div class="brow" style="border:0;padding:0;margin:0"><div class="g">
      <span>دخل هذا الشهر<strong>${money(t.fit.income)}</strong></span><span>مجموع الميزانيات<strong>${money(t.fit.budgets)}</strong></span>
      <span>الباقي للادخار والطوارئ<strong class="${t.fit.leftForSaving < 0 ? 'neg' : ''}" data-k="fit">${money(t.fit.leftForSaving)}</strong></span></div></div></div>`;
}

function viewGoals() {
  const today = todayISO();
  const g = C.goalsSummary(S.data.goals, txs(), today);
  let html = `<h1 class="view-title">أهداف الادخار 🌱</h1>
    <div class="kpis"><div class="kpi"><div class="l">المدخر في كل الأهداف</div><div class="v" data-k="goalsTotal">${money(g.totalSaved)}</div></div>
    <div class="kpi"><div class="l">نسبة الإنجاز الكلية</div><div class="v">${pct(g.overall)}</div></div></div>
    <p class="hint">💡 عند الادخار: أضيفي عملية نوعها «ادخار» واختاري اسم الهدف من التصنيف، فيُضاف المبلغ للهدف تلقائيًا.</p>`;
  if (!g.list.length) html += '<p class="empty">لا توجد أهداف بعد.</p>';
  g.list.forEach((x, i) => {
    const monthly = x.monthly === null ? '—' : x.monthly === 'expired' ? 'انتهى الموعد' : C.fmtMoney(x.monthly);
    html += `<div class="card goal" data-goal="${i}"><div class="top-row"><h3>${esc(x.goal.name)}</h3>
      <button class="chip" data-act="edit-goal" data-i="${i}">تعديل</button></div>
      <div class="pbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(x.ratio * 100)}"><i style="width:${x.ratio * 100}%"></i></div>
      <div class="hint" data-bar="${esc(x.bar)}">نسبة الإنجاز: ${pct(x.ratio)} ${x.ratio >= 1 ? '🎉 تحقق الهدف' : ''}</div>
      <dl><dt>المستهدف</dt><dd>${money(x.target)}</dd><dt>المدخر حتى الآن</dt><dd data-k="gsaved${i}">${money(x.saved)}</dd>
      <dt>المتبقي للهدف</dt><dd>${money(x.remaining)}</dd><dt>تحتاجين شهريًا تقريبًا</dt><dd class="num">${esc(monthly)}</dd>
      ${x.goal.date ? `<dt>التاريخ المستهدف</dt><dd class="num">${esc(fmtDay(x.goal.date))}</dd>` : ''}</dl></div>`;
  });
  if (S.data.goals.length < C.MAX_GOALS) html += `<button class="btn ghost" data-act="add-goal">+ هدف جديد</button>`;
  else html += `<p class="hint">وصلتِ للحد الأقصى (${C.MAX_GOALS} أهداف) كما في الملف الأصلي.</p>`;
  return html;
}

const QUESTIONS = ['ما المصروف الذي كان يستحق فعلًا، وما المصروف الذي ندمتِ عليه هذا الشهر؟',
  'أي تصنيف صرفتِ فيه أكثر مما توقعتِ؟ ولماذا برأيك؟',
  'هل ادخرتِ أول الشهر أم مما تبقّى في آخره؟ وكم تستطيعين ادخاره الشهر القادم؟',
  '⭐ تحسين واحد فقط سأطبّقه الشهر القادم:'];
function viewReview() {
  const s = C.monthSummary(txs(), S.y, S.m);
  const top = C.topCategories(txs(), S.y, S.m, S.data.settings.expenseCats);
  const bva = C.budgetVsActual(txs(), S.y, S.m, S.data.settings.expenseCats, S.data.budgets);
  const ans = S.data.reviews[C.monthKey(S.y, S.m)] || [];
  const medals = ['🥇', '🥈', '🥉'];
  return `<h1 class="view-title">مراجعة ${esc(C.monthLabel(S.y, S.m))} 🔍</h1>
    <div class="kpis"><div class="kpi"><div class="l">الدخل</div><div class="v">${money(s.income)}</div></div>
    <div class="kpi"><div class="l">المصروفات</div><div class="v">${money(s.expense)}</div></div>
    <div class="kpi"><div class="l">الادخار</div><div class="v">${money(s.saving)}</div></div>
    <div class="kpi ${s.remaining < 0 ? 'neg' : ''}"><div class="l">المتبقي</div><div class="v">${money(s.remaining)}</div></div></div>
    <h2 class="sec">أعلى 3 تصنيفات إنفاقًا</h2>
    <ul class="bars" data-k="top3">${top.map((t, k) => `<li><span class="n">${medals[k]} ${esc(t.name || '—')}</span><span class="a">${money(t.amount)} · ${pct(t.share)}</span></li>`).join('')}</ul>
    <h2 class="sec">الميزانية مقابل الفعلي</h2>
    <div class="card"><div class="brow" style="border:0;padding:0;margin:0"><div class="g">
      <span>مجموع الميزانية<strong>${money(bva.totalBudget)}</strong></span><span>المصروف الفعلي<strong>${money(bva.actual)}</strong></span>
      <span>الفرق<strong class="${bva.diff < 0 ? 'neg' : ''}">${money(bva.diff)}</strong></span></div></div>
      <p class="hint">تصنيفات تجاوزت ميزانيتها: <b class="num ${bva.overCount ? 'neg' : ''}" data-k="over">${bva.overCount}</b> · (+ وفّرتِ / − تجاوزتِ)</p></div>
    <div class="msg ${bva.totalBudget === 0 ? 'info' : bva.overCount ? 'bad' : 'good'}">${esc(bva.message)}</div>
    <h2 class="sec">أسئلة المراجعة ✏️</h2>
    ${QUESTIONS.map((q, i) => `<div class="field"><label for="q${i}">${esc(q)}</label><textarea id="q${i}" data-q="${i}">${esc(ans[i] || '')}</textarea></div>`).join('')}
    <p class="hint" id="q-status" aria-live="polite">إجاباتك تُحفظ تلقائيًا لهذا الشهر.</p>`;
}

function viewMore(sub) {
  if (sub === 'categories') return viewCategories();
  if (sub === 'backup') return viewBackup();
  if (sub === 'install') return viewInstall();
  if (sub === 'privacy') return viewPrivacy();
  return `<h1 class="view-title">المزيد</h1><ul class="menu">
    <li><a href="#/more/install">📲 تثبيت التطبيق على الجوال <span>←</span></a></li>
    <li><a href="#/more/backup">🗂️ النسخ الاحتياطي والاستعادة <span>←</span></a></li>
    <li><a href="#/more/categories">⚙️ أسماء التصنيفات <span>←</span></a></li>
    <li><a href="#/more/privacy">🔒 الخصوصية وحفظ البيانات <span>←</span></a></li>
    <li><button data-act="wipe">🗑️ حذف كل البيانات <span>←</span></button></li></ul>
    <p class="hint">فلوسي بوضوح · الإصدار <span class="num">${esc(APP_VERSION)}</span> · © LionTrining</p>`;
}

function viewCategories() {
  const block = (kind, title) => `<h2 class="sec">${title}</h2>${S.data.settings[kind].map((c, i) =>
    `<div class="field"><input data-cat-kind="${kind}" data-i="${i}" value="${esc(c)}" aria-label="${title} ${i + 1}" maxlength="40"></div>`).join('')}`;
  return `<h1 class="view-title">أسماء التصنيفات</h1>
    <p class="hint">عدّلي الاسم ثم اخرجي من الخانة. العمليات المسجلة بالاسم القديم تنتقل للاسم الجديد تلقائيًا.</p>
    ${block('expenseCats', 'تصنيفات المصروفات')}${block('incomeCats', 'تصنيفات الدخل')}
    <a href="#/more" class="btn ghost" style="display:grid;place-items:center;text-decoration:none">رجوع</a>`;
}

function viewBackup() {
  const lb = S.data.meta?.lastBackup;
  return `<h1 class="view-title">النسخ الاحتياطي</h1>
    <div class="msg warn">بياناتك محفوظة على هذا الجهاز وداخل هذا التطبيق فقط، ولا تُرسل لأي خادم. إذا حذفتِ التطبيق أو مسحتِ بيانات المتصفح تضيع البيانات، لذلك خذي نسخة احتياطية بانتظام واحفظيها في «الملفات» أو أرسليها لنفسك.</div>
    <div class="card"><b>آخر نسخة احتياطية:</b> <span class="num" data-k="lastBackup">${lb ? esc(new Date(lb).toLocaleString('ar-SA-u-nu-latn')) : 'لم تُؤخذ بعد'}</span>
    <p class="hint">عدد العمليات: <span class="num">${txs().length}</span> · الأهداف: <span class="num">${S.data.goals.length}</span></p>
    <button class="btn primary" data-act="export">⬇️ تصدير نسخة احتياطية (ملف JSON)</button></div>
    <div class="card"><b>استعادة نسخة احتياطية</b><p class="hint">ستُستبدل بياناتك الحالية بمحتوى الملف بعد تأكيدك. الملف يُقرأ على جهازك فقط.</p>
    <label class="btn ghost" style="display:grid;place-items:center">📂 اختيار ملف النسخة<input type="file" id="import-file" accept="application/json,.json" hidden></label>
    <div id="import-preview"></div></div>`;
}

function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isStandalone() { return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true; }
function viewInstall() {
  const ios = isIOS();
  return `<h1 class="view-title">تثبيت التطبيق على الجوال</h1>
    ${isStandalone() ? '<div class="msg good">✅ التطبيق مثبّت ويعمل من الشاشة الرئيسية.</div>' : ''}
    <div class="msg info">«فلوسي بوضوح» تطبيق ويب (PWA) يُضاف إلى الشاشة الرئيسية ويعمل بدون إنترنت. ليس تطبيقًا من App Store أو Google Play.</div>
    <div class="card" ${ios ? '' : 'style="opacity:.85"'}><b>📱 على الآيفون</b><ol class="steps">
      <li>افتحي رابط التطبيق في <b>Safari</b>.</li>
      <li>اضغطي زر <b>المشاركة</b> <span class="kbd">⎋↑</span> أسفل الشاشة (أو أعلاها في الآيباد).</li>
      <li>اختاري <b>«إضافة إلى الشاشة الرئيسية»</b> (قد تحتاجين التمرير للأسفل)، ثم <b>«إضافة»</b>.</li>
      <li>افتحي التطبيق من أيقونته على الشاشة الرئيسية، واستخدميه دائمًا من هناك.</li></ol>
      <p class="hint">⚠️ مهم: بيانات التطبيق المثبّت منفصلة عن بيانات Safari. ثبّتي التطبيق أولًا ثم ابدئي بإدخال بياناتك. وإذا أدخلتِ بيانات في Safari، صدّريها نسخة احتياطية ثم استعيديها داخل التطبيق المثبّت.</p></div>
    <div class="card"><b>🤖 على أندرويد</b><ol class="steps"><li>افتحي الرابط في <b>Chrome</b>.</li>
      <li>اضغطي القائمة ⋮ ثم <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>.</li></ol>
      ${S.installPrompt ? '<button class="btn primary" data-act="install">تثبيت الآن</button>' : ''}</div>
    <div class="card"><b>✈️ تجربة العمل بدون إنترنت</b><p class="hint">بعد فتح التطبيق مرة واحدة مع الإنترنت، فعّلي «وضع الطيران» ثم افتحيه من الشاشة الرئيسية: يجب أن يعمل وتظهر بياناتك.</p></div>`;
}
function viewPrivacy() {
  return `<h1 class="view-title">الخصوصية وحفظ البيانات</h1><div class="card"><ul class="steps">
    <li>كل بياناتك المالية تُحفظ على جهازك فقط (IndexedDB داخل المتصفح/التطبيق). لا يوجد خادم ولا حساب ولا مزامنة سحابية.</li>
    <li>لا يحتوي التطبيق على أدوات تتبع أو إحصاءات أو إعلانات أو خدمات ذكاء اصطناعي، ولا يتصل بأي جهة خارجية.</li>
    <li>البيانات <b>غير مشفّرة</b> داخل الجهاز؛ حمايتها تعتمد على قفل جوالك (رمز المرور / Face ID).</li>
    <li>حذف التطبيق من الشاشة الرئيسية، أو «مسح سجل وبيانات المواقع» في Safari، أو مسح بيانات المتصفح في أندرويد، يحذف بياناتك نهائيًا.</li>
    <li>لكل جهاز ولكل متصفح بياناته الخاصة؛ لا تنتقل البيانات بين الأجهزة إلا عبر النسخة الاحتياطية.</li>
    <li>ملف النسخة الاحتياطية غير مشفّر؛ احفظيه في مكان آمن.</li></ul>
    <p class="hint" data-k="persist">التخزين الدائم: جارٍ الفحص…</p></div>`;
}

// ---------------- after render hooks ----------------
function afterRender(view) {
  if (view === 'budget') document.querySelectorAll('[data-budget]').forEach((el) => el.addEventListener('change', onBudgetChange));
  if (view === 'review') document.querySelectorAll('[data-q]').forEach((el) => el.addEventListener('input', onAnswerInput));
  if (view === 'more') {
    document.querySelectorAll('[data-cat-kind]').forEach((el) => el.addEventListener('change', onCatRename));
    $('#import-file')?.addEventListener('change', onImportFile);
    const p = $('[data-k="persist"]');
    if (p) navigator.storage?.persisted?.().then((ok) => { p.textContent = ok ? 'التخزين الدائم: مفعّل ✓ (المتصفح لن يحذف البيانات تلقائيًا عند امتلاء الذاكرة).' : 'التخزين الدائم: غير مؤكد من المتصفح، لذلك احرصي على النسخ الاحتياطي.'; })
      .catch(() => { p.textContent = 'التخزين الدائم: غير مدعوم في هذا المتصفح، لذلك احرصي على النسخ الاحتياطي.'; });
    else if (p) p.textContent = 'التخزين الدائم: غير مدعوم في هذا المتصفح، لذلك احرصي على النسخ الاحتياطي.';
  }
}

async function onBudgetChange(e) {
  const i = +e.target.dataset.budget;
  const v = e.target.value.trim() === '' ? 0 : C.parseAmount(e.target.value);
  if (Number.isNaN(v) || v < 0) { toast('اكتبي الميزانية رقمًا موجبًا.', true); e.target.value = S.data.budgets[i] || ''; return; }
  const budgets = S.data.budgets.slice(); budgets[i] = v;
  try { await db.setKV('budgets', budgets); S.data.budgets = budgets; toast('تم حفظ الميزانية ✓'); render(); }
  catch (err) { toast('لم تُحفظ الميزانية: ' + err.message, true); e.target.value = S.data.budgets[i] || ''; }
}

let ansTimer = null;
function onAnswerInput() {
  clearTimeout(ansTimer);
  $('#q-status').textContent = 'جارٍ الحفظ…';
  ansTimer = setTimeout(async () => {
    const key = C.monthKey(S.y, S.m);
    const vals = [...document.querySelectorAll('[data-q]')].map((t) => t.value);
    const reviews = { ...S.data.reviews, [key]: vals };
    try { await db.setKV('reviews', reviews); S.data.reviews = reviews; $('#q-status').textContent = 'محفوظ ✓'; }
    catch (err) { $('#q-status').textContent = 'لم تُحفظ الإجابات: ' + err.message; }
  }, 500);
}

async function onCatRename(e) {
  const kind = e.target.dataset.catKind, i = +e.target.dataset.i;
  const name = e.target.value.trim();
  const list = S.data.settings[kind];
  if (!name) { toast('الاسم لا يمكن أن يكون فارغًا.', true); e.target.value = list[i]; return; }
  if (list.some((c, j) => j !== i && c === name)) { toast('هذا الاسم مستخدم في تصنيف آخر.', true); e.target.value = list[i]; return; }
  if (name === list[i]) return;
  try {
    const moved = await db.renameCategory({ kind, index: i, newName: name, state: S.data });
    S.data = await db.loadAll();
    toast(`تم تغيير الاسم ✓${moved ? ` ونُقلت ${moved} عملية` : ''}`);
  } catch (err) { toast('لم يُحفظ الاسم: ' + err.message, true); e.target.value = list[i]; }
}

// ---------------- clicks ----------------
async function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'month-prev') setMonth(S.y, S.m - 1);
  else if (act === 'month-next') setMonth(S.y, S.m + 1);
  else if (act === 'close-sheet') closeSheet();
  else if (act === 'add') openTxSheet();
  else if (act === 'edit-tx') openTxSheet(txs().find((t) => t.id === el.dataset.id));
  else if (act === 'log-all') { S.logAll = true; render(); }
  else if (act === 'log-month') { S.logAll = false; render(); }
  else if (act === 'add-goal') openGoalSheet(-1);
  else if (act === 'edit-goal') openGoalSheet(+el.dataset.i);
  else if (act === 'export') exportBackup();
  else if (act === 'do-import') doImport();
  else if (act === 'demo') loadDemo();
  else if (act === 'wipe') wipe();
  else if (act === 'install' && S.installPrompt) { S.installPrompt.prompt(); S.installPrompt = null; }
  else if (act === 'reload-update') applyUpdate();
}

// ---------------- sheets ----------------
let lastFocus = null;
function openSheet(title, html) {
  lastFocus = document.activeElement;
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = html;
  $('#sheet-wrap').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  $('#sheet-wrap').hidden = true; $('#sheet-body').innerHTML = ''; document.body.style.overflow = '';
  lastFocus?.focus?.();
}

function openTxSheet(tx) {
  const editing = !!tx;
  const t = tx || { type: C.TYPES.EXPENSE, date: defaultDate(), cat: '', desc: '', amount: '' };
  openSheet(editing ? 'تعديل العملية' : 'عملية جديدة', `
    <form id="tx-form" novalidate>
      <div class="form-errors" id="tx-errors" role="alert"></div>
      <div class="field"><span class="lbl">النوع</span><div class="seg" role="group" aria-label="النوع">
        ${[C.TYPES.INCOME, C.TYPES.EXPENSE, C.TYPES.SAVING].map((ty) => `<button type="button" data-type="${ty}" aria-pressed="${t.type === ty}">${ty}</button>`).join('')}</div></div>
      <div class="field"><label for="f-amount">المبلغ (ر.س)</label><input id="f-amount" class="num" inputmode="decimal" autocomplete="off" placeholder="مثال: 150" value="${t.amount === '' ? '' : esc(t.amount)}"></div>
      <div class="field"><label for="f-cat">التصنيف</label><select id="f-cat"></select></div>
      <div class="field"><label for="f-date">التاريخ</label><input id="f-date" type="date" value="${esc(t.date)}" required></div>
      <div class="field"><label for="f-desc">وصف مختصر (اختياري)</label><input id="f-desc" maxlength="200" value="${esc(t.desc || '')}" placeholder="مثال: مقاضي الأسبوع"></div>
      <div class="btn-row"><button class="btn primary" type="submit" id="tx-save">حفظ</button>
      ${editing ? '<button class="btn danger" type="button" id="tx-del">حذف العملية</button>' : ''}</div>
    </form>`);
  let type = t.type;
  const fillCats = (keep) => {
    const cats = C.categoriesFor(type, S.data.settings, S.data.goals);
    const opts = cats.slice();
    if (keep && !opts.includes(keep)) opts.push(keep); // تصنيف قديم لم يعد في القائمة
    $('#f-cat').innerHTML = `<option value="">— اختاري —</option>` + opts.map((c) => `<option ${c === keep ? 'selected' : ''}>${esc(c)}</option>`).join('');
  };
  fillCats(t.cat);
  $('#sheet-body').querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
    type = b.dataset.type;
    $('#sheet-body').querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    fillCats('');
  }));
  $('#tx-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const rec = { ...(tx || {}), type, amount: C.parseAmount($('#f-amount').value), cat: $('#f-cat').value, date: $('#f-date').value, desc: $('#f-desc').value.trim() };
    const errs = db.validateTx(rec, S.data.settings, S.data.goals);
    if (errs.length) { $('#tx-errors').innerHTML = errs.map(esc).join('<br>'); return; }
    const btn = $('#tx-save'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      const savedRec = await db.saveTx(rec);            // يُحل فقط بعد اكتمال الكتابة في IndexedDB
      const i = S.data.transactions.findIndex((x) => x.id === savedRec.id);
      if (i >= 0) S.data.transactions[i] = savedRec; else S.data.transactions.push(savedRec);
      db.requestPersistence();
      closeSheet();
      const other = !savedRec.date.startsWith(C.monthKey(S.y, S.m) + '-');
      toast(editing ? 'تم حفظ التعديل ✓' : `تم حفظ العملية ✓${other ? ` (في ${fmtDay(savedRec.date)})` : ''}`);
      fillMonthSelectors(); render();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'حفظ';
      $('#tx-errors').textContent = 'لم تُحفظ العملية: ' + (err?.message || 'خطأ غير معروف') + '. حاولي مرة أخرى.';
    }
  });
  $('#tx-del')?.addEventListener('click', async () => {
    if (!confirm('هل تريدين حذف هذه العملية نهائيًا؟')) return;
    try {
      await db.deleteTx(tx.id);
      S.data.transactions = S.data.transactions.filter((x) => x.id !== tx.id);
      closeSheet(); toast('تم حذف العملية'); render();
    } catch (err) { $('#tx-errors').textContent = 'لم تُحذف العملية: ' + err.message; }
  });
  setTimeout(() => (editing ? null : $('#f-amount')?.focus()), 50);
}
function defaultDate() {
  const now = new Date();
  if (S.y === now.getFullYear() && S.m === now.getMonth() + 1) return todayISO();
  return `${C.monthKey(S.y, S.m)}-01`;
}

function openGoalSheet(i) {
  const g = i >= 0 ? S.data.goals[i] : { name: '', target: '', prev: '', date: '' };
  openSheet(i >= 0 ? 'تعديل الهدف' : 'هدف جديد', `<form id="goal-form" novalidate>
    <div class="form-errors" id="g-errors" role="alert"></div>
    <div class="field"><label for="g-name">اسم الهدف</label><input id="g-name" maxlength="40" value="${esc(g.name)}" placeholder="مثال: صندوق الطوارئ"></div>
    <div class="field"><label for="g-target">المبلغ المستهدف (ر.س)</label><input id="g-target" class="num" inputmode="decimal" value="${g.target === '' ? '' : esc(g.target)}"></div>
    <div class="field"><label for="g-prev">مدخر سابقًا قبل استخدام التطبيق (اختياري)</label><input id="g-prev" class="num" inputmode="decimal" value="${g.prev ? esc(g.prev) : ''}"></div>
    <div class="field"><label for="g-date">التاريخ المستهدف (اختياري)</label><input id="g-date" type="date" value="${esc(g.date || '')}"></div>
    <div class="btn-row"><button class="btn primary" type="submit">حفظ الهدف</button>${i >= 0 ? '<button class="btn danger" type="button" id="g-del">حذف الهدف</button>' : ''}</div></form>`);
  $('#goal-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = $('#g-name').value.trim();
    const target = C.parseAmount($('#g-target').value);
    const prevRaw = $('#g-prev').value.trim();
    const prev = prevRaw === '' ? 0 : C.parseAmount(prevRaw);
    const date = $('#g-date').value;
    const errs = [];
    if (!name) errs.push('اكتبي اسم الهدف.');
    if (name === C.GENERAL_SAVING || S.data.goals.some((x, j) => j !== i && x.name === name)) errs.push('هذا الاسم مستخدم.');
    if (Number.isNaN(target) || target <= 0) errs.push('اكتبي المبلغ المستهدف رقمًا أكبر من صفر.');
    if (Number.isNaN(prev) || prev < 0) errs.push('«مدخر سابقًا» يجب أن يكون رقمًا موجبًا.');
    if (date && !C.isValidDate(date)) errs.push('التاريخ غير صحيح.');
    if (errs.length) { $('#g-errors').innerHTML = errs.map(esc).join('<br>'); return; }
    try {
      if (i >= 0 && g.name !== name) await db.renameCategory({ kind: 'goal', index: i, newName: name, state: S.data });
      const goals = S.data.goals.slice();
      const rec = { id: g.id || db.uid(), name, target, prev, date: date || null };
      if (i >= 0) goals[i] = rec; else goals.push(rec);
      await db.setKV('goals', goals);
      S.data = await db.loadAll();
      closeSheet(); toast('تم حفظ الهدف ✓'); render();
    } catch (err) { $('#g-errors').textContent = 'لم يُحفظ الهدف: ' + err.message; }
  });
  $('#g-del')?.addEventListener('click', async () => {
    if (!confirm('حذف الهدف؟ عمليات الادخار المسجلة باسمه ستبقى في السجل.')) return;
    try {
      const goals = S.data.goals.filter((_, j) => j !== i);
      await db.setKV('goals', goals); S.data.goals = goals; closeSheet(); toast('تم حذف الهدف'); render();
    } catch (err) { $('#g-errors').textContent = 'لم يُحذف الهدف: ' + err.message; }
  });
}

// ---------------- backup ----------------
async function exportBackup() {
  const json = JSON.stringify(db.buildBackup(S.data), null, 1);
  const name = `fulusi-backup-${todayISO()}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  let done = false;
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] }) && /Mobi|iPhone|iPad|Android/.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: 'نسخة احتياطية - فلوسي بوضوح' });
      done = true;
    }
  } catch (err) { if (err?.name === 'AbortError') return; }
  if (!done) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  try { const meta = { ...S.data.meta, lastBackup: new Date().toISOString() }; await db.setKV('meta', meta); S.data.meta = meta; } catch (_) {}
  toast('تم تجهيز النسخة الاحتياطية ✓ احفظيها في «الملفات»'); render();
}

let pendingImport = null;
async function onImportFile(e) {
  const f = e.target.files?.[0]; const box = $('#import-preview'); pendingImport = null;
  if (!f) return;
  if (f.size > 20 * 1024 * 1024) { box.innerHTML = '<div class="form-errors">الملف كبير جدًا.</div>'; return; }
  let obj;
  try { obj = JSON.parse(await f.text()); } catch (_) { box.innerHTML = '<div class="form-errors">تعذّرت قراءة الملف. تأكدي أنه ملف نسخة احتياطية (JSON).</div>'; return; }
  const r = db.checkBackup(obj);
  if (!r.ok) { box.innerHTML = `<div class="form-errors">${r.errors.map(esc).join('<br>')}</div>`; return; }
  pendingImport = r.data;
  box.innerHTML = `<div class="msg warn">الملف صالح: <span class="num">${r.counts.transactions}</span> عملية و<span class="num">${r.counts.goals}</span> هدف${obj.exportedAt ? ` (بتاريخ <span class="num">${esc(obj.exportedAt.slice(0, 10))}</span>)` : ''}.<br>الاستعادة ستستبدل كل بياناتك الحالية (<span class="num">${txs().length}</span> عملية).</div>
    <button class="btn primary" data-act="do-import">استعادة واستبدال البيانات</button>`;
}
async function doImport() {
  if (!pendingImport) return;
  if (!confirm('سيتم استبدال كل بياناتك الحالية بمحتوى النسخة الاحتياطية. متابعة؟')) return;
  try {
    await db.restoreBackup(pendingImport);   // معاملة واحدة: إما تُستعاد كلها أو لا يتغير شيء
    S.data = await db.loadAll(); pendingImport = null;
    fillMonthSelectors(); toast('تمت استعادة النسخة الاحتياطية ✓'); location.hash = '#/';
    render();
  } catch (err) { toast('فشلت الاستعادة ولم تتغير بياناتك: ' + err.message, true); }
}

async function wipe() {
  if (!confirm('سيتم حذف كل العمليات والأهداف والميزانيات من هذا الجهاز نهائيًا. هل أخذتِ نسخة احتياطية؟')) return;
  if (!confirm('تأكيد أخير: حذف كل البيانات؟')) return;
  try { await db.wipeAll(); S.data = await db.loadAll(); toast('تم حذف كل البيانات'); location.hash = '#/'; render(); }
  catch (err) { toast('لم تُحذف البيانات: ' + err.message, true); }
}

async function loadDemo() {
  if (txs().length) return;
  const { demoState } = await import('./demo.js');
  const d = demoState(new Date());
  try { await db.restoreBackup(d); await db.setKV('meta', { demo: true, lastBackup: null }); S.data = await db.loadAll(); fillMonthSelectors(); toast('تم تحميل بيانات تجريبية'); render(); }
  catch (err) { toast('تعذّر تحميل البيانات التجريبية: ' + err.message, true); }
}

// ---------------- toast / banners ----------------
let toastTimer = null;
function toast(msg, err = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2600);
}
let updateReady = null;
function updateNetBanner() {
  const b = $('#banner');
  if (updateReady) { b.className = 'banner'; b.innerHTML = `<span>يتوفر تحديث جديد للتطبيق. بياناتك لن تتأثر.</span><button data-act="reload-update">تحديث</button>`; b.hidden = false; return; }
  if (!navigator.onLine) { b.className = 'banner offline'; b.innerHTML = '<span>📴 لا يوجد اتصال بالإنترنت. التطبيق يعمل عاديًا، وبياناتك تُحفظ على جهازك.</span>'; b.hidden = false; return; }
  b.hidden = true;
}

// ---------------- service worker ----------------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const watch = (w) => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { updateReady = w; updateNetBanner(); } });
    if (reg.waiting && navigator.serviceWorker.controller) { updateReady = reg.waiting; updateNetBanner(); }
    reg.addEventListener('updatefound', () => watch(reg.installing));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !updateReady) return; reloading = true; location.reload(); });
}
function applyUpdate() { updateReady?.postMessage({ type: 'SKIP_WAITING' }); }

// exposed for automated tests only (no data leaves the device)
window.__fulusi = { state: S, reload: async () => { S.data = await db.loadAll(); render(); } };
boot();
