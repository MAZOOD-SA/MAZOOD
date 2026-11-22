// بطاقة مستند واحد: حالته، وتاريخ انتهائه، وسبب الرفض إن وُجد.
import { spacing } from "@mazood/brand";
import type { ReactNode } from "react";
import { View } from "react-native";
import { DOC_LABELS } from "@/data/labels";
import type { DocSlotView } from "@/data/provider-types";
import { useI18n } from "@/i18n/I18nProvider";
import { AppText, Badge, Card, Row, type BadgeTone } from "./ui";

/** تاريخ YYYY-MM-DD لصيغة يقبلها formatDate (منتصف النهار عشان ما يتغير اليوم بسبب فرق التوقيت). */
export const dayIso = (d: string) => `${d}T12:00:00Z`;

export function slotState(s: DocSlotView): { key: "approved" | "pending" | "rejected" | "missing" | "expired" | "expiring"; tone: BadgeTone } {
  if (s.expired && !s.pending) return { key: "expired", tone: "bad" };
  if (s.pending) return { key: "pending", tone: "new" };
  if (s.rejected) return { key: "rejected", tone: "bad" };
  if (s.approved && s.expiringSoon) return { key: "expiring", tone: "new" };
  if (s.approved) return { key: "approved", tone: "ok" };
  return { key: "missing", tone: "muted" };
}

const STATE_LABEL = {
  approved: { ar: "مقبول", en: "Approved" },
  pending: { ar: "تحت المراجعة", en: "Under review" },
  rejected: { ar: "مرفوض", en: "Rejected" },
  missing: { ar: "مطلوب", en: "Required" },
  expired: { ar: "منتهي", en: "Expired" },
  expiring: { ar: "ينتهي قريبًا", en: "Expiring soon" },
};

export function DocSlotCard({ slot, children }: { slot: DocSlotView; children?: ReactNode }) {
  const { tl, date, locale } = useI18n();
  const st = slotState(slot);
  const shown = slot.pending ?? slot.approved ?? slot.rejected;
  return (
    <Card style={{ gap: spacing["2"] }}>
      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
        <AppText weight={600} style={{ flex: 1 }}>
          {tl(DOC_LABELS[slot.docType])}
        </AppText>
        <Badge label={tl(STATE_LABEL[st.key])} tone={st.tone} />
      </Row>
      {shown && (
        <AppText variant="bodySm" color="inkMuted">
          {(locale === "ar" ? "ينتهي في " : "Expires ") + date(dayIso(shown.expiresOn))}
        </AppText>
      )}
      {slot.rejected && !slot.pending && slot.rejected.rejectionReason && (
        <View>
          <AppText variant="bodySm" color="danger">
            {(locale === "ar" ? "سبب الرفض: " : "Reason: ") + slot.rejected.rejectionReason}
          </AppText>
        </View>
      )}
      {children}
    </Card>
  );
}
