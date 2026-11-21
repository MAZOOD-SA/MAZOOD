// فحص المدخلات بمخططات Zod من packages/shared. أي مدخل ما يطابق يرجع 400 مع مكان الخطأ.
import type { z } from "zod";
import { HttpError } from "./errors.ts";

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  throw new HttpError(400, "invalid_input", {
    issues: r.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}
