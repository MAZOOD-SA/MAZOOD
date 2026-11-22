// الاتصال بالخادم. إذا ما فيه EXPO_PUBLIC_API_URL يشتغل التطبيق بالوضع التجريبي (بيانات وهمية، بدون خادم).
// ممنوع نحط هنا أي مفتاح سري: كل متغير يبدأ بـ EXPO_PUBLIC_ يوصل لكل من يفتح التطبيق.
//
// الجلسة:
//  - الجوال: رمز الجلسة في رأس Authorization (محفوظ في خزنة الجوال المشفّرة، session.ts).
//  - الموقع: الخادم يحط الجلسة في كوكي محمي (HttpOnly) ما يقدر كود الصفحة يقراه. نرسله بـ
//    credentials: "include"، ومعه الرأس X-Requested-With اللي يحمي من الطلبات المزوّرة (CSRF).
import { setServerReachable } from "./connection";

export const API_URL: string | null = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || null;
/** true: نتكلم مع الخادم الحقيقي. false: النموذج التجريبي. */
export const LIVE = API_URL !== null;
/** نشتغل داخل متصفح (الموقع)، مو تطبيق الجوال. */
export const IS_WEB = typeof window !== "undefined" && typeof window.document !== "undefined";

const BASE_HEADERS = { "x-requested-with": "mazood" };
const CREDENTIALS: RequestCredentials = IS_WEB ? "include" : "omit";

export class ApiClientError extends Error {
  code: string;
  status: number;
  retryAfterSeconds?: number;
  constructor(status: number, code: string, retryAfterSeconds?: number) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** رفع ملف (multipart). ما نحدد content-type: المتصفح أو الجوال يحطه مع الحدود (boundary). */
export async function apiUpload<T = unknown>(path: string, form: FormData, token: string | null): Promise<T> {
  if (!API_URL) throw new ApiClientError(0, "not_live");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      body: form,
      credentials: CREDENTIALS,
      headers: { ...BASE_HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    setServerReachable(false);
    throw new ApiClientError(0, "network");
  }
  setServerReachable(true);
  const json = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
  if (!res.ok) throw new ApiClientError(res.status, json?.error?.code ?? "server");
  return json as T;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: "GET" | "POST" | "PUT"; body?: unknown; token?: string | null } = {},
): Promise<T> {
  if (!API_URL) throw new ApiClientError(0, "not_live");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? "GET",
      credentials: CREDENTIALS,
      headers: {
        ...BASE_HEADERS,
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    setServerReachable(false);
    throw new ApiClientError(0, "network");
  }
  setServerReachable(true);
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as { error?: { code?: string; retryAfterSeconds?: number } } | null;
  if (!res.ok) throw new ApiClientError(res.status, json?.error?.code ?? "server", json?.error?.retryAfterSeconds);
  return json as T;
}
