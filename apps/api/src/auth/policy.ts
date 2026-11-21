// أرقام سياسة الدخول في مكان واحد. أي تعديل هنا لازم ينعكس في PLAN.md (القسم 5) وفي الاختبارات.

/** صلاحية رمز التحقق: ٥ دقائق. */
export const OTP_TTL_SECONDS = 5 * 60;
/** بعد ٥ محاولات خاطئة ينلغي الرمز. */
export const OTP_MAX_ATTEMPTS = 5;

/** حدود طلب الرموز (عشان ما أحد يستنزف رصيد الرسائل أو يزعج صاحب رقم). */
export const OTP_LIMITS = {
  perPhone15Min: 3,
  perPhoneDay: 10,
  perIpHour: 20,
} as const;

/** مفتاح الدخول القصير: ١٥ دقيقة. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** الجلسة تبقى ٣٠ يوم من آخر استخدام لمفتاح التجديد. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** اسم كوكي مفتاح التجديد في المتصفح، ومساره (ما ينرسل إلا لمسارات /auth). */
export const REFRESH_COOKIE = "mz_refresh";
export const REFRESH_COOKIE_PATH = "/auth";

/**
 * المسارات اللي تعتمد على الكوكي (التجديد والخروج) تطلب هذا الرأس.
 * المتصفح ما يرسل رأس مخصص من موقع ثاني بدون إذن CORS، فهذا يمنع هجمات CSRF،
 * فوق حماية SameSite=Strict.
 */
export const CSRF_HEADER = "x-requested-with";
export const CSRF_HEADER_VALUE = "mazood";
