// بيانات وهمية للتجربة فقط (تُنشأ على الجهاز عند طلب المستخدم، ولا تحتوي بيانات حقيقية).
import { DEFAULT_EXPENSE_CATS, DEFAULT_INCOME_CATS } from './calc.js';

const pad = (n) => String(n).padStart(2, '0');
export function demoState(now) {
  const tx = [];
  let n = 0;
  const add = (y, m, d, type, cat, desc, amount) => {
    const last = new Date(y, m, 0).getDate();
    tx.push({ id: `demo-${++n}`, date: `${y}-${pad(m)}-${pad(Math.min(d, last))}`, type, cat, desc, amount,
      createdAt: new Date(y, m - 1, d).toISOString(), updatedAt: new Date(y, m - 1, d).toISOString() });
  };
  const pick = (arr, k) => arr[k % arr.length];
  for (let back = 2; back >= 0; back--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const y = dt.getFullYear(), m = dt.getMonth() + 1;
    add(y, m, 1, 'دخل', 'الراتب', 'راتب الشهر', 9000);
    add(y, m, 1, 'ادخار', 'صندوق الطوارئ', 'ادخار أول الشهر', 800);
    add(y, m, 2, 'مصروف', 'السكن', 'إيجار الشقة', 2500);
    add(y, m, 3, 'مصروف', 'الالتزامات والأقساط', 'قسط السيارة', 900);
    add(y, m, 5, 'مصروف', 'الفواتير', 'كهرباء وإنترنت', pick([380, 420, 455], back));
    for (let wk = 0; wk < 4; wk++) {
      add(y, m, 4 + wk * 7, 'مصروف', 'الطعام والمقاضي', 'مقاضي الأسبوع', pick([310, 365, 420, 455], wk + back));
      add(y, m, 6 + wk * 7, 'مصروف', 'المواصلات', 'بنزين', pick([120, 140, 150], wk));
      add(y, m, 7 + wk * 6, 'مصروف', 'الترفيه', pick(['مطعم مع العائلة', 'سينما', 'قهوة'], wk), pick([65, 120, 180, 240], wk + back));
    }
    add(y, m, 9, 'مصروف', 'العناية الشخصية', 'صالون', pick([180, 250], back));
    add(y, m, 12, 'مصروف', 'التسوق', 'ملابس', pick([350, 520, 780], back));
    add(y, m, 15, 'مصروف', 'الصحة', 'صيدلية', pick([60, 95, 140], back));
    if (back !== 1) { add(y, m, 18, 'دخل', 'عمل حر', 'تصميم شعار لعميلة', back ? 600 : 1200); add(y, m, 19, 'ادخار', 'رحلة الصيف', 'من دخل العمل الحر', 500); }
    if (back === 0) add(y, m, 20, 'مصروف', 'الهدايا', 'هدية عيد ميلاد', 280);
  }
  const target = new Date(now.getFullYear() + 1, 5, 30);
  return {
    settings: { expenseCats: [...DEFAULT_EXPENSE_CATS], incomeCats: [...DEFAULT_INCOME_CATS] },
    budgets: [2500, 1700, 650, 500, 200, 900, 250, 700, 900, 300, 200],
    goals: [
      { id: 'demo-g1', name: 'صندوق الطوارئ', target: 15000, prev: 4000, date: `${target.getFullYear()}-06-30` },
      { id: 'demo-g2', name: 'رحلة الصيف', target: 6000, prev: 0, date: `${target.getFullYear()}-05-31` },
    ],
    reviews: {},
    transactions: tx,
  };
}
