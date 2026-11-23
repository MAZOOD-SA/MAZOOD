// صور تلقائية لكل شاشة بثلاث مقاسات (٣٩٠ و٧٦٨ و١٤٤٠)، مع فحصين لكل صورة:
//   ١. الصفحة ما فيها تمرير أفقي.
//   ٢. الزر الكهرماني واحد بالكثير (قاعدة ٣ في CLAUDE.md).
// وفحص سلوك: فلتر أقسام المزوّد يتبع الضغط على القسم في القائمة الجانبية (آخر السكربت).
// يشتغل على النسخة التجريبية (بدون خادم) بعد البناء:
//   pnpm build:web && node scripts/screens.mjs [مجلد الصور]
// يستخدم Playwright (لازم يكون مثبّت على الجهاز: npx playwright install chromium).
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";

// require بدل import: يلقى Playwright المثبّت على الجهاز حتى لو ما هو في مكتبات المشروع.
const { chromium } = createRequire(import.meta.url)("playwright");

const DIST = resolve(import.meta.dirname, "../apps/app/dist");
const OUT = resolve(process.argv[2] ?? "screens");
const WIDTHS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".ttf": "font/ttf", ".png": "image/png", ".json": "application/json" };

if (!existsSync(DIST)) {
  console.error("✗ ما فيه بناء. شغّل أول: pnpm build:web");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

// خادم صغير للملفات: أي مسار ما له ملف يرجّع index.html (التطبيق يحدد الشاشة من الرابط).
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = join(DIST, path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;

// السوق: التصفّح، وصفحة المنتج، وصفحة المصنع، وطلب شراء، و«متجري» ونموذج المنتج والرد على طلب.
const MARKET = ["/shop", "/market/mp1", "/market/seller/f2", "/purchase/new?product=mp1", "/purchase/pr2", "/store", "/seller/product?id=mp4", "/seller/purchase/pr1"];
const FACTORY = [...MARKET, "/home", "/requests", "/request/r1", "/request/r2", "/request/r3", "/request/r4", "/request/new", "/account", "/factory-profile", "/invoices", "/notifications", "/help"];
const INDIVIDUAL = ["/home", "/request/new", "/account", "/factory-profile"];
const PROVIDER = ["/provider/requests", "/provider/work", "/provider/market", "/provider/purchases", "/provider/job/d8", "/provider/request/r5", "/provider/account", "/help"];

const problems = [];
const browser = await chromium.launch();

async function shoot(page, size, route, label) {
  await page.goto(`${base}${route}`);
  await page.waitForTimeout(1200);
  const name = `${label}-${route.replace(/[\/?=]/g, "_").replace(/^_/, "") || "root"}-${size.name}`;
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  const r = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    accents: [...document.querySelectorAll('[data-accent="true"]')].filter((el) => el.getBoundingClientRect().width > 0).length,
  }));
  if (r.overflow > 1) problems.push(`${name}: تمرير أفقي ${r.overflow}px`);
  if (r.accents > 1) problems.push(`${name}: ${r.accents} أزرار كهرمانية`);
  console.log(`${r.overflow > 1 || r.accents > 1 ? "✗" : "✓"} ${name}`);
}

async function signIn(page, buttonText) {
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: buttonText }).click();
  await page.waitForTimeout(1500);
}

for (const size of WIDTHS) {
  for (const [label, button, routes, scheme] of [
    ["factory", "ادخل كمنشأة", FACTORY, "light"],
    ["individual", "ادخل كفرد", INDIVIDUAL, "light"],
    ["provider", "ادخل كمزوّد", PROVIDER, "light"],
  ]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: scheme });
    const page = await context.newPage();
    page.on("pageerror", (e) => problems.push(`${label} ${size.name}: خطأ في الصفحة: ${e.message}`));
    await shoot(page, size, "/login", label);
    await signIn(page, button);
    for (const route of routes) await shoot(page, size, route, label);
    await context.close();
  }
}

// الصفحة العامة للسوق بدون دخول.
for (const size of [WIDTHS[0], WIDTHS[2]]) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`public ${size.name}: خطأ في الصفحة: ${e.message}`));
  await shoot(page, size, "/market", "public");
  await shoot(page, size, "/market/mp1", "public");
  await context.close();
}

// الوضع الداكن والإنجليزي: عيّنة على الكمبيوتر والجوال.
for (const size of [WIDTHS[0], WIDTHS[2]]) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: "dark" });
  await context.addInitScript(() => localStorage.setItem("mazood.locale", "en"));
  const page = await context.newPage();
  await signIn(page, "Sign in as business");
  await shoot(page, size, "/request/r1", "factory-dark-en");
  await shoot(page, size, "/home", "factory-dark-en");
  await shoot(page, size, "/market/mp1", "factory-dark-en");
  await context.close();
}

// بيانات «أسوأ حالة» (src/demo/server.ts): اسم منشأة ٦٠ حرف، و١٢٠ عرض، ومستند ينتهي اليوم، واسم يخلط العربي والإنجليزي.
for (const size of [WIDTHS[0], WIDTHS[2]]) {
  for (const [data, label, button, routes] of [
    ["worst", "factory-worst", "ادخل كمنشأة", ["/home", "/requests", "/request/r1", "/help"]],
    ["worst", "provider-worst", "ادخل كمزوّد", ["/provider/requests"]],
    ["mixed", "factory-mixed", "ادخل كمنشأة", ["/home", "/account"]],
  ]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await context.newPage();
    page.on("pageerror", (e) => problems.push(`${label} ${size.name}: خطأ في الصفحة: ${e.message}`));
    await page.goto(`${base}/login?data=${data}`);
    await page.getByRole("button", { name: button }).click();
    await page.waitForTimeout(1500);
    for (const route of routes) await shoot(page, size, route, label);
    await context.close();
  }
}

// فلتر الأقسام عند المزوّد يتبع الرابط: يغيّر الفلتر بنفسه، ثم يضغط نفس القسم من القائمة الجانبية، لازم يتحدّث الفلتر.
// (خلل سابق: الضغط الثاني ما يسوي شي لأن الفلتر كان حالة محلية.) القائمة الجانبية تظهر على الكمبيوتر بس.
{
  const size = WIDTHS[2];
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`provider-filter ${size.name}: خطأ في الصفحة: ${e.message}`));
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: "ادخل كمزوّد" }).click();
  await page.waitForTimeout(1500);
  await page.goto(`${base}/provider/requests`);
  await page.waitForTimeout(1200);
  // الفلتر المختار = الـradio اللي خطه وزنه ٦٠٠ (نقرأه من الـDOM، مو من حالة التطبيق).
  // الوزن في التطبيق يجي من اسم الخط (IBMPlexSansArabic_600SemiBold) مو من font-weight.
  const selectedChips = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="radio"]')]
        .filter((el) => [el, ...el.querySelectorAll("*")].some((n) => getComputedStyle(n).fontFamily.includes("600") && n.textContent?.trim()))
        .map((el) => el.textContent?.trim()),
    );
  const CATEGORY = "نقل ومعدات";
  await page.getByRole("menuitem", { name: CATEGORY }).click();
  await page.waitForTimeout(600);
  await page.getByRole("radio", { name: "الكل" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("menuitem", { name: CATEGORY }).click();
  await page.waitForTimeout(600);
  const selected = await selectedChips();
  const ok = selected.length === 1 && selected[0] === CATEGORY;
  if (!ok) problems.push(`provider-filter ${size.name}: بعد الضغط على «${CATEGORY}» من القائمة مرتين، الفلتر المختار [${selected.join("، ")}] بدل «${CATEGORY}»`);
  console.log(`${ok ? "✓" : "✗"} provider-filter-sidebar-${size.name}`);
  await context.close();
}

await browser.close();
server.close();
if (problems.length) {
  console.error(`\n✗ ${problems.length} مشكلة:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`\n✓ كل الشاشات بدون تمرير أفقي، وزر كهرماني واحد بالكثير. الصور في ${OUT}`);
