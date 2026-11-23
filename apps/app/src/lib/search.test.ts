import { describe, expect, it } from "vitest";
import { searchEntries } from "@/data/categories";
import { normalizeArabic, searchNeeds } from "./search";

describe("normalizeArabic", () => {
  it("يوحّد الهمزات والتاء المربوطة والألف المقصورة ويشيل «ال»", () => {
    expect(normalizeArabic("سطحة")).toBe(normalizeArabic("سطحه"));
    expect(normalizeArabic("إستيراد")).toBe("استيراد");
    expect(normalizeArabic("المكيفات")).toBe("مكيفات");
    expect(normalizeArabic("مُكَيِّف")).toBe("مكيف");
  });
});

describe("searchNeeds", () => {
  const entries = searchEntries();
  it("«سطحه» تلقى نوع السطحة في النقل", () => {
    expect(searchNeeds("سطحه", entries)[0]).toEqual({ categoryId: "transport", typeId: "flatbed" });
  });
  it("«مكيف» تلقى المكيفات في الصيانة", () => {
    expect(searchNeeds("مكيف", entries)[0]).toEqual({ categoryId: "maintenance", typeId: "ac" });
  });
  it("الكلمات البديلة: «ونش» تلقى المعدات الثقيلة، و«فيران» تلقى القوارض", () => {
    expect(searchNeeds("ونش", entries)[0]).toEqual({ categoryId: "transport", typeId: "heavy" });
    expect(searchNeeds("فيران", entries)[0]).toEqual({ categoryId: "pest_control", typeId: "rodents" });
  });
  it("يفهم الإنجليزي", () => {
    expect(searchNeeds("Flatbed", entries)[0]).toEqual({ categoryId: "transport", typeId: "flatbed" });
  });
  it("حرف واحد أو كلام ما له علاقة ما يرجّع شي", () => {
    expect(searchNeeds("س", entries)).toEqual([]);
    expect(searchNeeds("بيتزا", entries)).toEqual([]);
  });
});
