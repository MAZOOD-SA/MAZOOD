// بحث «وش تحتاج؟» في الرئيسية: يطابق كلام العميل مع الأقسام وأنواعها، في الجهاز بدون خادم.
// الفكرة من ايكيا (docs/design/inspiration.md)، والخطة في docs/plans/ikea-ideas.md (المهمة ١).

/**
 * يوحّد الكتابة العربية قبل المقارنة: الهمزات (أ إ آ ← ا)، والتاء المربوطة (ة ← ه)،
 * والألف المقصورة (ى ← ي)، ويشيل التشكيل والتطويل و«ال» التعريف. عشان «سطحه» تلقى «سطحة»، و«المكيفات» تلقى «مكيفات».
 */
export function normalizeArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "") // التشكيل والتطويل
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .split(/\s+/)
    .map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w))
    .join(" ")
    .trim();
}

export type SearchEntry = { categoryId: string; typeId: string | null; terms: string[] };
export type SearchHit = { categoryId: string; typeId: string | null };

/**
 * يرجّع أفضل النتائج (٦ بالكثير). النوع يجي قبل القسم لأنه أدق.
 * كل كلمة كتبها العميل لازم تكون بداية كلمة في واحد من مصطلحات النتيجة.
 */
export function searchNeeds(query: string, entries: SearchEntry[], limit = 6): SearchHit[] {
  const words = normalizeArabic(query).split(" ").filter((w) => w.length >= 2);
  if (words.length === 0) return [];
  const hits: { hit: SearchHit; score: number }[] = [];
  for (const e of entries) {
    const termWords = e.terms.flatMap((t) => normalizeArabic(t).split(" "));
    const matches = words.every((w) => termWords.some((tw) => tw.startsWith(w)));
    if (!matches) continue;
    const exact = words.every((w) => termWords.includes(w));
    hits.push({ hit: { categoryId: e.categoryId, typeId: e.typeId }, score: (e.typeId ? 2 : 0) + (exact ? 1 : 0) });
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((h) => h.hit);
}
