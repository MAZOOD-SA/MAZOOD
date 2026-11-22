import { describe, expect, it } from "vitest";
import { strings } from "@/i18n/strings";
import { deviceSizeFor } from "./device-size";
import { ADMIN_NAV, FACTORY_NAV, PROVIDER_NAV, activeKey, settingsItem } from "./nav";

describe("مقاس الشاشة", () => {
  it("جوال تحت ٧٦٨، وتابلت لين ١١٩٩، وكمبيوتر من ١٢٠٠", () => {
    expect(deviceSizeFor(390)).toBe("phone");
    expect(deviceSizeFor(767)).toBe("phone");
    expect(deviceSizeFor(768)).toBe("tablet");
    expect(deviceSizeFor(1199)).toBe("tablet");
    expect(deviceSizeFor(1200)).toBe("desktop");
    expect(deviceSizeFor(1440)).toBe("desktop");
  });
});

describe("التنقّل", () => {
  const all = [...FACTORY_NAV, ...PROVIDER_NAV, ...ADMIN_NAV, settingsItem("/settings")];

  it("كل عنصر له اسم بالعربي والإنجليزي", () => {
    for (const item of all) {
      expect(strings.ar[item.label], item.key).toBeTruthy();
      expect(strings.en[item.label], item.key).toBeTruthy();
    }
  });

  it("تبويبات المصنع خمس بالكثير (تبويبات الجوال تحت)", () => {
    expect(FACTORY_NAV.length).toBeLessThanOrEqual(5);
  });

  it("يحدد العنصر الصحيح حتى في الشاشات الفرعية", () => {
    expect(activeKey("/home", FACTORY_NAV)).toBe("home");
    expect(activeKey("/request/abc", FACTORY_NAV)).toBe("requests");
    expect(activeKey("/request/new", FACTORY_NAV)).toBe("home");
    expect(activeKey("/invoice/9", FACTORY_NAV)).toBe("invoices");
    expect(activeKey("/factory-profile", FACTORY_NAV)).toBe("account");
    expect(activeKey("/settings", FACTORY_NAV)).toBeNull();
  });

  it("الأدق يفوز في الإدارة", () => {
    expect(activeKey("/admin", ADMIN_NAV)).toBe("queue");
    expect(activeKey("/admin/staff", ADMIN_NAV)).toBe("staff");
    expect(activeKey("/admin/provider/5", ADMIN_NAV)).toBe("queue");
    expect(activeKey("/administrator", ADMIN_NAV)).toBeNull();
  });
});
