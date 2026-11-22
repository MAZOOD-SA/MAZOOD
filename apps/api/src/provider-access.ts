// المزوّد اللي يقدر يشتغل: موثّق فعليًا (حالته verified وكل مستنداته المطلوبة مقبولة وما انتهت).
// لو انتهى مستند أو انوقف، يوقف مباشرة: ما يشوف طلبات ولا يرسل عروض (القرار ١٥).
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";
import { todayRiyadh } from "./http.ts";
import { loadDocs, summarize, type ProviderRow } from "./providers.ts";

export type ActiveProvider = ProviderRow & { cityIds: string[] };

export async function requireActiveProvider(db: Db, userId: string, now: Date): Promise<ActiveProvider> {
  const [p] = await db.query<ProviderRow>("SELECT * FROM providers WHERE user_id=$1", [userId]);
  if (!p) throw new ApiError(403, "provider_not_verified");
  const s = summarize(p, await loadDocs(db, p.id), todayRiyadh(now));
  if (!s.effectiveVerified) throw new ApiError(403, "provider_not_verified");
  const cities = await db.query<{ city_id: string }>("SELECT city_id FROM provider_cities WHERE provider_id=$1", [p.id]);
  return { ...p, cityIds: cities.map((c) => c.city_id) };
}
