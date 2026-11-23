# الرخص

كل مكتبة وخط وأيقونة في المشروع، ورخصتها. **كلها تسمح بالاستخدام التجاري.**
أي مكتبة جديدة تُضاف هنا قبل ما تُدمج. ممنوع أي مكتبة رخصتها ما تسمح بالاستخدام التجاري (مثل GPL للتطبيقات المغلقة، أو «للاستخدام الشخصي فقط»).

**آخر تحديث:** 20 نوفمبر 2026

## الخط والأيقونات

| العنصر | الإصدار | الرخصة | ملاحظة |
| --- | --- | --- | --- |
| IBM Plex Sans Arabic (الخط) | — | SIL Open Font License 1.1 | مجاني للاستخدام التجاري، والاسم «Plex» محفوظ لـ IBM |
| @expo-google-fonts/ibm-plex-sans-arabic | 0.4.2 | MIT (الكود) + OFL-1.1 (الخط) | |
| @tabler/icons-react-native | 3.19.0 | MIT | |

## مكتبات التطبيق

| المكتبة | الإصدار | الرخصة |
| --- | --- | --- |
| expo | 58.0.26 | MIT |
| expo-router | 58.0.32 | MIT |
| expo-font | 58.0.12 | MIT |
| expo-splash-screen | 58.0.14 | MIT |
| expo-status-bar | 58.0.5 | MIT |
| expo-linking | 58.0.17 | MIT |
| expo-constants | 58.0.16 | MIT |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| react-native | 0.88.1 | MIT |
| react-native-web | 0.21.4 | MIT |
| react-native-safe-area-context | 5.11.1 | MIT |
| react-native-screens | 4.30.1 | MIT |
| react-native-svg | 15.16.0 | MIT |
| @react-native-async-storage/async-storage | 2.2.0 | MIT |
| expo-secure-store (حفظ الجلسة مشفّرة على الجوال) | 58.0.3 | MIT |
| expo-document-picker (اختيار ملف المستند) | 58.0.5 | MIT |

## مكتبات الخادم (`apps/api`) والحزمة المشتركة

| المكتبة | الإصدار | الرخصة |
| --- | --- | --- |
| fastify | 5.12.8 | MIT |
| @fastify/cors | 11.4.3 | MIT |
| @fastify/rate-limit | 10.3.0 | MIT |
| @fastify/multipart (رفع الملفات) | 9.4.0 | MIT |
| @fastify/cookie (كوكي جلسة الموقع) | 11.1.5 | MIT |
| pg (اتصال PostgreSQL) | 8.23.1 | MIT |
| zod (التحقق من المدخلات) | 3.25.76 | MIT |
| @electric-sql/pglite (PostgreSQL داخل العملية، للاختبارات والتطوير) | 0.3.16 | Apache-2.0 |

## أدوات التطوير (ما تدخل في المنتج)

| الأداة | الإصدار | الرخصة |
| --- | --- | --- |
| typescript | 5.9.3 | Apache-2.0 |
| vitest | 3.2.7 | MIT |
| graphifyy (خريطة الكود، أداة Python تُثبّت على جهاز المبرمج، ما تدخل في المنصة) | 0.9.115 | Apache-2.0 |

## مهارات Claude Code (`.claude/skills/`، ما تدخل في المنتج)

تعليمات يقرأها Claude Code وقت الشغل. التفاصيل، ووش انشال منها، وكيف تتحدّث: `.claude/skills/README.md`.

| المهارة | المصدر | النسخة | الرخصة |
| --- | --- | --- | --- |
| impeccable | github.com/pbakaus/impeccable | 4.10.0 (`b49177d`) | Apache-2.0 (ومراجع iOS وAndroid مأخوذة من عمل برخصة MIT، مذكور في `NOTICE.md`) |
| animate-expo، gestures، review-animations، improve-animations، find-animation-opportunities، remove-animations، emil-design-eng، break-ui | github.com/emilkowalski/skills | `64eb3de` | MIT |
| brand-identity | github.com/fatihaydost/brand-identity-skill | `af7ba40` | MIT (وخط Instrument Sans في نماذجه برخصة OFL-1.1، مذكور في `THIRD_PARTY_NOTICES.md`) |
| caveman، ultracave | github.com/JuliusBrussee/caveman | 4.2.0 (`b89752f`) | Apache-2.0 (`LICENSE` و`NOTICE` في مجلد كل مهارة) |

**ملاحظة على `brand-identity`:** فيه مكتبة ألوان مقاسة من مواقع شركات حقيقية، وهي للمقارنة بس. الرخصة ما تعطينا أي حق في أسماء هذي الشركات أو شعاراتها أو ألوانها (`TRADEMARKS.md`). وأي خط يقترحه لازم تنفحص رخصته وتنسجل هنا قبل ما نستخدمه.

## الهوية

ملفات `brand/` (الشعار والألوان) ملك لمزوّد.
