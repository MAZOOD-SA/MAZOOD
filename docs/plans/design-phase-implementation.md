# مرحلة التصميم (و): خطة التنفيذ

> **للمنفّذ (إنسان أو Claude):** نفّذ المهام بالترتيب، وكل مهمة تنتهي باختبار وcommit. الخطوات بصيغة `- [ ]` عشان تتعلّم.

**الهدف:** رأس رئيسية فاتح بتدرّج متحرّك، وقائمة جانبية مليانة بشي مفيد، وألوان للأقسام، وصفحة «مساعدة».

**الطريقة:**
- الألوان الجديدة تنضاف لـ`brand/tokens.json` و`tokens.css`، وتنولّد للتطبيق بـ`pnpm tokens`.
- المنطق اللي يقرر وش يطلع (خطوتك الجاية، والأسئلة الشائعة لكل نوع، ولون كل قسم) دوال صافية في `src/lib` و`src/data`، مع اختبارات vitest.
- الشاشات تستخدم هذي الدوال.

**التقنيات:** Expo 58، وReact Native 0.88، و`react-native-svg` (موجودة) للتدرّج، و`Animated` من React Native للحركة. **بدون أي مكتبة جديدة.**

**المرجع:** [`docs/plans/design-phase.md`](design-phase.md) (وافق عليه المالك في 23 نوفمبر 2026). وزاد عليه المالك: **التدرّج في الرأس يتحرّك**.

## قيود عامة

- أي لون من التوكنز بس (`pnpm check:colors` يفشل غير كذا).
- زر كهرماني واحد في كل شاشة. «طلب جديد» في القائمة الجانبية يبقى `secondary`، والكهرماني هو «اطلب عرض» في الرئيسية (التعليق الموجود في `apps/app/app/_layout.tsx`).
- كل نص جديد بالعربي والإنجليزي في `apps/app/src/i18n/strings.ts`، وبنبرة `brand/BRAND.md`.
- الحركة تقف كاملة لو الجوال مفعّل فيه «تقليل الحركة» (`useReducedMotion()` في `src/components/flow.tsx`).
- لا تلمس ملفات الشعار، ولا منطق الخادم.
- الأمر اللي يفحص كل شي: `pnpm test`. يحتاج `pnpm install` أول مرة.

## وين ممكن يطيح (يتغطّى باختبار في المهمة المذكورة)

1. **قسم جديد يتضاف بدون لون:** القائمة تنكسر. الاختبار يمر على `CATEGORIES` كلها ويتأكد إن لكل قسم توكنين (المهمة ١ والمهمة ٢).
2. **مزوّد عنده مستند منتهي، وطلبات جديدة بنفس الوقت:** المستند المنتهي أهم، لأنه يوقفه عن العروض (المهمة ٤).
3. **عدد كبير، مثل ١٢٠ عرض:** الرقم يطلع بالأرقام العربية بدون ما يكسر البطاقة. نتأكد منه في الفحص (المهمة ٧).
4. **الواجهة الإنجليزية:** الأسئلة الشائعة لازم يكون لها نص إنجليزي، مو فاضي (المهمة ٥).
5. **عميل ما كمّل بياناته:** «خطوتك الجاية» تقول «كمّل بياناتك» قبل أي شي (المهمة ٤).

---

### المهمة ١: توكنز ألوان الأقسام

**الملفات:**
- تعديل: `brand/tokens.json`، و`brand/tokens.css` (الفاتح، وكتلتا الداكن الاثنتين)، و`brand/BRAND.md` (قاعدة الأيقونات وجدول الألوان)
- إنشاء: `packages/brand/scripts/category-contrast.test.mjs`
- مولّد: `packages/brand/src/tokens.generated.ts` (بالأمر `pnpm tokens`)

**المخرجات:**
- ١٤ توكن: `cat-<id>` و`cat-<id>-soft`.
- قيمة `<id>` هي `CategoryId` نفسه: `transport`، `maintenance`، `materials`، `security`، `cleaning`، `customs`، `pest_control`.
- بعد التوليد تصير في التطبيق باسم camelCase: `colors.light.catTransport` و`catTransportSoft`، … و`catPest_control` و`catPest_controlSoft`.
- القيم من جدول القسم ٣ في `design-phase.md`، بالترتيب نفسه:
  - `transport`: الأزرق.
  - `maintenance`: البنفسجي.
  - `materials`: البني.
  - `security`: الفيروزي.
  - `cleaning`: الوردي.
  - `customs`: النيلي.
  - `pest_control`: الزيتي.

- [ ] **الخطوة ١: الاختبار (يفشل).** في `category-contrast.test.mjs`:
  - يقرأ `brand/tokens.json` ويستخدم `resolveColors()` من `build-tokens.mjs`.
  - لكل id من السبعة، ولكل وضع (`light` و`dark`): `contrast(cat-<id>, cat-<id>-soft) >= 3`، و`contrast(cat-<id>, surface) >= 3`.
  - دالة `contrast(hexA, hexB)` داخل ملف الاختبار، بصيغة WCAG للإضاءة النسبية.
- [ ] **الخطوة ٢:** `pnpm vitest run packages/brand`. المتوقع: يفشل بـ«توكن غير موجود: cat-transport».
- [ ] **الخطوة ٣:** أضف التوكنز.
  - في `tokens.json`: `value: { light, dark }`، ومع كل توكن `usage` يقول: «لون قسم … للأيقونة بس، ما يعني حالة».
  - في `tokens.css`: القيم نفسها.
  - في `BRAND.md`: القاعدة تصير «الأيقونات بالكحلي، ما عدا أيقونات الأقسام: لكل قسم لونه من `cat-*`، فوق دائرة `cat-*-soft`».
- [ ] **الخطوة ٤:** `pnpm tokens && pnpm vitest run packages/brand`. المتوقع: يمر.
- [ ] **الخطوة ٥:** commit: «ألوان الأقسام السبعة في التوكنز، وتعديل قاعدة الأيقونات في دليل الهوية».

### المهمة ٢: لون القسم في المربعات وبطاقة الطلب

**الملفات:**
- تعديل: `apps/app/src/data/categories.ts`، و`apps/app/src/components/domain.tsx` (`CategoryTile` و`RequestCard`)
- إنشاء: `apps/app/src/components/CategoryIcon.tsx`
- اختبار: `apps/app/src/lib/lib.test.ts` (أضف `describe`)

**المدخلات:** `Palette` و`ColorName` من `@mazood/brand`.

**المخرجات:**
- `categoryColorKeys(id: CategoryId): { fg: ColorName; soft: ColorName }` في `categories.ts`.
- `<CategoryIcon category={Category} size={number} />`: دائرة `soft` قطرها `size`، وفيها الأيقونة بلون `fg` وحجمها نص القطر تقريبًا.

- [ ] **الخطوة ١: الاختبار.** لكل `c` في `CATEGORIES`:
  - `categoryColorKeys(c.id).fg` و`.soft` موجودين في `colors.light` و`colors.dark`.
  - و`fg !== soft`.
- [ ] **الخطوة ٢:** `pnpm vitest run apps/app/src/lib`. المتوقع: يفشل لأن الدالة مو موجودة.
- [ ] **الخطوة ٣:** نفّذ `categoryColorKeys` (تحويل `cat-${id}` لـcamelCase)، و`CategoryIcon`.
  - في `CategoryTile` (الوضعين): بدل الأيقونة الكحلية، `<CategoryIcon size={compact ? 36 : 44} />`.
  - في `RequestCard`: `<CategoryIcon size={36} />` بدل الأيقونة الرمادية.
- [ ] **الخطوة ٤:** `pnpm test`. المتوقع: كله يمر.
- [ ] **الخطوة ٥:** commit.

### المهمة ٣: رأس الرئيسية الفاتح بتدرّج متحرّك

**الملفات:**
- إنشاء: `apps/app/src/components/HeroGradient.tsx`
- تعديل: `apps/app/app/(tabs)/home.tsx`، وأول ٦٥ سطر فيه (الرأس الكحلي)

**المخرجات:** `<HeroGradient>{children}</HeroGradient>`:

- **الخلفية:** تدرّج SVG (`LinearGradient` من `react-native-svg`) بثلاث نقاط: `surfaceAlt`، ثم `accentSoft` بشفافية ٠٫٣٥، ثم `surface`. الشفافية تنحط بـ`stopOpacity`، مو بلون مكتوب.
- **الحركة:** طبقة التدرّج أعرض من الرأس بمرّتين، وتتحرّك يمين ويسار بـ`Animated.loop`. الدورة ١٢ ثانية رايح وجاي، و`easing` من نوع `inOut(sin)`، و`useNativeDriver: true`.
- **تقليل الحركة:** لو `useReducedMotion()` صحيح، التدرّج ثابت بدون loop.
- **الوضع الداكن:** نفس النقاط من الـpalette الداكنة، فيتبدّل تلقائيًا.
- **محتوى الرأس:**
  - الشعار واسم التطبيق والجرس، وكلها بـ`colors.ink` بدل `header.concrete`.
  - تحتها التحية، ثم «وش تحتاج اليوم؟» بـ`ink`، ثم زر «اطلب عرض» `accent` كما هو.
  - احذف `header.navy` من الرئيسية.

- [ ] **الخطوة ١:** نفّذ `HeroGradient` واستبدل الرأس.
- [ ] **الخطوة ٢:** `pnpm typecheck && pnpm check:colors`. المتوقع: يمر.
- [ ] **الخطوة ٣: شوف بعينك.**
  - `pnpm build:web && node scripts/screens.mjs screens`.
  - صورة الرئيسية بالمقاسات الثلاثة: الرأس فاتح، والزر الكهرماني واحد، وما فيه تمرير أفقي. والسكربت يفحص الأخيرين لحاله.
  - شوف الداكن كمان.
- [ ] **الخطوة ٤:** commit.

### المهمة ٤: القائمة الجانبية: «خطوتك الجاية» والأقسام والأدوات

**الملفات:**
- إنشاء: `apps/app/src/lib/next-step.ts`، و`apps/app/src/lib/next-step.test.ts`
- تعديل: `apps/app/src/components/nav.tsx`، و`apps/app/app/_layout.tsx`، و`apps/app/app/provider/(tabs)/requests.tsx` (تقرأ `category` من الرابط)، و`strings.ts`

**المخرجات:**

```ts
export type NextStepInput = {
  role: "factory" | "provider" | "staff" | null;
  profileComplete: boolean;                 // للعميل
  newOffers: number;                        // عروض ما انفتحت + رسائل ما انقرت (العميل)
  newRequests: number;                      // طلبات مفتوحة في أقسام المزوّد
  expiring: { docType: string; expiresOn: string; expired: boolean }[];
  today: string;                            // ISO date
};
export type NextStep =
  | { kind: "completeProfile"; href: "/factory-profile" }
  | { kind: "offers"; count: number; href: "/requests" }
  | { kind: "docExpired"; docType: string; href: "/provider/account" }
  | { kind: "docExpiring"; docType: string; daysLeft: number; href: "/provider/account" }
  | { kind: "newRequests"; count: number; href: "/provider/requests" };
export function nextStep(i: NextStepInput): NextStep | null;
```

**الأولوية:**
- العميل: `completeProfile` ثم `offers`.
- المزوّد: `docExpired` ثم `docExpiring` (خلال ٣٠ يوم) ثم `newRequests`.
- الإدارة أو ما فيه شي: `null`.

- [ ] **الخطوة ١: الاختبارات.** في `next-step.test.ts`:
  - عميل بياناته ناقصة، وعنده ٣ عروض: النتيجة `completeProfile`.
  - عميل كامل، وعنده ٣ عروض: النتيجة `{kind:"offers",count:3}`.
  - عميل كامل، وصفر عروض: النتيجة `null`.
  - مزوّد عنده مستند منتهي، و٥ طلبات: النتيجة `docExpired`.
  - مزوّد عنده مستند ينتهي بعد ٢٠ يوم من `today`: النتيجة `{kind:"docExpiring",daysLeft:20}`.
  - مزوّد عنده مستند ينتهي بعد ٤٠ يوم، وطلبين: النتيجة `{kind:"newRequests",count:2}`.
  - موظف: النتيجة `null`.
- [ ] **الخطوة ٢:** `pnpm vitest run apps/app/src/lib/next-step.test.ts`. المتوقع: يفشل.
- [ ] **الخطوة ٣:** نفّذ `nextStep`، والأيام بفرق التاريخين مقرّب لتحت.
- [ ] **الخطوة ٤:** نفس الأمر. المتوقع: يمر.
- [ ] **الخطوة ٥: القائمة.** في `Sidebar` أضف props اختيارية، بالترتيب: الشعار، ثم الإجراء، ثم بطاقة الخطوة، ثم الروابط، ثم الأقسام، ثم التذييل:

| الإضافة | وش هي |
| --- | --- |
| `next?: NextStep \| null` | بطاقة بخلفية `accentSoft` ونص `onAccentSoft`، وأيقونة جرس، وسهم. والضغط يروح لـ`href` |
| `categories?: { category: Category; onPress: () => void }[]` | عنوان «الأقسام»، وتحته صف لكل قسم: `CategoryIcon` بحجم ٢٦ مع الاسم، وارتفاع ٣٦ |
| `tools?: ReactNode` | «مساعدة»، وزرّين صغار للغة (`setLocale`) والوضع (`setMode`) |

  وفي `_layout.tsx`:
  - **العميل:** يمرّر السبعة، والضغط يفتح `/request/new?category=<id>`.
  - **المزوّد:** أقسامه بس (`provider.categories`)، والضغط يفتح `/provider/requests?category=<id>`.
  - **بيانات المزوّد:** `Shell` يجيب `/v1/provider/me` و`/v1/provider/requests` بـ`authed` لما يكون الدور مزوّد، ويعيد الجلب لما يتغيّر `usePathname()`. **بدون `useFocusEffect`**، لأن `Shell` برا الـStack.
  - **الإدارة:** `tools` بس.
  - **`requests.tsx`:** القيمة الأولى لـ`category` من `useLocalSearchParams()`.
- [ ] **الخطوة ٦:** `pnpm test`. ثم صور الكمبيوتر والتابلت (عميل، ومزوّد، وإدارة) بالفاتح والداكن، وبالإنجليزي.
- [ ] **الخطوة ٧:** commit.

### المهمة ٥: صفحة «مساعدة»

**الملفات:**
- إنشاء: `apps/app/src/data/faq.ts`، و`apps/app/app/help.tsx`
- تعديل: `nav.tsx` (رابط «مساعدة» في `tools`)، و`(tabs)/account.tsx` و`provider/(tabs)/account` (صف «مساعدة» في الجوال)، و`strings.ts`
- اختبار: `apps/app/src/lib/lib.test.ts`

**المخرجات:** `FAQ: Record<"factory" | "provider", { q: Localized; a: Localized }[]>`، و`faqFor(role)`:
- `factory` يرجّع أسئلة العميل.
- `provider` يرجّع أسئلة المزوّد.
- `staff` يرجّع القائمتين.

**المحتوى:** من `docs/admin/faq.md`، ٤ إلى ٦ أسئلة لكل نوع، بنفس الردود المعتمدة وبترجمتها الإنجليزية. **وانقل السؤال اللي فيه «(حاليًا)» كما هو.**

- [ ] **الخطوة ١: الاختبار.** لكل نوع:
  - 4 أسئلة أو أكثر.
  - كل `q.ar` و`q.en` و`a.ar` و`a.en` مو فاضية.
  - ما فيه سؤالين بنفس النص.
- [ ] **الخطوة ٢:** شغّله وتأكد إنه يفشل، ثم نفّذ، ثم شغّله وتأكد إنه يمر.
- [ ] **الخطوة ٣: الصفحة.**
  - عنوان «مساعدة».
  - قائمة أسئلة تنفتح وتنطوي. كل سؤال `Pressable` فيه `accessibilityState.expanded`.
  - تحتها بطاقة «ما لقيت جوابك؟» مع طريقة التواصل الموجودة في التطبيق. **لا تخترع رقم أو إيميل.** إذا ما فيه، اكتب «تواصل معنا من صفحة الطلب».
- [ ] **الخطوة ٤:** `pnpm test`، ثم صورة الصفحة. ثم commit.

### المهمة ٦: «طلباتي» الفاضية

**الملفات:** `apps/app/app/(tabs)/home.tsx` و`(tabs)/requests.tsx`، و`strings.ts`

- [ ] **الخطوة ١:** بدل نص `noRequests`، بطاقة فيها:
  - أيقونة.
  - «ما رفعت أي طلب بعد».
  - سطر يشرح: «اختر القسم، واكتب وش تحتاج، وتوصلك عروض المزوّدين الموثّقين».
  - زر `secondary` اسمه «اطلب عرض» يفتح `/request/new`. **مو كهرماني**، لأن الكهرماني موجود فوق.
- [ ] **الخطوة ٢:** `pnpm test`، ثم صورة الحالة الفاضية. ثم commit.

### المهمة ٧: الفحص

- [ ] **`break-ui`:**
  - اسم منشأة بـ٦٠ حرف.
  - «Al-Sharq Industrial Co. مصنع الشرق».
  - ١٢٠ عرض.
  - مستند ينتهي اليوم.
  - الواجهة الإنجليزية.
  
  صلّح أي قص أو تداخل.
- [ ] **`design:accessibility-review`:**
  - التباين في الفاتح والداكن.
  - أحجام اللمس ٤٤ أو أكثر.
  - `accessibilityRole` و`accessibilityLabel` لكل زر جديد.
- [ ] **الفحص النهائي:** `pnpm test` كامل، و`node scripts/screens.mjs` بدون أخطاء.
- [ ] **التوثيق:**
  - `PLAN.md`: وش تم.
  - `docs/decisions.md`: قرار ألوان الأقسام والتدرّج المتحرّك.
  - `docs/admin/admin-guide.md`: صورة القائمة الجديدة.
  - `docs/design/inspiration.md`: الحالة «مطبّقة».
  
  ثم commit.

### المهمة ٨: الحركة

- [ ] `find-animation-opportunities` على الشاشات اللي تغيّرت، وننفّذ بس اللي يوافق عليه التقرير، بـ`animate-expo`:
  - انطواء أسئلة المساعدة.
  - ظهور بطاقة «خطوتك الجاية».
- [ ] كل حركة بين ١٥٠ و٢٥٠ مللي ثانية، وتقف مع «تقليل الحركة». ثم `pnpm test` وcommit.

بعد المهمة ٨: أوقف، وأعرض على المالك الصور وكيف يجرّب.
