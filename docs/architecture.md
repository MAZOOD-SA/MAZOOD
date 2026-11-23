# البنية التقنية

**آخر تحديث:** 23 نوفمبر 2026 (غرفة الصفقة)

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
| `src/server.ts` | نقطة التشغيل: يقرأ الإعدادات، ويطبّق الـ migrations، ويشغّل الخادم والمهام الدورية |
| `src/jobs.ts` | المهام الدورية كل دقيقة: التأكيد التلقائي، وتثبيت حالة الطلبات المنتهية، وطلبات الإلغاء اللي ما رد عليها المزوّد في المهلة (تتحوّل بلاغ). آمنة لو تأخرت أو اشتغلت مرتين |
| `src/execution.ts` | التنفيذ: بدأت، وتم التنفيذ، وتأكيد الاستلام، والتأكيد التلقائي، والصور، وتعديل السعر |
| `src/cancellations.ts` | الإلغاء قبل البدء وبعده (طلب إلغاء بمهلة رد)، ورسوم الإلغاء من السياسة المحفوظة، واعتذار المزوّد وإرجاع العروض الصالحة («اختر عرض ثاني»)، وإعادة النشر، والبلاغ وملاحظاته وقرار خدمة العملاء |
| `src/ratings.ts` | التقييم بالنجوم: مرة وحدة بعد الاكتمال، ومتوسط المزوّد وعدده |
| `src/commitment.ts` | رقم الالتزام «التزم بـ X من Y طلب»: العدّ من القاعدة خلال المدة (الحساب في `packages/shared/src/commitment.ts`) |
| `src/config.ts` | الإعدادات من متغيرات البيئة، ويرفض الإعداد الضعيف في الإنتاج |
| `src/app.ts` | بناء الخادم: CORS، وتحديد المحاولات، ورفع الملفات، ومعالجة الأخطاء، وتسجيل المسارات |
| `src/http.ts` | الجلسة (رمز Bearer من التطبيق أو كوكي محمي من الموقع)، والصلاحيات (`requireFactory`، `requireProviderUser`، `requireStaff(صلاحية)`)، والحماية من التكرار (`idempotent`) |
| `src/routes/*.ts` | المسارات: `auth` (الدخول)، و`factory` (المصنع والعروض وموظفينه)، و`provider` (تسجيل المزوّد)، و`offers` (الطلبات المتاحة والعروض و«شغلي»)، و`execution` (التنفيذ والصور وتعديل السعر)، و`cancellations` (الإلغاء والاعتذار وإعادة النشر والبلاغ، ومنها مسارات خدمة العملاء للبلاغات)، و`admin` (اللوحة والملفات) |
| `src/orders.ts` | القبول كعملية وحدة، والترشيح وموافقة المدير، والحالة الفعلية للطلب، والخط الزمني |
| `src/provider-access.ts` | المزوّد اللي يقدر يشتغل (موثّق فعليًا) مع أقسامه ومدنه |
| `src/cities.ts` | المدن الفعّالة، واختيار المدينة تلقائيًا لو فيه وحدة بس |
| `src/settings.ts`, `src/settings-cli.ts` | قراءة الإعدادات من القاعدة وتعديلها (مع السجل) |
| `src/providers.ts` | منطق حالة المزوّد: المستندات المطلوبة، و«موثّق» فعليًا، والانتهاء |
| `src/storage.ts`, `src/files.ts` | التخزين الخاص للمستندات، والروابط المؤقتة الموقّعة |
| `src/crypto-box.ts` | تشفير رقم الهوية (AES-256-GCM) |
| `src/identity.ts` | العميل منشأة أو فرد: اكتمال البيانات حسب النوع، وحالة التحقق من هوية الفرد، وخطوات ربط نفاذ (القرارين ٤١ و٤٢) |
| `src/notify.ts`, `src/events.ts`, `src/reminders.ts` | التنبيهات (القرار ٤٩): الكتابة والإرسال مع إعادة المحاولة وإشعارات Expo، وربط كل حدث بمين يوصله، والتذكيرات بالوقت |
| `src/routes/notifications.ts` | التنبيهات للمستخدم الداخل: القائمة، و«قرأت»، والتفضيلات، ورمز إشعارات الجهاز |
| `src/deal-room.ts`, `src/routes/deal-room.ts` | غرفة الصفقة (القرار ٥٢): المحادثة المشفّرة بين العميل والمزوّد بعد القبول، و«غير مقروء»، وتنبيه «رسالة جديدة» المجمّع، وقراءة خدمة العملاء وقت البلاغ (مع السجل) |
| `src/market.ts` | السوق: شرط ظهور المنتج (`productListedSql`، القرار ٤٤)، والاشتراك الحالي، وحالة البائع كاملة، وتقييمه |
| `src/routes/market.ts` | مسارات السوق: العامة (المنتجات والصور وصفحة البائع)، والمصنع البائع («متجري»)، والمشتري (طلب السعر وأزراره) |
| `src/routes/market-admin.ts` | مسارات اللوحة للسوق: توثيق البائعين ورابط السجل المؤقت، وإخفاء المنتج المخالف، والدفعات والباقات، والأرقام شهر بشهر |
| `src/routes/platform-admin.ts` | مسارات اللوحة (هـ-٢): «بانتظارك»، والإعدادات (العمولة للمالك بس)، والصلاحيات، وتنفيذ طلبات الحذف (`completeDeletion`)، وأرقام الخدمات (`serviceStats`) |
| `src/routes/customers-admin.ts` | مسارات اللوحة للعملاء: القائمة، والتفاصيل (رقم الهوية كامل لصلاحية `customers.identity` مع السجل)، وتأكيد الهوية يدويًا |
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
| `GET /v1/me` | داخل | المستخدم وحساب العميل: `kind` (منشأة أو فرد أو فاضي)، و`idNumberMasked` (آخر ٤ أرقام)، و`identity.status`، و`profileComplete` |
| `PUT /v1/factory` | مدير حساب العميل | يحفظ البيانات حسب النوع: `{ kind: "business", name, commercialRegister, vatNumber }` أو `{ kind: "individual", name, idType, idNumber }`. بدون `kind` = منشأة. تغيير النوع بعد أول طلب `409 kind_locked` |
| `POST /v1/requests` | عميل بياناته مكتملة | يرفع طلب (`409 profile_incomplete` قبل اكتمال البيانات، و`identity_unverified` لو الإعداد مفعّل). الرد فيه `reach`: كم مزوّد موثّق وصله (القرار ٤٠) |
| `GET /v1/requests`, `GET /v1/requests/:id` | مصنع | طلبات مصنعه فقط. القائمة فيها `offerCount` و`newOfferCount`، والتفاصيل فيها `reach` |
| `GET /v1/account/deletion`, `POST /v1/account/deletion` | مصنع أو مزوّد | حالة «طلب حذف الحساب»، وإرساله (السبب اختياري). ما ينمسح شي تلقائيًا (القرار ٣٩) |
| `POST /v1/requests/:id/cancel` | مصنع | الإلغاء المباشر في أي حالة قبل ما يبدأ المزوّد. قبل القبول مجاني دائمًا، وبعده تنحسب الرسوم من السياسة المحفوظة (صفر الحين). يقبل `Idempotency-Key` |
| `POST /v1/requests/:id/cancellation`, `/cancellation/withdraw` | مصنع | «اطلب الإلغاء» بعد البدء مع السبب (المزوّد يرد خلال المهلة)، أو سحبه |
| `POST /v1/requests/:id/republish` | مصنع | إعادة نشر الطلب المنتهي، مع تعديل اختياري (`details`, `area`, `location`, `when`) |
| `POST /v1/requests/:id/dispute`, `/dispute/notes` | مصنع | فتح بلاغ (من «قيد التنفيذ» أو «تم التنفيذ»)، وإضافة ملاحظة عليه |
| `GET /v1/cities` | أي أحد | المدن الفعّالة |
| `POST /v1/requests/:id/offers/:offerId/accept` | مصنع (المدير، أو المصنع بمستخدم واحد) | قبول عرض. عملية وحدة، وتقبل رأس `Idempotency-Key` |
| `POST /v1/requests/:id/offers/:offerId/nominate` | موظف المصنع | ترشيح عرض للمدير |
| `POST /v1/requests/:id/nomination/withdraw` | مصنع | سحب الترشيح (الموظف) أو رفضه (المدير) |
| `GET/POST /v1/factory/members`, `POST /v1/factory/members/:userId/suspend\|activate` | مصنع (الإضافة والإيقاف للمدير) | موظفين المصنع |
| `GET /v1/provider/requests`, `/provider/requests/:id` | مزوّد موثّق | الطلبات المتاحة في أقسامه ومدنه (بدون اسم المصنع والموقع بالضبط) |
| `POST /v1/provider/requests/:id/offers` | مزوّد موثّق | إرسال عرض |
| `PUT /v1/provider/offers/:id`, `POST /v1/provider/offers/:id/withdraw` | المزوّد صاحب العرض | تعديل العرض أو سحبه قبل القبول |
| `GET /v1/provider/offers` | مزوّد | «عروضي» |
| `GET /v1/provider/jobs` | مزوّد | الطلبات اللي انقبل فيها عرضه، مع بيانات المصنع والموقع بالضبط |
| `GET /v1/provider/jobs/:orderId` | المزوّد المنفّذ | الطلب المنفّذ مع تفاصيل التنفيذ: الصور، وطلبات تعديل السعر، والخط الزمني، وموعد التأكيد التلقائي |
| `POST /v1/provider/jobs/:orderId/start`, `/deliver` | المزوّد المنفّذ | «بدأت التنفيذ» و«تم التنفيذ». تقبل `Idempotency-Key`. «تم التنفيذ» ممنوع وفيه طلب تعديل سعر ينتظر |
| `POST /v1/provider/jobs/:orderId/photos` | المزوّد المنفّذ | صورة بدء أو انتهاء (multipart: `stage`, `file`). JPEG أو PNG، وحتى ٣ لكل مرحلة |
| `POST /v1/provider/jobs/:orderId/price-change`, `/price-change/withdraw` | المزوّد المنفّذ | طلب تعديل السعر أثناء التنفيذ مع السبب، أو سحبه |
| `POST /v1/requests/:id/confirm` | مصنع | تأكيد الاستلام بعد «تم التنفيذ». يقبل `Idempotency-Key` |
| `POST /v1/requests/:id/rating` | مصنع | التقييم `{ stars: 1..5 }` بعد الاكتمال، مرة وحدة (409 `not_completed` أو `already_rated`). بدون تعليق مكتوب (القرار ٣٣) |
| `POST /v1/requests/:id/price-changes/:changeId/approve\|reject` | مصنع (المدير، أو المصنع بمستخدم واحد) | قرار تعديل السعر. الموافقة تغيّر السعر المتفق عليه |
| `POST /v1/provider/jobs/:orderId/cancellation/respond` | المزوّد المنفّذ | الرد على طلب الإلغاء: `agree` (ينلغي الطلب) أو `decline` (ينفتح بلاغ) |
| `POST /v1/provider/jobs/:orderId/withdraw` | المزوّد المنفّذ | «اعتذر عن الطلب» قبل البدء مع السبب. الطلب يرجع مفتوح للمصنع، والعروض الصالحة ترجع فعّالة |
| `POST /v1/provider/jobs/:orderId/dispute`, `/dispute/notes` | المزوّد المنفّذ | فتح بلاغ، وإضافة ملاحظة عليه |
| `GET /v1/order-photos/:id?exp&by&sig` | الرابط الموقّع | صورة التنفيذ. الخادم يتأكد لحظة الفتح إن صاحب الرابط هو المزوّد المنفّذ أو موظف فعّال في المصنع |
| `GET /v1/provider/me` | مزوّد | بياناته ومستنداته وحالته |
| `PUT /v1/provider/profile` | مزوّد | التسجيل أو تعديل البيانات (قبل الإرسال أو بعد الرفض) |
| `POST /v1/provider/documents` | مزوّد | رفع مستند (multipart: `docType`, `expiresOn`, `file`) |
| `POST /v1/provider/submit` | مزوّد | الإرسال للتوثيق |
| `GET /v1/admin/me` | موظف | دوره وصلاحياته (الفعلية بعد تعديلات المالك). و`/v1/me` يرجّعها بعد في `user.staffPermissions` |
| `GET /v1/admin/overview` | موظف | «بانتظارك»: عدد اللي ينتظر في كل قسم يخصه (null للباقي) |
| `GET /v1/admin/settings`, `PUT /settings/:key` | `settings.manage` | الإعدادات. تغيير `market.commissionBps` يحتاج `settings.commission` (المالك)، وإلا 403 `owner_only` |
| `GET/PUT /v1/admin/permissions` | `permissions.manage` (المالك) | جدول الصلاحيات: الافتراضي والفعلي والمقفول، وتعديله (إعداد `rolePermissions`) |
| `GET /v1/admin/deletions`, `POST /deletions/:id/complete\|reject` | `accounts.delete` | طلبات الحذف. التنفيذ يمسح البيانات الشخصية ويبقي الطلبات والفواتير والسجل، وما ينفّذ مع طلب جاري (409 `deletion_has_active_orders`) |
| `GET /v1/admin/stats` | `reports.view` | أرقام الخدمات آخر ١٢ شهر، والعرض والطلب في كل قسم |
| `GET /v1/admin/market/products` | `market.moderate` | المنتجات للمراجعة (بحث `?q=` وتصفية `?status=`) |
| `GET /v1/admin/queue`, `/expiring` | `providers.review` | قائمة التوثيق، والمستندات اللي تنتهي |
| `GET /v1/admin/providers`, `/providers/:id` | `providers.view` | المزوّدين وتفاصيلهم |
| `GET /v1/admin/documents/:id/link` | `documents.view` | رابط مؤقت للملف |
| `GET /v1/files/:id?exp&by&sig` | الرابط الموقّع | الملف نفسه |
| `POST /v1/admin/documents/:id/review` | `providers.review` | قبول مستند (بقائمة تحقق كاملة) أو رفضه بسبب |
| `POST /v1/admin/providers/:id/decision` | `providers.review` | توثيق أو رفض الطلب |
| `POST /v1/admin/providers/:id/suspend`, `/reinstate` | `providers.suspend` | الإيقاف ورفعه |
| `GET/POST /v1/admin/staff`, `POST /staff/:id/deactivate` | `staff.manage` | الموظفين |
| `GET /v1/admin/audit` | `audit.view` | سجل الإجراءات |
| `GET /v1/admin/customers`, `/customers/:id` | `customers.view` | العملاء (تصفية `?kind=` و`?identity=`). رقم هوية الفرد كامل لصلاحية `customers.identity` بس، والاطلاع ينكتب في السجل |
| `POST /v1/admin/customers/:id/verify-identity` | `customers.identity` | تأكيد هوية الفرد يدويًا لين يجهز نفاذ |
| `GET /v1/admin/disputes`, `/disputes/:id` | `disputes.manage` | البلاغات (المفتوحة أول) وتفاصيلها: كل الملاحظات، وطلب الإلغاء المرتبط، والخط الزمني، وبيانات تواصل الطرفين |
| `POST /v1/admin/disputes/:id/notes`, `/disputes/:id/resolve` | `disputes.manage` | ملاحظة (داخلية أو للطرفين)، والقرار: `complete` أو `cancel` أو `resume` مع السبب |
| `GET /v1/market/categories` | أي أحد | تصنيفات المنتجات |
| `GET /v1/market/products?q=&category=&seller=&page=` | أي أحد | المنتجات الظاهرة (القرار ٤٤)، المميزة أول، ٣٠ في الصفحة. لو `publicMinProducts` ما اكتمل: الزائر يشوف `comingSoon: true` |
| `GET /v1/market/products/:id`, `/v1/market/sellers/:id` | أي أحد | صفحة المنتج، وصفحة المصنع البائع بمنتجاته وتقييمه |
| `GET /v1/market/images/:id` | أي أحد | صورة منتج (القرار ٤٦) |
| `GET/POST /v1/market/seller` | منشأة (التفعيل للمدير) | حالة البائع (التوثيق، والسجل، والاشتراك، و`listed`، والتنبيهات قبل الانتهاء)، أو تفعيل البيع |
| `POST /v1/market/seller/documents`, `/seller/submit` | مدير المنشأة البائعة | رفع السجل التجاري (multipart: `expiresOn`, `file`)، والإرسال للتوثيق |
| `GET/POST /v1/market/seller/products`, `PUT /seller/products/:id`, `POST /:id/hide\|show` | البائع (الكتابة للمدير) | المنتجات. أقصى عدد حسب الباقة (`409 products_limit`) |
| `POST /v1/market/seller/products/:id/images`, `/images/:imageId/delete` | مدير البائع | صور المنتج (JPEG أو PNG، ٣ ميجا، حتى ٥) |
| `GET /v1/market/seller/purchase-requests[/:id]`, `POST /:id/quote\|decline` | البائع (الرد للمدير) | طلبات الشراء الواصلة، والرد بسعر ومدة وتوصيل وصلاحية، أو الاعتذار |
| `POST /v1/market/products/:id/purchase-requests` | عميل نوعه في `market.buyerKinds` وبياناته مكتملة، أو مزوّد موثّق لو `provider` في الإعداد (القرار ٥٧) | طلب سعر بكمية. الرد فيه `estimateHalalas` من السعر المعلن |
| `GET /v1/market/purchase-requests[/:id]` | العميل أو المزوّد | طلبات الشراء حقته، مع `actions` (أزرار المشتري) و`contact` بعد الاتفاق |
| `POST /v1/market/purchase-requests/:id/accept\|reject\|revision\|cancel\|received\|rating` | المشتري صاحب الطلب (عميل أو مزوّد، حتى لو انوقف بعد الطلب) | أزرار المشتري. أي زر مو في `actions` يرجّع 409 |
| `GET /v1/admin/market/sellers[/:id]`, `POST /sellers/:id/decision` | `sellers.review` | قائمة البائعين (اللي ينتظر أول)، وتفاصيله ودفعاته، والقرار |
| `GET /v1/admin/market/seller-documents/:id/link`, `GET /v1/seller-files/:id` | `sellers.review` | رابط مؤقت لسجل البائع، والملف نفسه (الفتح في السجل) |
| `POST /v1/admin/market/sellers/:id/suspend\|reinstate` | `providers.suspend` | إيقاف بائع مع السبب، ورفعه |
| `POST /v1/admin/market/products/:id/remove\|restore` | `market.moderate` | إخفاء منتج مخالف مع السبب، أو إرجاعه (يرجع مخفي) |
| `GET /v1/admin/market/subscriptions`, `POST /sellers/:id/payments` | `subscriptions.manage` | الاشتراكات، وتسجيل دفعة يدوية (القرار ٤٥) |
| `GET /v1/admin/market/plans`, `PUT /plans/:id` | `subscriptions.manage` / `plans.manage` | الباقات وتعديل سعرها وحدها |
| `GET /v1/admin/market/stats` | `market.reports` | آخر ١٢ شهر: دخل الاشتراكات، والبائعين المشتركين، وطلبات الشراء، والمتفق عليها وقيمتها |
| `GET /v1/notifications`, `POST /v1/notifications/read` | داخل | تنبيهاتي (آخر ١٠٠ وعدد غير المقروء)، وتعليمها مقروءة (`ids` أو كلها) |
| `GET/PUT /v1/notifications/prefs` | داخل | الرسائل النصية، وإشعارات الجوال، والأحداث المكتومة |
| `GET/POST /v1/requests/:id/messages` | العميل | غرفة الصفقة: المحادثة (GET يسجّل «قرأت»)، وإرسال رسالة. بعد القبول بس |
| `GET/POST /v1/provider/jobs/:orderId/messages` | المزوّد | نفس المحادثة من جهة المزوّد |
| `GET /v1/admin/disputes/:id/messages` | `disputes.manage` | المحادثة لطلب فيه بلاغ، وكل قراءة تنسجل |
| `POST /v1/push-tokens`, `/push-tokens/revoke` | داخل | رمز إشعارات Expo للجهاز |
| `GET /health` | أي أحد | فحص إن الخادم شغّال |

جدول الصلاحيات لكل دور في `packages/shared/src/staff.ts`، وبالكلام في `docs/admin/admin-guide.md`.

**قاعدة الصلاحيات:** المصنع يُحدَّد من الجلسة في الخادم، وما يجي أبدًا من اللي يرسله العميل. كل استعلام على الطلبات فيه `factory_id = مصنع الجلسة`، وطلب مصنع ثاني يرجّع 404 (مو 403) عشان ما نكشف وجوده. الاختبارات في `apps/api/src/requests.test.ts` تثبت هذا.

**دورة الطلب:** كل حالات الطلب والانتقالات بينها ومين يقدر يسويها في **جدول واحد**: `packages/shared/src/order-flow.ts`. الخادم ما يغيّر حالة طلب إلا عن طريق `nextStatus()`، وأي انتقال مو في الجدول يرجّع 409 `invalid_transition`. الطلب المفتوح اللي عدّت مدته (`expires_at`) يُحسب «منتهي» وقت القراءة (`effectiveStatus` في `orders.ts`).

**جلسة الموقع:** الموقع ما يحفظ رمز الدخول. الخادم يحطه في كوكي `mz_session` (HttpOnly وSameSite=Strict وPath=/v1، وSecure في الإنتاج). أي طلب يغيّر شي بالكوكي لازم يحمل `X-Requested-With: mazood` (حماية CSRF). التطبيق يرسل الرمز في `Authorization: Bearer`. حد الطلبات العام لكل مستخدم داخل، ولكل IP قبل الدخول.

**تفاصيل الطلب للمصنع** (`GET /v1/requests/:id` وكل مسار يرجّعها) فيها `actions`: أزرار المصنع الفعلية من `factoryActions()` في `order-flow.ts` (الزر الكهرماني `primary` والباقي `others`)، والواجهة تبيّنها كما هي. ومعها `cancellationFee` (رسوم الإلغاء لو ألغى الحين، بالضبط)، و`cancellationPolicy` (السياسة الحالية قبل القبول، عشان تظهر مع العروض)، و`cancellationRequest`، و`withdrawal` (لو المزوّد اعتذر)، و`dispute`.

**التقييم ورقم الالتزام (الخطوة ٩):** بطاقة كل عرض فيها `provider.rating` (`{ average, count }` أو `null`) و`provider.commitment`: `{ kind: "count", kept, total }` («التزم بـ ٩ من ١٠ طلبات»)، أو `{ kind: "new" }` («جديد على المنصة» قبل الحد الأدنى)، أو `null` لو الميزة موقوفة. ونفس الخانتين في `/v1/provider/me`. الإعداد `commitment` (`enabled` و`windowMonths` و`minOrders`، الافتراضي ١٢ شهر و٥ طلبات). **طريقة حذف الرقم أو تبديله** مكتوبة أول `packages/shared/src/commitment.ts` (القرار ٣٣).

**رسوم الإلغاء:** دالة وحدة `cancellationFee()` في `packages/shared/src/cancellation.ts` تحسبها بالهللة من **السياسة المحفوظة مع الطلب وقت القبول** (`orders.cancellation_policy`) ومرحلة الطلب ومين ألغى. الهيكل يتحمّل مبلغ ثابت، ونسبة، وحد أدنى وأعلى، ومهلة سماح بعد القبول، وتوزيع بين المزوّد والمنصة (أو المصنع والمنصة لو المزوّد اعتذر). **كل القيم صفر** لين يقرر المالك (القرار ٣٠). التحصيل الفعلي في المرحلة ٥.

**شكل الأخطاء:** `{ "error": { "code": "..." } }`. الرموز ثابتة (`otp_invalid`, `otp_cooldown`, `validation`, `not_found`...) والواجهة تترجمها لرسائل في `strings.ts`.

## الشاشات (apps/app/app)

| الملف | الرابط | الشاشة |
| --- | --- | --- |
| `index.tsx` | `/` | يحوّل للدخول أو للرئيسية |
| `login.tsx` | `/login` | الدخول برقم الجوال |
| `verify.tsx` | `/verify` | رمز التحقق |
| `(tabs)/home.tsx` | `/home` | الرئيسية |
| `(tabs)/requests.tsx` | `/requests` | طلباتي |
| `(tabs)/invoices.tsx` | `/invoices` | الفواتير (زرّها مخفي من الشريط، وتنفتح من «حسابي») |
| `(tabs)/shop.tsx` | `/shop` | تبويب «السوق» للعميل الداخل (نفس `src/screens/MarketBrowse.tsx`) |
| `(tabs)/store.tsx` | `/store` | «متجري»: التفعيل، وخطوات الظهور، والسجل، والاشتراك، وطلبات الشراء الواصلة، ومنتجاتي. التبويب يظهر بس للمنشأة اللي فعّلت البيع |
| `market/index.tsx` | `/market` | **الصفحة العامة للسوق** (بدون دخول): البحث والتصنيفات والمنتجات |
| `market/[id].tsx` | `/market/:id` | صفحة المنتج (بدون دخول). «اطلب سعر» هو الزر الكهرماني |
| `market/seller/[id].tsx` | `/market/seller/:id` | صفحة المصنع البائع (بدون دخول) |
| `purchase/new.tsx` | `/purchase/new?product=ID` | «اطلب سعر»: الكمية والموعد والملاحظة، مع تقدير من السعر المعلن |
| `purchase/[id].tsx` | `/purchase/:id` | طلب الشراء للمشتري: رد المصنع والأزرار من الخادم (`actions`) والتواصل بعد الاتفاق |
| `seller/product.tsx` | `/seller/product[?id=]` | إضافة منتج أو تعديله وصوره وإخفاؤه |
| `seller/purchase/[id].tsx` | `/seller/purchase/:id` | طلب شراء واصل للبائع: الرد بسعر ومدة وتوصيل، أو الاعتذار |
| `(tabs)/account.tsx` | `/account` | حسابي: بيانات المصنع، وموظفين المصنع، واللغة والمظهر، وطلب حذف الحساب |
| `factory-profile.tsx` | `/factory-profile` | بيانات الحساب: «أنت منشأة أو فرد؟» أول مرة، وبعدها النموذج حسب النوع |
| `provider/index.tsx` | `/provider` | المزوّد قبل التوثيق: حالة التوثيق ومستنداته (بعد التوثيق يحوّل للطلبات المتاحة) |
| `provider/(tabs)/requests.tsx` | `/provider/requests` | الطلبات المتاحة. في الكمبيوتر: القائمة ونموذج العرض جنب بعض |
| `provider/(tabs)/work.tsx` | `/provider/work` | شغلي: الشغل الجاري، وعروضي الفعّالة، والمنتهية، وحركة «انقبل عرضك» |
| `provider/(tabs)/market.tsx` | `/provider/market` | السوق للمزوّد (نفس `MarketBrowse`) مع زر «طلباتي من السوق» (القرار ٥٧) |
| `provider/purchases.tsx` | `/provider/purchases` | طلبات المزوّد من السوق. كل طلب يفتح `/purchase/:id` |
| `provider/(tabs)/account.tsx` | `/provider/account` | حسابي للمزوّد: التقييم ورقم الالتزام، والمستندات، والتفضيلات، وطلب الحذف |
| `provider/request/[id].tsx` | `/provider/request/:id` | الطلب المتاح ونموذج العرض (الجوال) |
| `provider/job/[id].tsx` | `/provider/job/:id` | الطلب المنفّذ: بدأت، والصور، وتم التنفيذ، وتعديل السعر، والإلغاء، والاعتذار، والبلاغ |
| `provider/profile.tsx` | `/provider/profile` | تسجيل بيانات المزوّد |
| `provider/upload.tsx` | `/provider/upload` | رفع مستند |
| `admin/index.tsx` | `/admin` | «بانتظارك»: عدد اللي ينتظر في كل قسم، وفي الجوال قائمة الأقسام |
| `admin/verification.tsx` | `/admin/verification` | التوثيق: قائمة المزوّدين، والمستندات المنتهية، وكل المزوّدين، والبائعين |
| `admin/seller/[id].tsx` | `/admin/seller/:id` | مراجعة بائع: السجل وقائمة التحقق، والإيقاف، والدفعات |
| `admin/customers.tsx`, `admin/customer/[id].tsx` | `/admin/customers`, `/admin/customer/:id` | العملاء: بحث وتصفية، وصفحة العميل وتأكيد الهوية |
| `admin/disputes.tsx`, `admin/dispute/[id].tsx` | `/admin/disputes`, `/admin/dispute/:id` | البلاغات: الملاحظات، وقراءة المحادثة، والقرار |
| `admin/market.tsx` | `/admin/market` | السوق: المنتجات، والاشتراكات وتسجيل الدفعة، والباقات |
| `admin/deletions.tsx` | `/admin/deletions` | طلبات حذف الحساب |
| `admin/stats.tsx` | `/admin/stats` | الأرقام شهر بشهر |
| `admin/settings.tsx`, `admin/permissions.tsx` | `/admin/settings`, `/admin/permissions` | الإعدادات، والصلاحيات (المالك) |
| `admin/provider/[id].tsx` | `/admin/provider/:id` | مراجعة مزوّد وقائمة التحقق |
| `admin/staff.tsx` | `/admin/staff` | الموظفين |
| `admin/audit.tsx` | `/admin/audit` | سجل الإجراءات |

كل مجموعة (`provider/`, `admin/`, `(tabs)/`) لها `_layout.tsx` يحوّل المستخدم لشاشاته حسب نوع حسابه (`src/lib/home-route.ts`).
| `request/new.tsx` | `/request/new` | طلب جديد |
| `request/[id].tsx` | `/request/:id` | تفاصيل الطلب: مقارنة العروض والقبول، والتنفيذ، والإلغاء، والتأكيد، والتقييم، والبلاغ. الأزرار من الخادم (`actions`) |
| `invoice/[id].tsx` | `/invoice/:id` | عرض الفاتورة |
| `notifications.tsx` | `/notifications` | التنبيهات |
| `help.tsx` | `/help` | «مساعدة»: الأسئلة الشائعة لكل نوع (`src/data/faq.ts`)، والموظف يشوف الكل |

المجلد `(tabs)` بين قوسين يعني: الشاشات فيه تظهر مع شريط التبويبات السفلي (في الجوال)، والاسم ما يدخل في الرابط.

**الجوال والكمبيوتر (الخطوة ١١، القرار ٣٧):** المقاسات من `brand/tokens.json` عن طريق `useLayout()` (`src/lib/layout.ts`). في التابلت والكمبيوتر القائمة الجانبية (`src/components/nav.tsx`) تلف كل الشاشات من `app/_layout.tsx`، والتبويبات تختفي. أدوات الترتيب في `src/components/layout.tsx`: `Screen` (عرض `content` للنماذج أو `page` للقوائم)، و`TwoColumn` (عمودين في الكمبيوتر)، و`Grid` (عدد البطاقات حسب العرض).

**ملفات مهمة في الواجهة:**
- `src/api/types.ts`: شكل ردود الخادم لشاشات المرحلة ٤.
- `src/demo/server.ts`: الخادم التجريبي داخل المتصفح (القرار ٣٦). وفيه بيانات «أسوأ حالة» للفحص (`?data=worst` أو `?data=mixed`، القرار ٥٤)، وزرها `src/components/DataVariantToggle.tsx` (للتطوير بس).
- `src/lib/next-step.ts`: بطاقة «خطوتك الجاية» في القائمة الجانبية (دالة صافية مع اختبارات، القرار ٥٤).
- `src/components/CategoryIcon.tsx`: أيقونة القسم بلون النص، بدون دائرة (القرار ٥٥).
- `src/lib/motion.ts`: «تقليل الحركة» (مستمع واحد للتطبيق) و`pressFeedback` (ردة فعل الضغط للأزرار والبطاقات).
- `src/components/flow.tsx`: التحديث كل ٢٠ ثانية (`useAutoRefresh`)، وحركة المكافأة (`CountUp` و`RewardCheck`، تحترم «تقليل الحركة»)، والنجوم، والخط الزمني.
- `src/components/provider.tsx`: بطاقة الطلب المتاح، ونموذج العرض، وبطاقة الشغل.
- `src/components/account.tsx`: التفضيلات، وطلب حذف الحساب، والخروج.
- `src/i18n/strings-flow.ts`: نصوص شاشات المرحلة ٤.
- `src/i18n/strings-customer.ts`: نصوص العميل الفرد والسوق.
- `src/api/market-types.ts`: شكل ردود الخادم لشاشات السوق.
- `src/components/market.tsx` و`src/components/purchase.tsx`: بطاقة المنتج والسعر والصورة، وبطاقة طلب الشراء وتفاصيله، و`useSellerEnabled()` (يظهر تبويب «متجري»).
- `src/demo/market.ts`: السوق في الخادم التجريبي (البائعين التجريبيين موثّقين ومشتركين من البداية).
- `src/lib/image.ts`: تصغير صورة المنتج في الموقع قبل الرفع (القرار ٤٦).

**ملاحظة على التبويبات:** التبويب المخفي يُخفى بـ `tabBarButton: () => null` مو `href: null`، لأن `href: null` يكسر الرابط المباشر (مثل `/invoices` بعد تحديث الصفحة يفتح الرئيسية).

## كيف تتواصل الأجزاء

1. **الهوية → الكود:** `pnpm tokens` يقرأ `brand/tokens.json` ويكتب `packages/brand/src/tokens.generated.ts`. التطبيق يقرأ الألوان عن طريق `useTheme().colors`، والمسافات والزوايا والخطوط من `@mazood/brand`.
2. **اللغة والاتجاه:** `I18nProvider` يحدد اللغة (العربي افتراضي)، ويضبط `dir="rtl"` في الموقع و`I18nManager` في الجوال. النصوص في `strings.ts`، والأرقام تتنسق حسب اللغة (`src/lib/format.ts`).
3. **البيانات:** الشاشات تقرأ من `useStore()`. في الوضع التجريبي منطق العمل في `reducer.ts`. في الوضع الحقيقي الطلبات تروح للخادم (`src/api/client.ts`) وتجي منه. قبول العروض والفواتير ما انتقلت للخادم لسا (المرحلتين ٤ و٥).
4. **التحقق من المدخلات:** `packages/shared` فيه قواعد Zod. الخادم يطبّقها (هو المعتمد)، والواجهة تستخدم نفسها لرسائل فورية.

## قاعدة البيانات

PostgreSQL. الشكل الكامل المخطط في `PLAN.md` (القسم ٣) و`docs/plans/phase-4.md` (القسم ٥). المبني للحين (`migrations/001` إلى `016`):

| الجدول | وش يحفظ |
| --- | --- |
| `users` | رقم الجوال (بصيغة `+9665XXXXXXXX`)، والدور (مصنع / مزوّد / إدارة)، والحالة (فعّال / موقوف) |
| `otp_codes` | بصمة رمز التحقق (مو الرمز)، وعدد المحاولات، والانتهاء |
| `sessions` | بصمة توكن الجلسة، والانتهاء، والإلغاء |
| `factories`, `factory_members` | **العميل** (الاسم باقي `factories` عشان ما نكسر شي، القرار ٤١): `kind` (منشأة أو فرد)، وبيانات المنشأة (السجل والرقم الضريبي)، أو بيانات الفرد (نوع الهوية، ورقمها **مشفّر** مع آخر ٤ أرقام، و`identity_verified_at`)، والمدينة. وموظفين المنشأة (مدير أو موظف، فعّال أو موقوف). الفرد ما له موظفين |
| `requests` | طلبات المصانع: المدينة، والمنطقة (تظهر للمزوّد)، والموقع بالضبط (بعد القبول بس)، والحالة، و`expires_at` |
| `account_deletion_requests` | طلبات حذف الحساب من «حسابي»، وسبب الرفض (`handled_note`). التنفيذ (`016`) يخلّي `users.phone` فاضي و`status='deleted'`، ويمسح اسم صاحب المزوّد وهويته، وملف الهوية (`provider_documents.purged_at`) (القرار ٣٩ و٥٣) |
| `cities`, `provider_cities`, `staff_cities` | المدن (البداية سدير)، ومدن كل مزوّد، وحصر الموظف بمدن (فاضي = كل المدن) |
| `settings` | إعدادات المنصة (صلاحية العرض، ومدة الطلب، وأقصى عروض، وسياسة الإلغاء...). القيم الافتراضية والتحقق في `packages/shared/src/settings.ts` |
| `offers`, `offer_revisions` | العروض (سعر المزوّد **بالهللة قبل الضريبة**، والمدة، والصلاحية، والحالة)، ونسخها القديمة. عرض فعّال واحد لكل مزوّد على الطلب (فهرس فريد) |
| `orders` | الطلب المنفّذ بعد القبول: السعر المتفق عليه، والأوقات، ونسخة من سياسة الإلغاء وقت القبول، وموعد التأكيد التلقائي (ينحفظ وقت «تم التنفيذ»)، ومين أكّد (المصنع أو النظام). واحد شغّال بس لكل طلب |
| `order_events` | الخط الزمني لكل طلب. **إضافة فقط** مثل `audit_log` |
| `order_photos` | صور البدء والانتهاء في التخزين الخاص (النوع من المحتوى، وحتى ٣ لكل مرحلة) |
| `price_changes` | طلبات تعديل السعر: السعر القديم والجديد بالهللة، والسبب، والقرار. واحد ينتظر بالكثير لكل طلب منفّذ |
| `cancellations` | كل إلغاء أو اعتذار بعد القبول: النوع (قبل البدء، أو طلب إلغاء بعد البدء، أو اعتذار مزوّد)، والحالة، والسبب، ومهلة الرد، و**الرسوم بالهللة وتوزيعها** (المجموع مضبوط بقيد في القاعدة). طلب إلغاء واحد ينتظر بالكثير لكل طلب منفّذ |
| `disputes` | البلاغ: رقم قصير يشوفه المصنع، ومين فتحه (المصنع أو المزوّد أو النظام)، والسبب، والحالة قبله، وقرار خدمة العملاء. بلاغ مفتوح واحد بالكثير لكل طلب منفّذ |
| `ratings` | تقييم المصنع للمزوّد بعد الاكتمال: النجوم ١ إلى ٥، وتقييم واحد بالكثير لكل طلب منفّذ (القاعدة تضمنه). خانة التعليق موجودة وقيد في القاعدة يخليها فاضية لين يقرر المالك والمحامي |
| `dispute_notes` | ملاحظات البلاغ من الطرفين وخدمة العملاء (منها الداخلية للإدارة بس). **إضافة فقط** |
| `approvals_internal` | ترشيح موظف المصنع لعرض، وقرار المدير |
| `idempotency_keys` | ردود العمليات اللي انرسلت بمفتاح عملية، عشان الضغطة المكررة ما تتكرر |
| `product_categories` | تصنيفات المنتجات (٨ مقترحة، تتعدّل من اللوحة لاحقًا) |
| `subscription_plans`, `subscriptions`, `subscription_payments` | الباقات (السعر بالهللة وحد المنتجات)، وفترات الاشتراك (تجريبي أو مدفوع، عام للمصنع والمزوّد)، والدفعات اليدوية (**إضافة فقط**) |
| `sellers`, `seller_documents` | المصنع البائع وحالة توثيقه، وسجله التجاري في التخزين الخاص |
| `products`, `product_images` | المنتجات (سعر معلن بشرائح، أو «اطلب سعر»، وفعّال أو مخفي أو مشال من الإدارة مع السبب)، وصورها |
| `purchase_requests`, `purchase_quotes`, `seller_ratings` | طلبات الشراء وحالتها، وردود المصنع (رد فعّال واحد، والقديم «superseded»)، وتقييم البائع بالنجوم. المشتري واحد بالضبط: `buyer_factory_id` (عميل) أو `buyer_provider_id` (مزوّد، القرار ٥٧) |
| `order_messages`, `order_message_reads` | غرفة الصفقة: الرسائل **مشفّرة** و**إضافة فقط**، وآخر رسالة قرأها كل مستخدم |
| `notifications`, `notification_prefs`, `push_tokens` | التنبيهات (الحدث، وبياناته، وحالة كل قناة، والمحاولات، ومنع التكرار)، وتفضيلات كل مستخدم، ورموز أجهزته |
| `staff` | موظفين الإدارة ودورهم وهل هم فعّالين. مالك واحد فعّال (فهرس فريد) |
| `providers` | المزوّد: الاسم، ورقم الهوية **مشفّر** مع آخر ٤ أرقام، والسجل، والأقسام، والحالة |
| `provider_documents` | المستندات: النوع، ومكان الملف في التخزين الخاص، والنوع الفعلي، وتاريخ الانتهاء، والحالة، وقائمة التحقق، وسبب الرفض |
| `audit_log` | سجل الإجراءات. **إضافة فقط:** trigger في القاعدة يمنع UPDATE وDELETE وTRUNCATE |

**الانتقال لقاعدة جديدة:** ملف جديد في `apps/api/migrations/` باسم بالترتيب (`002_...sql`)، ويتطبّق تلقائيًا عند تشغيل الخادم أو بالأمر `pnpm api:migrate`. ممنوع تعدّل ملف migration انطبق قبل.

## ملاحظات تقنية

- **الأيقونات:** نستورد كل أيقونة لحالها من `src/components/icons.ts`. `metro.config.js` يحوّل `@tabler/icons-react-native/icons/IconX` لملف الأيقونة نفسه. بدون هذا كانت المكتبة كاملة (آلاف الأيقونات) تنضم للموقع وحجمه يصير ٧ ميجا بدل ٢٫٤.
- **تقسيم الصفحات:** `asyncRoutes` مقفل في `app.json`، فالموقع ملف JavaScript واحد. هذا أبسط للنشر في هذي المرحلة.
- **pnpm بإعداد `node-linker=hoisted`** (في `.npmrc`): React Native يحتاج الحزم مسطّحة في `node_modules`.
