# حاوية واحدة فيها الخادم والموقع. تشتغل عند أي مزوّد استضافة يدعم Docker،
# ومنهم المزوّدين داخل السعودية. الخطوات في README.md (قسم النشر).
#
#   docker build -t mazood .
#   docker run -p 3000:3000 --env-file .env mazood

# ─── المرحلة ١: البناء ───────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
# الموقع (ملفات ثابتة) والخادم (ملف واحد).
RUN pnpm tokens && pnpm build:web && pnpm --filter @mazood/api build
# نشيل أدوات التطوير، ونبقي المكتبات اللي يحتاجها الخادم وقت التشغيل بس.
RUN pnpm --filter @mazood/api deploy --prod --legacy /out

# ─── المرحلة ٢: التشغيل ───────────────────────────────
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 WEB_DIST_DIR=/app/web
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/prisma.config.ts ./prisma.config.ts
COPY --from=build /repo/apps/app/dist ./web
# الخادم ما يشتغل بصلاحيات المدير (root).
USER node
EXPOSE 3000
# أول ما يشتغل: يطبّق أي ترحيلات جديدة على قاعدة البيانات، وبعدها يشغّل الخادم.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.mjs"]
