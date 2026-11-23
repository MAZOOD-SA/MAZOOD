// غرفة الصفقة (القرار ٣٥ والقرار ٥٠): المحادثة بين العميل والمزوّد بعد القبول، داخل صفحة الطلب نفسها.
// نفس المكوّن للطرفين: path = مسار المحادثة (العميل: /v1/requests/:id/messages، المزوّد: /v1/provider/jobs/:orderId/messages).
// تتحدّث كل MESSAGE_POLL_SECONDS ثانية والصفحة مفتوحة (بدون اتصال دائم: أرخص وأبسط).
// زر «أرسل» عادي مو كهرماني، لأن الكهرماني واحد في الشاشة وهو الخطوة الجاية في الطلب.
import { radius, spacing } from "@mazood/brand";
import { MESSAGE_MAX_CHARS, MESSAGE_POLL_SECONDS, containsContactInfo, type ChatItem, type ChatSystemEvent, type ChatView } from "@mazood/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { Field } from "@/components/Field";
import { IconAlertTriangle, IconLock, IconMessage, IconSend } from "@/components/icons";
import { AppText, Button, Card, Notice, Row } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";
import { useTheme } from "@/theme/ThemeProvider";

const EVENT_TEXT: Record<ChatSystemEvent, StringKey> = {
  accepted: "chatEvAccepted",
  started: "chatEvStarted",
  delivered: "chatEvDelivered",
  confirmed: "chatEvConfirmed",
  auto_confirmed: "chatEvConfirmed",
  cancelled: "chatEvCancelled",
  dispute_opened: "chatEvDispute",
  dispute_resolved: "chatEvDisputeResolved",
};

export function DealRoom({ path, viewer, onRead }: { path: string; viewer: "customer" | "provider"; onRead?: () => void }) {
  const { t, relative } = useI18n();
  const { colors } = useTheme();
  const { authed } = useStore();
  const [chat, setChat] = useState<ChatView | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSeq = useRef(0);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  const apply = useCallback((v: ChatView) => {
    setChat(v);
    // وصل جديد: صفحة الطلب تحدّث رقم «غير مقروء» (الخادم سجّل «قرأت» مع التحميل).
    if (v.lastSeq !== lastSeq.current) {
      lastSeq.current = v.lastSeq;
      onReadRef.current?.();
    }
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await authed<ChatView>(path));
    } catch {
      // التحديث الدوري يعيد المحاولة بعد شوي. ما نغطي المحادثة برسالة خطأ لو انقطع الاتصال لحظة.
    }
  }, [authed, path, apply]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, MESSAGE_POLL_SECONDS * 1000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      apply(await authed<ChatView>(path, { method: "POST", body: { body } }));
      setText("");
    } catch (e) {
      setError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    } finally {
      setBusy(false);
    }
  };

  const hasContact = containsContactInfo(text);
  const otherLabel = viewer === "customer" ? t("chatFromProvider") : t("chatFromCustomer");

  return (
    <Card style={{ gap: spacing["3"] }}>
      <Row style={{ gap: spacing["2"] }}>
        <IconMessage size={20} color={colors.ink} />
        <AppText variant="label">{t("chatTitle")}</AppText>
      </Row>

      {chat && chat.items.filter((i) => i.kind === "message").length === 0 && (
        <AppText variant="bodySm" color="inkMuted">
          {chat.writable ? (viewer === "customer" ? t("chatEmptyCustomer") : t("chatEmptyProvider")) : t("chatEmptyClosed")}
        </AppText>
      )}

      <View style={{ gap: spacing["2"] }} accessibilityRole="list">
        {chat?.items.map((item) => <ChatLine key={item.id} item={item} otherLabel={otherLabel} relative={relative} t={t} />)}
      </View>

      {chat?.writable ? (
        <View style={{ gap: spacing["2"] }}>
          <Field
            label={t("chatInputLabel")}
            placeholder={t("chatPlaceholder")}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={MESSAGE_MAX_CHARS}
            error={error}
          />
          {hasContact && <Notice icon={IconAlertTriangle} text={t("chatNoContact")} />}
          <Row style={{ justifyContent: "flex-end" }}>
            <Button label={t("chatSend")} icon={IconSend} variant="primary" loading={busy} disabled={!text.trim() || hasContact} onPress={send} />
          </Row>
        </View>
      ) : chat ? (
        <Row style={{ gap: spacing["2"] }}>
          <IconLock size={16} color={colors.inkMuted} />
          <AppText variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
            {chat.closedReason === "completed" ? t("chatClosedCompleted") : t("chatClosedCancelled")}
          </AppText>
        </Row>
      ) : null}
    </Card>
  );
}

function ChatLine({
  item,
  otherLabel,
  relative,
  t,
}: {
  item: ChatItem;
  otherLabel: string;
  relative: (iso: string) => string;
  t: (k: StringKey) => string;
}) {
  const { colors } = useTheme();
  if (item.kind === "event") {
    return (
      <AppText variant="caption" color="inkMuted" align="center">
        {t(EVENT_TEXT[item.event])} · {relative(item.at)}
      </AppText>
    );
  }
  // رسالتي في جهة البداية بخلفية رمادية، ورسالة الطرف الثاني في الجهة الثانية بخلفية بيضاء.
  return (
    <View
      style={{
        alignSelf: item.mine ? "flex-start" : "flex-end",
        maxWidth: "85%",
        backgroundColor: item.mine ? colors.concrete : colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.md,
        paddingHorizontal: spacing["3"],
        paddingVertical: spacing["2"],
        gap: spacing["1"],
      }}
    >
      <AppText variant="caption" color="inkMuted">
        {item.mine ? t("chatMe") : otherLabel} · {relative(item.at)}
      </AppText>
      <AppText variant="body" selectable>
        {item.body}
      </AppText>
    </View>
  );
}
