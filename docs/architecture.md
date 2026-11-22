# البنية التقنية

**آخر تحديث:** 22 نوفمبر 2026 (المرحلة ٣)

## الصورة العامة

```
                 ┌────────────────────────────────────────┐
                 │  apps/app  (Expo + React Native)        │
  الموقع ◄───────┤  كود واحد للموقع وiPhone وAndroid        │
  iPhone ◄───────┤  ولوحة الإدارة لاحقًا تحت /admin          │
  Android ◄──────┤                                          │
                 └──────────────┬─────────────────────────┘
                                │ يقرأ الألوان والخطوط من
                 ┌──────────────▼─────────────────────────┐
                 │  packages/brand  ◄── يتولّد من brand/tokens.json
                 └────────────────────────────────────────┘

  المرحلة ٢ وما بعدها:
  apps/app ──HTTPS──► apps/api (Node + Fastify) ──► PostgreSQL
                                     │
                                     ├──► تخزين خاص للمستندات (S3)
                                     └──► مزوّد الرسائل النصية (OTP)
```

**التطبيق له وضعين** (يتحدد بالمتغير `EXPO_PUBLIC_API_URL`):
- **بدونه:** الوضع التجريبي (المرحلة ١): بيانات وهمية في الذاكرة، بدون خادم.
- **معه:** الوضع الحقيقي (المرحلة ٢): الدخول والطلبات والحساب من الخادم، والجلسة تنحفظ على الجهاز.

الشاشات تقرأ من `useStore()` في الوضعين، فما تدري أي وضع.

## التقنيات

| الجزء | التقنية | الإصدار |
| --- | --- | --- |
| اللغة | TypeScript | 5.9 |
| الواجهة | Expo SDK | 58 |
| | React Native | 0.88 |
| | React | 19.3 |
| | react-native-web (للموقع) | 0.21 |
| التنقل | Expo Router (كل ملف في `app/` صفحة) | 58 |
| الأيقونات | Tabler Icons (react-native) | 3.19.0 |
| الخط | IBM Plex Sans Arabic (عبر @expo-google-fonts) | 0.4.2 |
| الاختبارات | Vitest | 3.2 |
| إدارة الحزم | pnpm workspaces | 10 |

## الخادم (apps/api)

| الملف | وظيفته |
| --- | --- |
| `src/server.ts` | نقطة التشغيل: يقرأ الإعدادات، ويطبّق الـ migrations، ويشغّل الخادم |
| `src/config.ts` | الإعدادات من متغيرات البيئة، ويرفض الإعداد الضعيف في الإنتاج |
| `src/app.ts` | بناء الخادم: CORS، وتحديد المحاولات، ورفع الملفات، ومعالجة الأخطاء، وتسجيل المسارات |
| `src/http.ts` | التحقق من الجلسة والصلاحيات (`requireFactory`، `requireProviderUser`، `requireStaff(صلاحية)`) |
| `src/routes/*.ts` | المسارات: `auth` (الدخول)، و`factory` (المصنع)، و`provider` (المزوّد)، و`admin` (اللوحة والملفات) |
| `src/providers.ts` | منطق حالة المزوّد: المستندات المطلوبة، و«موثّق» فعليًا، والانتهاء |
| `src/storage.ts`, `src/files.ts` | التخزين الخاص للمستندات، والروابط المؤقتة الموقّعة |
| `src/crypto-box.ts` | تشفير رقم الهوية (AES-256-GCM) |
| `src/staff-cli.ts` | إضافة أول مالك من سطر الأوامر |
| `src/auth.ts` | الرمز والجلسات (منطق الدخول) |
| `src/security.ts` | توليد الرموز والتوكنات وبصماتها |
| `src/sms.ts` | واجهة إرسال الرسائل (الآن: طرفية للتطوير بس) |
| `src/audit.ts` | كتابة سجل الإجراءات |
| `src/db.ts`, `src/migrate.ts` | الاتصال بقاعدة البيانات وتطبيق ملفات `migrations/` |
| `migrations/*.sql` | شكل قاعدة البيانات، ملف لكل تغيير، تتطبّق بالترتيب مرة وحدة |

### المسارات (الإصدار v1)

| المسار | من يقدر | وظيفته |
| --- | --- | --- |
| `POST /v1/auth/otp/request` | أي أحد | يرسل رمز تحقق للجوال |
| `POST /v1/auth/otp/verify` | أي أحد | يتحقق من الرمز ويرجّع توكن الجلسة |
| `POST /v1/auth/logout` | داخل | يلغي الجلسة |
| `GET /v1/me` | داخل | المستخدم ومصنعه |
| `PUT /v1/factory` | مصنع | يحفظ بيانات الشركة |
| `POST /v1/requests` | مصنع | يرفع طلب |
| `GET /v1/requests`, `GET /v1/requests/:id` | مصنع | طلبات مصنعه فقط |
| `POST /v1/requests/:id/cancel` | مصنع | يلغي طلب لسا ما انقبل فيه عرض |
| `GET /v1/provider/me` | مزوّد | بياناته ومستنداته وحالته |
| `PUT /v1/provider/profile` | مزوّد | التسجيل أو تعديل البيانات (قبل الإرسال أو بعد الرفض) |
| `POST /v1/provider/documents` | مزوّد | رفع مستند (multipart: `docType`, `expiresOn`, `file`) |
| `POST /v1/provider/submit` | مزوّد | الإرسال للتوثيق |
| `GET /v1/admin/me` | موظف | دوره وصلاحياته |
| `GET /v1/admin/queue`, `/expiring` | `providers.review` | قائمة التوثيق، والمستندات اللي تنتهي |
| `GET /v1/admin/providers`, `/providers/:id` | `providers.view` | المزوّدين وتفاصيلهم |
| `GET /v1/admin/documents/:id/link` | `documents.view` | رابط مؤقت للملف |
| `GET /v1/files/:id?exp&by&sig` | الرابط الموقّع | الملف نفسه |
| `POST /v1/admin/documents/:id/review` | `providers.review` | قبول مستند (بقائمة تحقق كاملة) أو رفضه بسبب |
| `POST /v1/admin/providers/:id/decision` | `providers.review` | توثيق أو رفض الطلب |
| `POST /v1/admin/providers/:id/suspend`, `/reinstate` | `providers.suspend` | الإيقاف ورفعه |
| `GET/POST /v1/admin/staff`, `POST /staff/:id/deactivate` | `staff.manage` | الموظفين |
| `GET /v1/admin/audit` | `audit.view` | سجل الإجراءات |
| `GET /health` | أي أحد | فحص إن الخادم شغّال |

جدول الصلاحيات لكل دور في `packages/shared/src/staff.ts`، وبالكلام في `docs/admin/admin-guide.md`.

**قاعدة الصلاحيات:** المصنع يُحدَّد من الجلسة في الخادم، وما يجي أبدًا من اللي يرسله العميل. كل استعلام على الطلبات فيه `factory_id = مصنع الجلسة`، وطلب مصنع ثاني يرجّع 404 (مو 403) عشان ما نكشف وجوده. الاختبارات في `apps/api/src/requests.test.ts` تثبت هذا.

**شكل الأخطاء:** `{ "error": { "code": "..." } }`. الرموز ثابتة (`otp_invalid`, `otp_cooldown`, `validation`, `not_found`...) والواجهة تترجمها لرسائل في `strings.ts`.

## الشاشات (apps/app/app)

| الملف | الرابط | الشاشة |
| --- | --- | --- |
| `index.tsx` | `/` | يحوّل للدخول أو للرئيسية |
| `login.tsx` | `/login` | الدخول برقم الجوال |
| `verify.tsx` | `/verify` | رمز التحقق |
| `(tabs)/home.tsx` | `/home` | الرئيسية |
| `(tabs)/requests.tsx` | `/requests` | طلباتي |
| `(tabs)/invoices.tsx` | `/invoices` | الفواتير |
| `(tabs)/account.tsx` | `/account` | حسابي (اللغة والمظهر والخروج) |
| `factory-profile.tsx` | `/factory-profile` | بيانات المصنع (الوضع الحقيقي) |
| `provider/index.tsx` | `/provider` | المزوّد: حالة التوثيق ومستنداته |
| `provider/profile.tsx` | `/provider/profile` | تسجيل بيانات المزوّد |
| `provider/upload.tsx` | `/provider/upload` | رفع مستند |
| `admin/index.tsx` | `/admin` | اللوحة: قائمة التوثيق، والمستندات المنتهية، والمزوّدين |
| `admin/provider/[id].tsx` | `/admin/provider/:id` | مراجعة مزوّد وقائمة التحقق |
| `admin/staff.tsx` | `/admin/staff` | الموظفين |
| `admin/audit.tsx` | `/admin/audit` | سجل الإجراءات |

كل مجموعة (`provider/`, `admin/`, `(tabs)/`) لها `_layout.tsx` يحوّل المستخدم لشاشاته حسب نوع حسابه (`src/lib/home-route.ts`).
| `request/new.tsx` | `/request/new` | طلب جديد |
| `request/[id].tsx` | `/request/:id` | تفاصيل الطلب والعروض |
| `invoice/[id].tsx` | `/invoice/:id` | عرض الفاتورة |
| `notifications.tsx` | `/notifications` | التنبيهات |

المجلد `(tabs)` بين قوسين يعني: الشاشات فيه تظهر مع شريط التبويبات السفلي، والاسم ما يدخل في الرابط.

## كيف تتواصل الأجزاء

1. **الهوية → الكود:** `pnpm tokens` يقرأ `brand/tokens.json` ويكتب `packages/brand/src/tokens.generated.ts`. التطبيق يقرأ الألوان عن طريق `useTheme().colors`، والمسافات والزوايا والخطوط من `@mazood/brand`.
2. **اللغة والاتجاه:** `I18nProvider` يحدد اللغة (العربي افتراضي)، ويضبط `dir="rtl"` في الموقع و`I18nManager` في الجوال. النصوص في `strings.ts`، والأرقام تتنسق حسب اللغة (`src/lib/format.ts`).
3. **البيانات:** الشاشات تقرأ من `useStore()`. في الوضع التجريبي منطق العمل في `reducer.ts`. في الوضع الحقيقي الطلبات تروح للخادم (`src/api/client.ts`) وتجي منه. قبول العروض والفواتير ما انتقلت للخادم لسا (المرحلتين ٤ و٥).
4. **التحقق من المدخلات:** `packages/shared` فيه قواعد Zod. الخادم يطبّقها (هو المعتمد)، والواجهة تستخدم نفسها لرسائل فورية.

## قاعدة البيانات

PostgreSQL. الشكل الكامل المخطط في `PLAN.md` (القسم ٣). المبني للحين (`migrations/001_init.sql` و`002_providers_staff.sql`):

| الجدول | وش يحفظ |
| --- | --- |
| `users` | رقم الجوال (بصيغة `+9665XXXXXXXX`)، والدور (مصنع / مزوّد / إدارة)، والحالة (فعّال / موقوف) |
| `otp_codes` | بصمة رمز التحقق (مو الرمز)، وعدد المحاولات، والانتهاء |
| `sessions` | بصمة توكن الجلسة، والانتهاء، والإلغاء |
| `factories`, `factory_members` | المصنع وبياناته، ومين تابع له |
| `requests` | طلبات المصانع وحالتها |
| `staff` | موظفين الإدارة ودورهم وهل هم فعّالين. مالك واحد فعّال (فهرس فريد) |
| `providers` | المزوّد: الاسم، ورقم الهوية **مشفّر** مع آخر ٤ أرقام، والسجل، والأقسام، والحالة |
| `provider_documents` | المستندات: النوع، ومكان الملف في التخزين الخاص، والنوع الفعلي، وتاريخ الانتهاء، والحالة، وقائمة التحقق، وسبب الرفض |
| `audit_log` | سجل الإجراءات. **إضافة فقط:** trigger في القاعدة يمنع UPDATE وDELETE وTRUNCATE |

**الانتقال لقاعدة جديدة:** ملف جديد في `apps/api/migrations/` باسم بالترتيب (`002_...sql`)، ويتطبّق تلقائيًا عند تشغيل الخادم أو بالأمر `pnpm api:migrate`. ممنوع تعدّل ملف migration انطبق قبل.

## ملاحظات تقنية

- **الأيقونات:** نستورد كل أيقونة لحالها من `src/components/icons.ts`. `metro.config.js` يحوّل `@tabler/icons-react-native/icons/IconX` لملف الأيقونة نفسه. بدون هذا كانت المكتبة كاملة (آلاف الأيقونات) تنضم للموقع وحجمه يصير ٧ ميجا بدل ٢٫٤.
- **تقسيم الصفحات:** `asyncRoutes` مقفل في `app.json`، فالموقع ملف JavaScript واحد. هذا أبسط للنشر في هذي المرحلة.
- **pnpm بإعداد `node-linker=hoisted`** (في `.npmrc`): React Native يحتاج الحزم مسطّحة في `node_modules`.
