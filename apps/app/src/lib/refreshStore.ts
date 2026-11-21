// حفظ مفتاح التجديد: نسخة المتصفح.
// في المتصفح المفتاح في كوكي محمي (httpOnly) يحطه الخادم بنفسه، وJavaScript ما يقدر يقرأه أصلًا.
// فهنا ما نحفظ شي. نسخة الجوال في refreshStore.native.ts (الخزنة الآمنة).
import type { ClientKind } from "@mazood/shared";

export const clientKind: ClientKind = "web";

export async function loadRefreshToken(): Promise<string | null> {
  return null;
}

export async function saveRefreshToken(_token: string): Promise<void> {}

export async function clearRefreshToken(): Promise<void> {}
