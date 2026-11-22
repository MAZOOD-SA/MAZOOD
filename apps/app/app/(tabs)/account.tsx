// حسابي (للعميل): بيانات الحساب (منشأة أو فرد)، وموظفين المنشأة (المدير يضيف ويوقف، والفرد ما عنده موظفين)، واللغة، والمظهر، وطلب حذف الحساب، والخروج.
import { spacing } from "@mazood/brand";
import { normalizeSaudiMobile } from "@mazood/shared";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { ApiClientError, LIVE } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { DeleteAccountSection, PreferencesSection, SignOutButton } from "@/components/account";
import { Field } from "@/components/Field";
import { IconFileInvoice, IconInfoCircle, IconUsers } from "@/components/icons";
import { useSellerEnabled } from "@/components/market";
import { Screen, SectionTitle, TwoColumn } from "@/components/layout";
import { AppText, Badge, Button, Card, Chips, Divider, Notice, Row } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";

type Member = { userId: string; phone: string; role: "manager" | "member"; active: boolean; joined: boolean };

export default function Account() {
  const { t, tl, locale, digits, code } = useI18n();
  const { state, factory: FACTORY, profileComplete, factoryRole } = useStore();
  const seller = useSellerEnabled();
  const phone = state.phone ? `0${state.phone.slice(4)}` : "";

  const main = (
    <>
      <Card style={{ gap: spacing["2"] }}>
        <AppText variant="caption" color="inkMuted">
          {FACTORY.kind === "individual" ? t("customerIndividual") : FACTORY.kind === "business" ? t("customerBusiness") : t("factory")}
        </AppText>
        <AppText variant="h2">{profileComplete ? tl(FACTORY.name) : t("profileMissingName")}</AppText>
        <AppText variant="bodySm" color="inkMuted" style={{ writingDirection: "ltr", textAlign: locale === "ar" ? "right" : "left" }}>
          {digits(phone)}
        </AppText>
        <Divider />
        {FACTORY.kind === "individual" ? (
          <>
            <InfoRow label={t("idMasked")} value={code(FACTORY.idNumberMasked ?? "")} />
            <Badge
              label={t(FACTORY.identityStatus === "verified" ? "identityVerified" : "identityPending")}
              tone={FACTORY.identityStatus === "verified" ? "ok" : "muted"}
            />
            {FACTORY.identityStatus === "pending" && (
              <AppText variant="caption" color="inkMuted">
                {t("identityPendingHint")}
              </AppText>
            )}
          </>
        ) : (
          <>
            <InfoRow label={t("commercialRegister")} value={code(FACTORY.commercialRegister)} />
            <InfoRow label={t("vatNumber")} value={code(FACTORY.vatNumber)} />
          </>
        )}
      </Card>
      <Button
        label={profileComplete ? t("editProfile") : t("completeProfile")}
        variant={profileComplete ? "secondary" : "primary"}
        onPress={() => router.push("/factory-profile")}
      />
      <Button label={t("tabInvoices")} icon={IconFileInvoice} variant="secondary" onPress={() => router.push("/invoices")} />
      {FACTORY.kind === "business" && !seller && (
        // مدخل «متجري» للمنشأة اللي ما فعّلت البيع (التبويب يظهر بعد التفعيل).
        <Card onPress={() => router.push("/store")} style={{ gap: spacing["1"] }}>
          <AppText weight={700}>{t("storeEnableTitle")}</AppText>
          <AppText variant="bodySm" color="inkMuted">
            {t("storeEnableHint")}
          </AppText>
        </Card>
      )}
      {FACTORY.kind === "business" && <Members manager={factoryRole !== "member"} />}
    </>
  );

  const side = (
    <>
      <PreferencesSection />
      {!LIVE && <Notice icon={IconInfoCircle} text={t("prototypeNote")} />}
      <SignOutButton />
      <DeleteAccountSection />
    </>
  );

  return (
    <Screen title={t("accountTitle")} width="page">
      <TwoColumn main={main} side={side} />
    </Screen>
  );
}

/** موظفين المصنع: الكل يشوف القائمة، والمدير بس يضيف (برقم الجوال والدور) ويوقف (سؤال ١٦). */
function Members({ manager }: { manager: boolean }) {
  const { t, digits } = useI18n();
  const { authed, state } = useStore();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"member" | "manager">("member");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    authed<{ members: Member[] }>("/v1/factory/members")
      .then((r) => setMembers(r.members))
      .catch(() => setMembers([]));
  }, [authed]);
  useEffect(load, [load]);

  async function add() {
    const normalized = normalizeSaudiMobile(phone);
    if (!normalized) return setError(t("phoneInvalid"));
    setBusy(true);
    setError(null);
    try {
      await authed("/v1/factory/members", { method: "POST", body: { phone: normalized, role } });
      setPhone("");
      setAdding(false);
      load();
    } catch (e) {
      setError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
    setBusy(false);
  }

  async function toggle(m: Member) {
    await authed(`/v1/factory/members/${m.userId}/${m.active ? "suspend" : "activate"}`, { method: "POST" }).catch(() => {});
    load();
  }

  return (
    <View style={{ gap: spacing["3"] }}>
      <SectionTitle title={t("factoryMembers")} action={manager && !adding ? <Button label={t("addMember")} icon={IconUsers} variant="ghost" onPress={() => setAdding(true)} /> : undefined} />
      {adding && (
        <Card style={{ gap: spacing["3"] }}>
          <Field label={t("phoneLabel")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="05XXXXXXXX" error={error} onSubmitEditing={add} ltr />
          <Chips
            value={role}
            onChange={setRole}
            options={[
              { value: "member", label: t("roleMember") },
              { value: "manager", label: t("roleManager") },
            ]}
          />
          <AppText variant="caption" color="inkMuted">
            {t("memberHint")}
          </AppText>
          <Row style={{ flexWrap: "wrap" }}>
            <Button label={t("addMember")} variant="primary" loading={busy} onPress={add} />
            <Button label={t("back")} variant="ghost" onPress={() => setAdding(false)} />
          </Row>
        </Card>
      )}
      {(members ?? []).map((m) => (
        <Card key={m.userId} style={{ paddingVertical: spacing["3"] }}>
          <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <View style={{ gap: 2 }}>
              <AppText variant="bodySm" weight={600} style={{ writingDirection: "ltr", alignSelf: "flex-start" }}>
                {digits(`0${m.phone.slice(4)}`)}
              </AppText>
              <Row gap="1">
                <Badge label={t(m.role === "manager" ? "roleManager" : "roleMember")} tone="muted" />
                {!m.active && <Badge label={t("inactive")} tone="bad" />}
              </Row>
            </View>
            {manager && m.phone !== state.phone && (
              <Button label={m.active ? t("deactivate") : t("activate")} variant="ghost" tone={m.active ? "danger" : "default"} onPress={() => toggle(m)} />
            )}
          </Row>
        </Card>
      ))}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing["2"] }}>
      <AppText variant="bodySm" color="inkMuted">
        {label}
      </AppText>
      <AppText variant="bodySm" style={{ writingDirection: "ltr" }}>
        {value}
      </AppText>
    </View>
  );
}
