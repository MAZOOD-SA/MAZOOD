// الاتصال بالخادم. كل الشاشات تكلّم الخادم من هنا، ولا شي غيره.
//
// عنوان الخادم يجي من EXPO_PUBLIC_API_URL (مو سر، عنوان بس). إذا ما انحدد:
//   - في الموقع: نفس عنوان الصفحة (/api/v1)، لأن الخادم يقدّم الموقع من نفس العنوان.
//   - في الجوال وقت التطوير: جهاز المبرمج.
// **ممنوع** تحط أي مفتاح سري هنا: أي شي في كود التطبيق يقدر أي أحد يقراه.
import type { ApiError } from "@mazood/shared";
import { Platform } from "react-native";
import { setServerReachable } from "./connection";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === "web" ? "/api/v1" : "http://localhost:3000/api/v1");

/**
 * الموقع: الجلسة في ملف تعريف محمي (HttpOnly) يرسله المتصفح بنفسه، والتطبيق ما يشوف الرمز أبدًا.
 * الجوال: الرمز في خزنة الجوال، ويرسله التطبيق في رأس Authorization.
 */
export const IS_WEB = Platform.OS === "web";

/** خطأ من الخادم برمز ثابت (مثل "code_wrong")، والشاشة تترجمه برسالة. */
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    public field?: string,
    public retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiToken(t: string | null) {
  token = t;
}

/** يتنادى إذا الخادم رد ٤٠١ (الجلسة انتهت)، عشان نرجّع المستخدم لشاشة الدخول. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

type Method = "GET" | "POST" | "PUT" | "PATCH";

export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        // حماية الموقع من الطلبات المزوّرة (CSRF). الشرح في apps/api/src/auth.ts.
        "x-requested-with": "mazood",
        ...(IS_WEB ? { "x-client": "web" } : {}),
      },
      // الموقع وقت التطوير على منفذ ثاني، ولازم يرسل ملف تعريف الجلسة معه.
      credentials: IS_WEB ? "include" : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    setServerReachable(false);
    throw new ApiRequestError(0, "network");
  }
  setServerReachable(true);
  const data = (await res.json().catch(() => null)) as (T & ApiError) | null;
  if (!res.ok) {
    if (res.status === 401 && (token || IS_WEB)) onUnauthorized?.();
    throw new ApiRequestError(res.status, data?.error ?? "server_error", data?.field, data?.retryAfterSeconds);
  }
  return data as T;
}
