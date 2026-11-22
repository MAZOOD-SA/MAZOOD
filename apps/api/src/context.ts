// الأشياء اللي تحتاجها كل أجزاء الخادم، مجموعة في مكان واحد.
// الاختبارات تعطي نسخ بديلة (ساعة ثابتة، وجدولة فورية، ورسائل محفوظة في الذاكرة).
import type { Config } from "./config";
import type { Db } from "./db";
import type { SmsSender } from "./sms";

export interface Clock {
  now(): Date;
}

/** تشغيل شي بعد مدة (للعروض الوهمية في وضع التجربة). */
export interface Scheduler {
  after(ms: number, task: () => Promise<void>): void;
}

export type AppContext = {
  config: Config;
  db: Db;
  sms: SmsSender;
  clock: Clock;
  scheduler: Scheduler;
};

export const systemClock: Clock = { now: () => new Date() };

export function timerScheduler(onError: (err: unknown) => void): Scheduler & { stop(): void } {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  return {
    after(ms, task) {
      const t = setTimeout(() => {
        timers.delete(t);
        task().catch(onError);
      }, ms);
      timers.add(t);
    },
    stop() {
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}
