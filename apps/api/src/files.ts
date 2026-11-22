// روابط مؤقتة لفتح المستندات. الرابط موقّع بسر الخادم، فيه معرّف المستند ووقت الانتهاء والموظف اللي طلبه.
// ما أحد يقدر يصنع رابط بنفسه، والرابط ينتهي خلال ٥ دقايق، وكل فتح ينكتب في سجل الإجراءات.
import { createHmac } from "node:crypto";
import { safeEqualHex } from "./security.ts";

export const FILE_LINK_TTL_SECONDS = 5 * 60;

function sign(secret: string, docId: string, exp: number, by: string): string {
  return createHmac("sha256", secret).update(`file:${docId}:${exp}:${by}`).digest("hex");
}

export function signFileLink(secret: string, docId: string, staffUserId: string, now: Date): { path: string; expiresAt: string } {
  const exp = Math.floor(now.getTime() / 1000) + FILE_LINK_TTL_SECONDS;
  const sig = sign(secret, docId, exp, staffUserId);
  return { path: `/v1/files/${docId}?exp=${exp}&by=${staffUserId}&sig=${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyFileLink(secret: string, docId: string, q: { exp?: string; by?: string; sig?: string }, now: Date): string | null {
  const exp = Number(q.exp);
  if (!q.by || !q.sig || !Number.isInteger(exp) || !/^[a-f0-9]{64}$/.test(q.sig)) return null;
  if (exp < Math.floor(now.getTime() / 1000)) return null;
  if (!safeEqualHex(q.sig, sign(secret, docId, exp, q.by))) return null;
  return q.by;
}

// صور التنفيذ: نفس الفكرة، بس الرابط باسم المستخدم اللي طلبه (المصنع صاحب الطلب أو المزوّد المنفّذ)،
// والخادم يتأكد لحظة الفتح إن هذا المستخدم لسا له حق يشوف الطلب. البادئة «photo» تمنع استخدام رابط صورة كرابط مستند.
function signPhoto(secret: string, photoId: string, exp: number, by: string): string {
  return createHmac("sha256", secret).update(`photo:${photoId}:${exp}:${by}`).digest("hex");
}

export function signPhotoLink(secret: string, photoId: string, userId: string, now: Date): { path: string; expiresAt: string } {
  const exp = Math.floor(now.getTime() / 1000) + FILE_LINK_TTL_SECONDS;
  const sig = signPhoto(secret, photoId, exp, userId);
  return { path: `/v1/order-photos/${photoId}?exp=${exp}&by=${userId}&sig=${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyPhotoLink(secret: string, photoId: string, q: { exp?: string; by?: string; sig?: string }, now: Date): string | null {
  const exp = Number(q.exp);
  if (!q.by || !q.sig || !Number.isInteger(exp) || !/^[a-f0-9]{64}$/.test(q.sig)) return null;
  if (exp < Math.floor(now.getTime() / 1000)) return null;
  if (!safeEqualHex(q.sig, signPhoto(secret, photoId, exp, q.by))) return null;
  return q.by;
}
