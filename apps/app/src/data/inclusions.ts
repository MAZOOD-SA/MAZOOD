// أسماء بنود «يشمل / ما يشمل» في الواجهة (القرار ٥٧). البنود نفسها لكل قسم في packages/shared/src/offers.ts.
// **مبدئية وقابلة للتغيير (قرار المالك ٢٣ نوفمبر ٢٠٢٦).** لإضافة بند: أضفه في الملفين.
import { OFFER_INCLUSIONS, type Inclusions } from "@mazood/shared";
import type { Localized } from "@/i18n/I18nProvider";
import type { CategoryId } from "./categories";

export const INCLUSION_LABELS: Record<string, Localized> = {
  loading: { ar: "التحميل", en: "Loading" },
  unloading: { ar: "التنزيل", en: "Unloading" },
  waiting_over_2h: { ar: "الانتظار أكثر من ساعتين", en: "Waiting over 2 hours" },
  parts: { ar: "قطع الغيار والمواد", en: "Parts and materials" },
  inspection_fee: { ar: "رسوم الكشف", en: "Inspection fee" },
  warranty: { ar: "ضمان على الشغل", en: "Workmanship warranty" },
  delivery: { ar: "التوصيل للموقع", en: "Delivery to site" },
  unloading_spreading: { ar: "التفريغ والفرد", en: "Unloading and spreading" },
  installation: { ar: "التركيب", en: "Installation" },
  guard_gear: { ar: "زي الحراس ومعداتهم", en: "Guard uniforms and gear" },
  setup: { ar: "التركيب أو التجهيز", en: "Setup" },
  government_fees: { ar: "الرسوم الحكومية", en: "Government fees" },
  port_transport: { ar: "النقل من المنفذ", en: "Transport from the port" },
  pesticides: { ar: "المبيدات والمواد", en: "Pesticides and materials" },
  revisit: { ar: "زيارة إعادة لو رجعت الحشرات", en: "Return visit if pests come back" },
};

/** بنود قسم معيّن بالترتيب، مع أسمائها. */
export function inclusionItems(category: CategoryId): { id: string; label: Localized }[] {
  return (OFFER_INCLUSIONS[category] ?? []).map((id) => ({ id, label: INCLUSION_LABELS[id] ?? { ar: id, en: id } }));
}

/** بنود العرض المحفوظة للعرض: بالترتيب، ونتجاهل أي بند انشال من القائمة. */
export function inclusionRows(inclusions: Inclusions | null | undefined): { id: string; label: Localized; included: boolean }[] {
  if (!inclusions) return [];
  return Object.entries(inclusions)
    .filter(([id]) => INCLUSION_LABELS[id])
    .map(([id, v]) => ({ id, label: INCLUSION_LABELS[id], included: v === "included" }));
}
