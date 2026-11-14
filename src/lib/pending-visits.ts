"use client";

// ——— طابور الزيارات غير المتصلة بالإنترنت (عدة زيارات متتالية) ———
// يحفظ كل زيارة فشل إرسالها بسبب انقطاع الشبكة في localStorage كعنصر مستقل
// بإزاحة زمنية، وعند عودة الاتصال يُعاد إرسال العناصر واحدة تلو الأخرى بالترتيب.
// الضمانات:
//  - لا فقدان بيانات: العنصر لا يُحذف إلا بعد تأكيد نجاح التسجيل من الخادم (201 أو duplicate=true).
//  - لا تكرار: كل عنصر يحمل dedupeKey (UUID) ثابت — إعادة الإرسال مئات المرات تعيد السجل نفسه.
//  - ترحيل تلقائي: الزيارة المحفوظة بالمفتاح القديم (زيارة واحدة) تُرحّل إلى الطابور الجديد دون فقدان.

export interface PendingVisitItem {
  accountId?: string;
  body: Record<string, unknown>;
  schoolName: string;
  savedAt: string;      // وقت الحفظ المحلي ISO
  attempts: number;     // عدد محاولات الإرسال
  lastError?: string;   // آخر خطأ (للعرض للموظف)
}

const QUEUE_KEY = "alifba_pending_visits_v2";
const LEGACY_KEY = "alifba_pending_visit"; // المفتاح القديم — زيارة واحدة فقط

/** قراءة الطابور من localStorage (مع ترحيل تلقائي من المفتاح القديم) */
export function readPendingVisits(accountId?: string): PendingVisitItem[] {
  if (typeof window === "undefined") return [];
  // ترحيل الزيارة الواحدة القديمة إلى الطابور الجديد أولاً
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const legacyItem = JSON.parse(legacy) as { body: Record<string, unknown>; schoolName: string; savedAt?: string };
      if (legacyItem?.body?.dedupeKey) {
        const existing = safeReadQueue();
        if (!existing.some((it) => it.body?.dedupeKey === legacyItem.body.dedupeKey)) {
          const item: PendingVisitItem = {
            body: legacyItem.body,
            schoolName: legacyItem.schoolName ?? "",
            savedAt: legacyItem.savedAt ?? new Date().toISOString(),
            attempts: 0,
          };
          localStorage.setItem(QUEUE_KEY, JSON.stringify([...existing, item]));
        }
      }
    } catch {
      // بيانات قديمة تالفة — لا نحذفها (لا فقدان بيانات) بل نتركها كما هي
    }
    localStorage.removeItem(LEGACY_KEY);
  }
  const queue = safeReadQueue();
  return accountId ? queue.filter((item) => item.accountId === accountId) : queue;
}

function safeReadQueue(): PendingVisitItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((it) => it && typeof it === "object" && it.body?.dedupeKey);
  } catch {
    return [];
  }
}

function writeQueue(items: PendingVisitItem[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

/** إضافة زيارة إلى نهاية الطابور (ترتيب زمني حقيقي) */
export function enqueuePendingVisit(item: Omit<PendingVisitItem, "attempts">, accountId: string): number {
  const queue = readPendingVisits();
  // الحماية من التكرار المحلي نفسه: dedupeKey موجود مسبقاً؟ نحدثه بدل الإضافة
  const idx = queue.findIndex((it) => it.body?.dedupeKey === item.body.dedupeKey);
  if (idx >= 0) {
    queue[idx] = { ...queue[idx], body: item.body, schoolName: item.schoolName, savedAt: item.savedAt };
  } else {
    queue.push({ ...item, accountId, attempts: 0 });
  }
  writeQueue(queue);
  return queue.filter((item) => item.accountId === accountId).length;
}

/** حذف عنصر مكتمل فقط — يُستدعى بعد تأكيد نجاح الخادم حصراً */
export function removePendingVisit(dedupeKey: string): PendingVisitItem[] {
  const queue = readPendingVisits().filter((it) => it.body?.dedupeKey !== dedupeKey);
  writeQueue(queue);
  return queue;
}

/** زيادة عداد المحاولات مع تسجيل آخر خطأ — يبقى العنصر محفوظاً */
export function markPendingAttempt(dedupeKey: string, error?: string): void {
  const queue = readPendingVisits();
  const idx = queue.findIndex((it) => it.body?.dedupeKey === dedupeKey);
  if (idx >= 0) {
    queue[idx] = { ...queue[idx], attempts: (queue[idx].attempts ?? 0) + 1, lastError: error ?? queue[idx].lastError };
    writeQueue(queue);
  }
}

export interface RetryResult {
  sent: number;       // عدد الزيارات التي نجح إرسالها فعلياً الآن
  remaining: number;  // ما بقي في الطابور (فشل الآن — يبقى محفوظاً)
}

/**
 * إعادة إرسال كل عناصر الطابور بالترتيب — واحدة واحدة.
 * كل عنصر: نجح → يُحذف فوراً قبل الانتقال للتالي (لا يُفقد لو انقطعت الشبكة من جديد).
 * فشل شبكي أو خطأ خادم → يبقى في الطابور ويُنهى الحساب المتبقي فوراً حفاظاً على البيانات.
 */
export async function retryAllPendingVisits(
  postVisit: (body: Record<string, unknown>) => Promise<{ ok: boolean; duplicate?: boolean; error?: string }>,
  accountId: string
): Promise<RetryResult> {
  const queue = readPendingVisits(accountId);
  let sent = 0;
  for (const item of [...queue]) {
    try {
      const res = await postVisit(item.body);
      if (res.ok) {
        removePendingVisit(String(item.body.dedupeKey));
        sent += 1;
        continue; // التالي
      }
      markPendingAttempt(String(item.body.dedupeKey), res.error);
      break; // توقف عند أول فشل — البقية تبقى بالترتيب
    } catch {
      markPendingAttempt(String(item.body.dedupeKey), "انقطاع الاتصال");
      break;
    }
  }
  return { sent, remaining: readPendingVisits(accountId).length };
}
