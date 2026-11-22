// رفع مستند واحد: اختيار الملف (PDF أو صورة، حتى ١٠ ميجا) وتاريخ انتهائه.
// الخادم يتأكد من نوع الملف من محتواه ومن الحجم والتاريخ، فالفحص هنا للراحة بس.
import { isoDateSchema, UPLOAD_MAX_BYTES, type DocType } from "@mazood/shared";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { IconFileUpload, IconPaperclip } from "@/components/icons";
import { Field } from "@/components/Field";
import { Screen } from "@/components/layout";
import { AppText, Button, Card, Notice } from "@/components/ui";
import { DOC_LABELS } from "@/data/labels";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();

export default function UploadDocument() {
  const { t, tl } = useI18n();
  const { upload } = useStore();
  const { docType } = useLocalSearchParams<{ docType: DocType }>();
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [expiresOn, setExpiresOn] = useState("");
  const [errors, setErrors] = useState<{ file?: string; date?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!docType || !DOC_LABELS[docType]) {
    return (
      <Screen title={t("uploadTitle")} back>
        <AppText color="inkMuted">{t("notFound")}</AppText>
      </Screen>
    );
  }

  async function pick() {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > UPLOAD_MAX_BYTES) return setErrors((e) => ({ ...e, file: t("errFileTooLarge") }));
    setFile(a);
    setErrors((e) => ({ ...e, file: undefined }));
  }

  async function submit() {
    if (busy) return;
    const date = toLatin(expiresOn);
    const next: typeof errors = {};
    if (!file) next.file = t("fileRequired");
    if (!isoDateSchema.safeParse(date).success) next.date = t("dateInvalid");
    setErrors(next);
    if (next.file || next.date || !file) return;

    const form = new FormData();
    form.append("docType", docType!);
    form.append("expiresOn", date);
    // الموقع يعطينا File جاهز. الجوال يعطينا رابط للملف على الجهاز.
    if (Platform.OS === "web" && file.file) form.append("file", file.file);
    else form.append("file", { uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream" } as unknown as Blob);

    setBusy(true);
    setFailure(null);
    try {
      await upload("/v1/provider/documents", form);
      router.back();
    } catch (e) {
      setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
      setBusy(false);
    }
  }

  return (
    <Screen
      title={tl(DOC_LABELS[docType])}
      back
      footer={<Button label={t("uploadDoc")} icon={IconFileUpload} variant="accent" size="lg" full onPress={submit} disabled={busy} />}
    >
      {failure && <Notice text={failure} />}
      <Card style={{ gap: 8 }}>
        <AppText variant="bodySm" color="inkMuted">
          {t("fileHint")}
        </AppText>
        <Button label={file ? file.name : t("chooseFile")} icon={IconPaperclip} variant="secondary" onPress={pick} />
        {errors.file && (
          <AppText variant="bodySm" color="danger">
            {errors.file}
          </AppText>
        )}
      </Card>
      <Field
        label={t("expiryLabel")}
        value={expiresOn}
        onChangeText={setExpiresOn}
        placeholder="2027-06-30"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        error={errors.date}
        ltr
      />
      <AppText variant="caption" color="inkMuted">
        {t("expiryHint")}
      </AppText>
    </Screen>
  );
}
