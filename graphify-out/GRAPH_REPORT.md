# Graph Report - MAZOOD  (2026-11-22)

## Corpus Check
- 60 files · ~23,638 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 1 file(s) not represented in the graph (top: (none) 1)

## Summary
- 443 nodes · 1082 edges · 19 communities (15 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `33eea49e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ui.tsx
- app/package.json
- AppText
- مزوّد (Mazood): دليل المشروع
- I18nProvider.tsx
- build-tokens.test.mjs
- store.tsx
- خطة بناء منصة مزوّد
- expo
- مبادئ المنتج
- package.json
- tsconfig.json
- الرخص
- brand/package.json
- الخدمات الخارجية
- logo/README.md
- pnpm-workspace.yaml

## God Nodes (most connected - your core abstractions)
1. `AppText()` - 39 edges
2. `useI18n()` - 37 edges
3. `useTheme()` - 33 edges
4. `useStore()` - 24 edges
5. `react-native` - 21 edges
6. `Screen()` - 21 edges
7. `Button()` - 20 edges
8. `react` - 19 edges
9. `RequestDetails()` - 17 edges
10. `expo-router` - 16 edges

## Surprising Connections (you probably didn't know these)
- `كيف تتواصل الأجزاء` --references--> `useStore()`  [INFERRED]
  docs/architecture.md → apps/app/src/data/store.tsx
- `٥. الأرقام المشرقية في العربي، والرموز معزولة الاتجاه` --references--> `codeForDisplay()`  [INFERRED]
  docs/decisions.md → apps/app/src/lib/format.ts
- `RootLayout()` --calls--> `StoreProvider()`  [EXTRACTED]
  apps/app/app/_layout.tsx → apps/app/src/data/store.tsx
- `RootLayout()` --calls--> `I18nProvider()`  [EXTRACTED]
  apps/app/app/_layout.tsx → apps/app/src/i18n/I18nProvider.tsx
- `RootLayout()` --calls--> `ThemeProvider()`  [EXTRACTED]
  apps/app/app/_layout.tsx → apps/app/src/theme/ThemeProvider.tsx

## Import Cycles
- None detected.

## Communities (19 total, 4 thin omitted)

### Community 0 - "ui.tsx"
Cohesion: 0.09
Nodes (29): DEFAULT_LOCATION, CONTENT_MAX_WIDTH, AppTextProps, BadgeTone, ButtonProps, ButtonVariant, CATEGORIES, Category (+21 more)

### Community 1 - "app/package.json"
Cohesion: 0.05
Nodes (51): RootLayout(), Shell(), dependencies, expo@~58.0.26, expo-constants@~58.0.16, expo-font@~58.0.12, @expo-google-fonts/ibm-plex-sans-arabic@0.4.2, expo-linking@~58.0.17 (+43 more)

### Community 2 - "AppText"
Cohesion: 0.16
Nodes (41): Index(), InvoiceView(), Line(), Login(), Notifications(), InfoLine(), RequestDetails(), NewRequest() (+33 more)

### Community 3 - "مزوّد (Mazood): دليل المشروع"
Cohesion: 0.04
Nodes (42): الألوان, الأيقونات, الاسم, الخط, الشعار, الطابع العام, المسافات والزوايا, مزوّد (+34 more)

### Community 4 - "I18nProvider.tsx"
Cohesion: 0.12
Nodes (28): submit(), I18nContext, I18nProvider(), I18nValue, Localized, ar, en, StringKey (+20 more)

### Community 5 - "build-tokens.test.mjs"
Cohesion: 0.07
Nodes (26): config, { getDefaultConfig }, path, tablerIconsDir, buildTokens(), camel(), here, main() (+18 more)

### Community 6 - "store.tsx"
Cohesion: 0.15
Nodes (27): pickCategory(), submit(), categoryById(), Action, NewRequestInput, reducer(), State, initial() (+19 more)

### Community 7 - "خطة بناء منصة مزوّد"
Cohesion: 0.06
Nodes (32): 1. التقنيات المقترحة، وليش, 2. الشاشات الأساسية, 3. شكل قاعدة البيانات (مبسّط), 4. المراحل بالترتيب, 5. الأمان، والخصوصية (PDPL)، والفوترة الإلكترونية, 6. التوثيق عشان أي مبرمج يستلم بعدي, 7. لوحة الإدارة وأدوار الموظفين, 8. أسئلة لازم تجاوب عليها (+24 more)

### Community 8 - "expo"
Cohesion: 0.10
Nodes (19): package, expo, android, extra, ios, name, orientation, plugins (+11 more)

### Community 9 - "مبادئ المنتج"
Cohesion: 0.10
Nodes (18): الإلغاء بعد قبول العرض, التصميم والتسويق (قبل الإطلاق), العرض والقصة (للشريك والمستثمرين والمقابلات), المزوّد, المزوّد, المزوّد: ٦ شاشات, المصنع, المصنع (+10 more)

### Community 10 - "package.json"
Cohesion: 0.11
Nodes (19): description, devDependencies, typescript@~5.9.2, vitest@^3.2.4, engines, node, typescript, name (+11 more)

### Community 11 - "tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, strict, exclude, extends, include, expo/tsconfig.base

### Community 12 - "الرخص"
Cohesion: 0.33
Nodes (5): أدوات التطوير (ما تدخل في المنتج), الخط والأيقونات, الرخص, الهوية, مكتبات التطبيق

### Community 13 - "brand/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, types, version

### Community 15 - "الخدمات الخارجية"
Cohesion: 0.50
Nodes (3): الخدمات الخارجية, المستخدمة حاليًا, مخطط لها (تُفتح باسم الشركة، وما انفتحت للحين)

## Knowledge Gaps
- **1 isolated node(s):** `expo/tsconfig.base`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 198 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useStore()` connect `AppText` to `ui.tsx`, `مزوّد (Mazood): دليل المشروع`, `(tabs)/_layout.tsx`, `store.tsx`?**
  _High betweenness centrality (0.191) - this node is a cross-community bridge._
- **What connects `expo/tsconfig.base` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ui.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08557692307692308 - nodes in this community are weakly interconnected._
- **Why does `كيف تتواصل الأجزاء` connect `مزوّد (Mazood): دليل المشروع` to `AppText`?**
  _High betweenness centrality (0.183) - this node is a cross-community bridge._
- **Should `app/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.054426705370101594 - nodes in this community are weakly interconnected._
- **Should `مزوّد (Mazood): دليل المشروع` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._
- **Should `I18nProvider.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12100840336134454 - nodes in this community are weakly interconnected._