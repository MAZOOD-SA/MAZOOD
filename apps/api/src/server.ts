// تشغيل الخادم: pnpm api (أو pnpm --filter @mazood/api dev للتطوير).
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDb } from "./db.ts";

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const db = createDb(config.DATABASE_URL);
  const app = await buildApp({ config, db });

  const shutdown = async (signal: string) => {
    app.log.info(`إيقاف الخادم (${signal})`);
    await app.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.HOST, port: config.PORT });
}

void main();
