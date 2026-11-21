// الاتصال بالخادم (apps/api). كل الشاشات تمر من هنا.
//
// الجلسة:
//   - مفتاح الدخول القصير (15 دقيقة) في الذاكرة بس، وما يُحفظ على الجهاز.
//   - مفتاح التجديد: في الجوال بالخزنة الآمنة، وفي المتصفح بكوكي محمي يحطه الخادم.
//   - إذا رجع الخادم 401، نجدد الجلسة مرة وحدة ونعيد الطلب. إذا فشل التجديد، المستخدم يطلع لشاشة الدخول.
//
// العنوان: EXPO_PUBLIC_API_URL. إذا مو محدد في التطوير، نستخدم جهاز المبرمج نفسه على المنفذ 3000.
import Constants from "expo-constants";
import { Platform } from "react-native";
import type {
  ApiErrorBody,
  ErrorCode,
  FactoryDto,
  FactoryProfileInput,
  MeDto,
  NewRequestInput,
  RequestDto,
  RequestListDto,
  SessionDto,
} from "@mazood/shared";
import { clearRefreshToken, clientKind, loadRefreshToken, saveRefreshToken } from "./refreshStore";

export type ClientErrorCode = ErrorCode | "network";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    readonly body: Partial<ApiErrorBody> = {},
  ) {
    super(code);
  }
}

const API_PORT = 3000;

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  // على الجوال مع Expo Go: نفس جهاز الكمبيوتر اللي يشغّل Expo (مثل 192.168.1.5).
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host ?? "localhost"}:${API_PORT}`;
}

export const API_URL = resolveBaseUrl();

/** رأس الحماية من CSRF، لازم يطابق apps/api/src/auth/policy.ts */
const CSRF_HEADERS = { "X-Requested-With": "mazood" };

let accessToken: string | null = null;
let refreshInFlight: Promise<MeDto | null> | null = null;
let onSessionLost: () => void = () => {};

/** الشاشات تسجّل هنا وش يصير لو انتهت الجلسة (يرجع المستخدم لشاشة الدخول). */
export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}

async function call<T>(method: string, path: string, body?: unknown, opts: { auth?: boolean; headers?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // في المتصفح: يسمح للخادم يقرأ ويحط كوكي التجديد.
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "network");
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as T & Partial<ApiErrorBody>;
  if (!res.ok) throw new ApiError(res.status, (data.error as ErrorCode) ?? "internal", data);
  return data;
}

/** طلب يحتاج دخول. إذا انتهى مفتاح الدخول، يجدد مرة وحدة ويعيد المحاولة. */
async function authed<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await call<T>(method, path, body, { auth: true });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    const me = await refreshSession();
    if (!me) {
      onSessionLost();
      throw e;
    }
    return call<T>(method, path, body, { auth: true });
  }
}

async function acceptSession(s: SessionDto): Promise<MeDto> {
  accessToken = s.accessToken;
  if (s.refreshToken) await saveRefreshToken(s.refreshToken);
  return s.me;
}

/**
 * يجدد الجلسة بمفتاح التجديد. يرجع بيانات المستخدم، أو null إذا ما فيه جلسة صالحة.
 * لو أكثر من طلب احتاج تجديد بنفس اللحظة، يمشون كلهم على تجديد واحد
 * (لأن استخدام نفس المفتاح مرتين يلغي الجلسة في الخادم).
 */
export function refreshSession(): Promise<MeDto | null> {
  refreshInFlight ??= (async () => {
    try {
      const refreshToken = clientKind === "native" ? await loadRefreshToken() : undefined;
      if (clientKind === "native" && !refreshToken) return null;
      const s = await call<SessionDto>("POST", "/auth/refresh", { client: clientKind, refreshToken: refreshToken ?? undefined }, { headers: CSRF_HEADERS });
      return await acceptSession(s);
    } catch (e) {
      // انقطاع الشبكة ما يعني إن الجلسة انتهت: نخلي المفتاح ونجرّب بعدين.
      if (e instanceof ApiError && e.code === "network") throw e;
      accessToken = null;
      await clearRefreshToken();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export const api = {
  requestOtp: (phone: string) => call<{ sent: true; expiresInSeconds: number }>("POST", "/auth/otp/request", { phone }),

  verifyOtp: async (phone: string, code: string): Promise<MeDto> =>
    acceptSession(await call<SessionDto>("POST", "/auth/otp/verify", { phone, code, client: clientKind })),

  logout: async () => {
    const refreshToken = clientKind === "native" ? await loadRefreshToken() : undefined;
    accessToken = null;
    await clearRefreshToken();
    // الخروج في الجهاز يتم حتى لو الخادم ما رد.
    await call("POST", "/auth/logout", { client: clientKind, refreshToken: refreshToken ?? undefined }, { headers: CSRF_HEADERS }).catch(() => {});
  },

  me: () => authed<MeDto>("GET", "/me"),
  saveFactory: (input: FactoryProfileInput) => authed<FactoryDto>("PUT", "/factory", input),

  listRequests: (cursor?: string) => authed<RequestListDto>("GET", `/requests?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
  getRequest: (id: string) => authed<RequestDto>("GET", `/requests/${encodeURIComponent(id)}`),
  createRequest: (input: NewRequestInput) => authed<RequestDto>("POST", "/requests", input),
  cancelRequest: (id: string) => authed<RequestDto>("POST", `/requests/${encodeURIComponent(id)}/cancel`),
};
