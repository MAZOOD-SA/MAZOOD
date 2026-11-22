// المدن (القرار ٢٠): كل مصنع وطلب ومزوّد مربوط بمدينة. البداية سدير.
// لو فيه مدينة وحدة فعّالة بس، تنحط تلقائيًا والواجهة ما تسأل عنها.
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";

export type City = { id: string; ar: string; en: string };

export async function activeCities(db: Db): Promise<City[]> {
  return db.query<City>(`SELECT id, name_ar AS ar, name_en AS en FROM cities WHERE active ORDER BY created_at, id`);
}

/** يرجّع مدينة صالحة: المطلوبة لو فعّالة، أو المدينة الوحيدة الفعّالة لو ما انطلبت مدينة. */
export async function resolveCityId(db: Db, cityId: string | null | undefined): Promise<string> {
  const cities = await activeCities(db);
  if (cityId) {
    if (!cities.some((c) => c.id === cityId)) throw new ApiError(400, "city_unavailable");
    return cityId;
  }
  if (cities.length === 1) return cities[0].id;
  throw new ApiError(400, "city_required");
}

/** نفس الفكرة لقائمة مدن (المزوّد). بدون قائمة = كل المدن الفعّالة. */
export async function resolveCityIds(db: Db, cityIds: string[] | undefined): Promise<string[]> {
  const cities = await activeCities(db);
  if (!cityIds) return cities.map((c) => c.id);
  const unique = [...new Set(cityIds)];
  if (unique.some((id) => !cities.some((c) => c.id === id))) throw new ApiError(400, "city_unavailable");
  return unique;
}
