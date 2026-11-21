// أكواد الأخطاء اللي يرجعها الخادم. التطبيق يحوّل كل كود لرسالة بنبرة BRAND.md.
// الرد دائمًا بالشكل: { error: ErrorCode, ...تفاصيل إضافية }
export const ERROR_CODES = [
  "invalid_input", // المدخلات ما تطابق القواعد (والتفاصيل في issues)
  "rate_limited", // محاولات كثيرة (والوقت المتبقي في retryAfterSeconds)
  "sms_failed", // ما قدرنا نرسل الرسالة
  "code_expired", // ما فيه رمز صالح: انتهى، أو انلغى، أو ما انطلب
  "code_wrong", // الرمز غلط (والباقي في attemptsLeft)
  "unauthorized", // ما فيه جلسة، أو انتهت
  "forbidden", // الدور ما يسمح
  "account_suspended",
  "not_found",
  "profile_incomplete", // لازم يكمّل بيانات المصنع قبل ما يرفع طلب
  "invalid_state", // العملية ما تنفع على الحالة الحالية (مثل إلغاء طلب مكتمل)
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiErrorBody = {
  error: ErrorCode;
  attemptsLeft?: number;
  retryAfterSeconds?: number;
  issues?: { path: string; message: string }[];
};
