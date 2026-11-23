// «خطوتك الجاية»: البطاقة اللي تطلع في القائمة الجانبية لما فيه شي ينتظر المستخدم
// (docs/plans/design-phase.md، القسم ٢). دالة صافية بدون واجهة، عشان تنختبر لحالها.
//
// الأولوية:
//   العميل:  يكمّل بياناته، ثم العروض الجديدة.
//   المزوّد: مستند منتهي (يوقفه عن العروض)، ثم مستند ينتهي خلال ٣٠ يوم (الأقرب)، ثم الطلبات الجديدة في أقسامه.
//   الإدارة، أو ما فيه شي: ما فيه بطاقة.

export type NextStepInput = {
  role: "factory" | "provider" | "staff" | null;
  profileComplete: boolean; // للعميل
  newOffers: number; // عروض ما انفتحت + رسائل ما انقرت (العميل)
  newRequests: number; // طلبات مفتوحة في أقسام المزوّد
  expiring: { docType: string; expiresOn: string; expired: boolean }[];
  today: string; // تاريخ ISO
};

export type NextStep =
  | { kind: "completeProfile"; href: "/factory-profile" }
  | { kind: "offers"; count: number; href: "/requests" }
  | { kind: "docExpired"; docType: string; href: "/provider/account" }
  | { kind: "docExpiring"; docType: string; daysLeft: number; href: "/provider/account" }
  | { kind: "newRequests"; count: number; href: "/provider/requests" };

/** نفس مهلة تنبيه المستندات في لوحة الإدارة: ٣٠ يوم قبل الانتهاء. */
export const EXPIRY_WARNING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** عدد الأيام الكاملة من today لين expiresOn (تاريخين بدون وقت)، مقرّب لتحت. */
export function daysBetween(today: string, expiresOn: string): number {
  const a = Date.parse(today.slice(0, 10));
  const b = Date.parse(expiresOn.slice(0, 10));
  return Math.floor((b - a) / DAY_MS);
}

export function nextStep(i: NextStepInput): NextStep | null {
  if (i.role === "factory") {
    if (!i.profileComplete) return { kind: "completeProfile", href: "/factory-profile" };
    if (i.newOffers > 0) return { kind: "offers", count: i.newOffers, href: "/requests" };
    return null;
  }
  if (i.role === "provider") {
    const withDays = i.expiring.map((d) => ({ ...d, daysLeft: daysBetween(i.today, d.expiresOn) }));
    const expired = withDays.find((d) => d.expired || d.daysLeft < 0);
    if (expired) return { kind: "docExpired", docType: expired.docType, href: "/provider/account" };
    const soon = withDays.filter((d) => d.daysLeft <= EXPIRY_WARNING_DAYS).sort((a, b) => a.daysLeft - b.daysLeft)[0];
    if (soon) return { kind: "docExpiring", docType: soon.docType, daysLeft: soon.daysLeft, href: "/provider/account" };
    if (i.newRequests > 0) return { kind: "newRequests", count: i.newRequests, href: "/provider/requests" };
    return null;
  }
  return null;
}

/**
 * أي نص نستخدم لـ«ينتهي بعد كم يوم» عشان العدد يطلع بعربي صحيح:
 * ٠ اليوم، ١ بكرة، ٢ يومين، ٣–١٠ «أيام»، ١١ وفوق «يوم». (الإنجليزي: today وtomorrow وin n days.)
 */
export type ExpiringCopy =
  | { key: "nextDocExpiringToday" }
  | { key: "nextDocExpiringTomorrow" }
  | { key: "nextDocExpiringTwo"; n: 2 }
  | { key: "nextDocExpiringFew"; n: number }
  | { key: "nextDocExpiring"; n: number };

export function expiringCopy(daysLeft: number): ExpiringCopy {
  if (daysLeft <= 0) return { key: "nextDocExpiringToday" };
  if (daysLeft === 1) return { key: "nextDocExpiringTomorrow" };
  if (daysLeft === 2) return { key: "nextDocExpiringTwo", n: 2 };
  if (daysLeft <= 10) return { key: "nextDocExpiringFew", n: daysLeft };
  return { key: "nextDocExpiring", n: daysLeft };
}
