// اختبارات المرحلة ٣: تسجيل المزوّد، ورفع المستندات، والتوثيق، والصلاحيات، والروابط المؤقتة، وانتهاء المستندات.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createTestCtx, multipart, PDF, PNG, providerProfile, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
let factory: { token: string };
let gm: { token: string; userId: string };
let verifier: { token: string; userId: string };
let support: { token: string };
let owner: { token: string; userId: string };

beforeAll(async () => {
  ctx = await createTestCtx();
  factory = await ctx.signIn("0510000001");
  owner = await ctx.staff("0590000001", "owner");
  gm = await ctx.staff("0590000002", "general_manager");
  verifier = await ctx.staff("0590000003", "verification");
  support = await ctx.staff("0590000004", "support");
});
afterAll(async () => { await ctx.close(); });

type Inj = { method: "GET" | "POST" | "PUT"; url: string; token?: string; payload?: unknown; headers?: Record<string, string> };
const call = (o: Inj) =>
  ctx.app.inject({ method: o.method, url: o.url, payload: o.payload as never, headers: { ...(o.token ? auth(o.token) : {}), ...o.headers } });

/** اليوم في الاختبار: 2026-11-22 (ساعة الاختبار). */
const FUTURE = "2027-06-30";

async function upload(token: string, docType: string, bytes = PDF, expiresOn = FUTURE) {
  const m = multipart({ docType, expiresOn }, { bytes });
  return call({ method: "POST", url: "/v1/provider/documents", token, payload: m.payload, headers: m.headers });
}

async function newProvider(phone: string, profile: object = providerProfile) {
  const p = await ctx.signIn(phone, "provider");
  const r = await call({ method: "PUT", url: "/v1/provider/profile", token: p.token, payload: profile });
  expect(r.statusCode).toBe(200);
  return { ...p, providerId: r.json().provider.id as string };
}

async function me(token: string) {
  return (await call({ method: "GET", url: "/v1/provider/me", token })).json().provider;
}

const fullChecklist = async (docId: string) => {
  const d = await call({ method: "GET", url: `/v1/admin/providers/${(await providerOfDoc(docId))}`, token: verifier.token });
  const docType = d.json().provider.documents.find((s: { pending?: { id: string } }) => s.pending?.id === docId).docType;
  return (d.json().checklists[docType] as { id: string }[]).map((i) => i.id);
};
async function providerOfDoc(docId: string) {
  const [r] = await ctx.db.query<{ provider_id: string }>("SELECT provider_id FROM provider_documents WHERE id=$1", [docId]);
  return r.provider_id;
}
async function approve(docId: string, token = verifier.token) {
  return call({ method: "POST", url: `/v1/admin/documents/${docId}/review`, token, payload: { decision: "approve", checklist: await fullChecklist(docId) } });
}

/** مزوّد كامل: مسجّل ورفع مستنداته وأرسلها، وموثّق (إذا verify=true). */
async function verifiedProvider(phone: string, expiresOn = FUTURE) {
  const p = await newProvider(phone);
  const a = (await upload(p.token, "id_document", PDF, expiresOn)).json().documentId;
  const b = (await upload(p.token, "cr_certificate", PNG, expiresOn)).json().documentId;
  await call({ method: "POST", url: "/v1/provider/submit", token: p.token });
  expect((await approve(a)).statusCode).toBe(200);
  expect((await approve(b)).statusCode).toBe(200);
  const d = await call({ method: "POST", url: `/v1/admin/providers/${p.providerId}/decision`, token: verifier.token, payload: { decision: "verify" } });
  expect(d.statusCode).toBe(200);
  return { ...p, docIds: [a, b] };
}

describe("تسجيل المزوّد", () => {
  it("الحساب الجديد بـ as=provider يصير مزوّد، وما يوصل لمسارات المصنع", async () => {
    const p = await ctx.signIn("0520000001", "provider");
    const meRes = await call({ method: "GET", url: "/v1/me", token: p.token });
    expect(meRes.json().user.role).toBe("provider");
    expect((await call({ method: "GET", url: "/v1/requests", token: p.token })).statusCode).toBe(403);
  });

  it("الرقم المسجّل كمصنع يبقى مصنع حتى لو طلب as=provider", async () => {
    const r = await call({ method: "GET", url: "/v1/provider/me", token: factory.token });
    expect(r.statusCode).toBe(403);
  });

  it("رقم الهوية ينحفظ مشفّر، والمزوّد يشوف آخر ٤ أرقام بس", async () => {
    const p = await newProvider("0520000002");
    const [row] = await ctx.db.query<{ id_number_enc: string }>("SELECT id_number_enc FROM providers WHERE id=$1", [p.providerId]);
    expect(row.id_number_enc).not.toContain("1000000001");
    expect(row.id_number_enc.startsWith("v1.")).toBe(true);
    const view = await me(p.token);
    expect(view.idNumberMasked).toBe("******0001");
    expect(JSON.stringify(view)).not.toContain("1000000001");
  });

  it("يرفض هوية وطنية ما تبدأ بـ ١، وإقامة ما تبدأ بـ ٢، وأقسام غير موجودة", async () => {
    const p = await ctx.signIn("0520000003", "provider");
    const bad = (body: object) => call({ method: "PUT", url: "/v1/provider/profile", token: p.token, payload: { ...providerProfile, ...body } });
    expect((await bad({ idNumber: "2000000001" })).statusCode).toBe(400);
    expect((await bad({ idType: "iqama", idNumber: "1000000001" })).statusCode).toBe(400);
    expect((await bad({ categories: ["weapons"] })).statusCode).toBe(400);
    expect((await bad({ categories: [] })).statusCode).toBe(400);
  });

  it("المستندات المطلوبة تعتمد على الأقسام", async () => {
    const p = await newProvider("0520000004", { ...providerProfile, categories: ["transport", "customs"] });
    const types = (await me(p.token)).documents.map((d: { docType: string }) => d.docType);
    expect(types).toEqual(["id_document", "cr_certificate", "vehicle_registration", "transport_license", "customs_broker_license"]);
  });
});

describe("رفع المستندات", () => {
  let p: { token: string; providerId: string };
  beforeAll(async () => { p = await newProvider("0530000001"); });

  it("يقبل PDF وصورة، وما يرجّع مكان الملف في التخزين", async () => {
    const r = await upload(p.token, "id_document");
    expect(r.statusCode).toBe(201);
    expect(r.body).not.toContain("storage");
  });

  it("يرفض ملف محتواه مو PDF أو صورة حتى لو اسمه .pdf", async () => {
    const m = multipart({ docType: "id_document", expiresOn: FUTURE }, { bytes: Buffer.from("<script>alert(1)</script>"), name: "x.pdf" });
    const r = await call({ method: "POST", url: "/v1/provider/documents", token: p.token, payload: m.payload, headers: m.headers });
    expect(r.statusCode).toBe(415);
  });

  it("يرفض مستند منتهي، أو تاريخ غير صحيح، أو نوع ما يخص أقسامه، أو بدون ملف", async () => {
    expect((await upload(p.token, "id_document", PDF, "2020-01-01")).statusCode).toBe(400);
    expect((await upload(p.token, "id_document", PDF, "2027-02-30")).statusCode).toBe(400);
    expect((await upload(p.token, "vehicle_registration")).statusCode).toBe(400);
    const m = multipart({ docType: "id_document", expiresOn: FUTURE });
    expect((await call({ method: "POST", url: "/v1/provider/documents", token: p.token, payload: m.payload, headers: m.headers })).statusCode).toBe(400);
  });

  it("يرفض ملف أكبر من ١٠ ميجا", async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 + 10)]);
    expect((await upload(p.token, "cr_certificate", big)).statusCode).toBe(413);
  });

  it("ما يقدر يرسل للتوثيق قبل ما يرفع كل المستندات، وبعدها تنقفل بياناته", async () => {
    expect((await call({ method: "POST", url: "/v1/provider/submit", token: p.token })).json().error.code).toBe("documents_missing");
    await upload(p.token, "cr_certificate");
    const r = await call({ method: "POST", url: "/v1/provider/submit", token: p.token });
    expect(r.json().provider.status).toBe("pending");
    const edit = await call({ method: "PUT", url: "/v1/provider/profile", token: p.token, payload: providerProfile });
    expect(edit.json().error.code).toBe("profile_locked");
  });
});

describe("صلاحيات لوحة الإدارة", () => {
  it("المصنع والمزوّد ما يدخلون اللوحة", async () => {
    const p = await ctx.signIn("0540000001", "provider");
    for (const t of [factory.token, p.token]) {
      expect((await call({ method: "GET", url: "/v1/admin/queue", token: t })).statusCode).toBe(403);
    }
  });

  it("خدمة العملاء تشوف المزوّدين، بس ما تراجع ولا تفتح المستندات ولا تشوف رقم الهوية", async () => {
    const p = await newProvider("0540000002");
    const docId = (await upload(p.token, "id_document")).json().documentId;
    expect((await call({ method: "GET", url: "/v1/admin/queue", token: support.token })).statusCode).toBe(403);
    expect((await call({ method: "GET", url: `/v1/admin/documents/${docId}/link`, token: support.token })).statusCode).toBe(403);
    expect((await call({ method: "POST", url: `/v1/admin/documents/${docId}/review`, token: support.token, payload: { decision: "approve", checklist: [] } })).statusCode).toBe(403);
    const view = await call({ method: "GET", url: `/v1/admin/providers/${p.providerId}`, token: support.token });
    expect(view.statusCode).toBe(200);
    expect(view.json().provider.idNumber).toBe("******0001");
  });

  it("موظف التوثيق يشوف رقم الهوية كامل، والاطلاع ينكتب في السجل", async () => {
    const p = await newProvider("0540000003");
    const view = await call({ method: "GET", url: `/v1/admin/providers/${p.providerId}`, token: verifier.token });
    expect(view.json().provider.idNumber).toBe("1000000001");
    const log = await ctx.db.query("SELECT 1 FROM audit_log WHERE action='provider.id_number_viewed' AND entity_id=$1", [p.providerId]);
    expect(log.length).toBe(1);
  });

  it("سجل الإجراءات للمالك والمدير العام بس", async () => {
    expect((await call({ method: "GET", url: "/v1/admin/audit", token: verifier.token })).statusCode).toBe(403);
    expect((await call({ method: "GET", url: "/v1/admin/audit", token: gm.token })).statusCode).toBe(200);
  });
});

describe("التوثيق", () => {
  it("القبول يتطلب التأشير على كل بنود قائمة التحقق، والرفض يتطلب سبب", async () => {
    const p = await newProvider("0550000001");
    const docId = (await upload(p.token, "id_document")).json().documentId;
    const partial = await call({ method: "POST", url: `/v1/admin/documents/${docId}/review`, token: verifier.token, payload: { decision: "approve", checklist: ["legible"] } });
    expect(partial.statusCode).toBe(400);
    expect(partial.json().error.code).toBe("checklist_incomplete");
    const noReason = await call({ method: "POST", url: `/v1/admin/documents/${docId}/review`, token: verifier.token, payload: { decision: "reject" } });
    expect(noReason.statusCode).toBe(400);
    const rej = await call({ method: "POST", url: `/v1/admin/documents/${docId}/review`, token: verifier.token, payload: { decision: "reject", reason: "الصورة غير واضحة" } });
    expect(rej.statusCode).toBe(200);
    const slot = (await me(p.token)).documents.find((d: { docType: string }) => d.docType === "id_document");
    expect(slot.rejected.rejectionReason).toBe("الصورة غير واضحة");
  });

  it("ما يتوثّق المزوّد قبل قبول كل مستنداته، وبعدها يطلع «موثّق»", async () => {
    const p = await newProvider("0550000002");
    const a = (await upload(p.token, "id_document")).json().documentId;
    const b = (await upload(p.token, "cr_certificate")).json().documentId;
    await call({ method: "POST", url: "/v1/provider/submit", token: p.token });
    const queue = (await call({ method: "GET", url: "/v1/admin/queue", token: verifier.token })).json().queue;
    expect(queue.some((q: { id: string }) => q.id === p.providerId)).toBe(true);
    await approve(a);
    const early = await call({ method: "POST", url: `/v1/admin/providers/${p.providerId}/decision`, token: verifier.token, payload: { decision: "verify" } });
    expect(early.json().error.code).toBe("documents_not_approved");
    await approve(b);
    await call({ method: "POST", url: `/v1/admin/providers/${p.providerId}/decision`, token: verifier.token, payload: { decision: "verify" } });
    const view = await me(p.token);
    expect(view.status).toBe("verified");
    expect(view.verified).toBe(true);
    const log = await ctx.db.query("SELECT actor_id FROM audit_log WHERE action='provider.verified' AND entity_id=$1", [p.providerId]);
    expect(log[0].actor_id).toBe(verifier.userId);
  });

  it("رفض المزوّد يرجّعه يعدّل ويعيد الإرسال", async () => {
    const p = await newProvider("0550000003");
    await upload(p.token, "id_document");
    await upload(p.token, "cr_certificate");
    await call({ method: "POST", url: "/v1/provider/submit", token: p.token });
    const r = await call({ method: "POST", url: `/v1/admin/providers/${p.providerId}/decision`, token: verifier.token, payload: { decision: "reject", reason: "السجل التجاري لنشاط مختلف" } });
    expect(r.statusCode).toBe(200);
    const view = await me(p.token);
    expect(view.status).toBe("rejected");
    expect(view.statusReason).toBe("السجل التجاري لنشاط مختلف");
    expect((await call({ method: "PUT", url: "/v1/provider/profile", token: p.token, payload: providerProfile })).statusCode).toBe(200);
  });
});

describe("الروابط المؤقتة للمستندات", () => {
  it("الرابط يفتح الملف، وينكتب في السجل، وينتهي بعد ٥ دقايق", async () => {
    const p = await newProvider("0560000001");
    const docId = (await upload(p.token, "id_document")).json().documentId;
    const link = (await call({ method: "GET", url: `/v1/admin/documents/${docId}/link`, token: verifier.token })).json();
    const file = await call({ method: "GET", url: link.path });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect(file.rawPayload.equals(PDF)).toBe(true);
    const log = await ctx.db.query("SELECT actor_id FROM audit_log WHERE action='document.viewed' AND entity_id=$1", [docId]);
    expect(log[0].actor_id).toBe(verifier.userId);
    ctx.clock.advance(5 * 60_000 + 1000);
    expect((await call({ method: "GET", url: link.path })).statusCode).toBe(403);
  });

  it("رابط معدّل أو بدون توقيع ما يفتح", async () => {
    const p = await newProvider("0560000002");
    const docId = (await upload(p.token, "id_document")).json().documentId;
    const link = (await call({ method: "GET", url: `/v1/admin/documents/${docId}/link`, token: verifier.token })).json();
    expect((await call({ method: "GET", url: link.path.replace(/by=[^&]+/, `by=${support}`) })).statusCode).toBe(403);
    expect((await call({ method: "GET", url: `/v1/files/${docId}` })).statusCode).toBe(403);
    expect((await call({ method: "GET", url: link.path.replace(/sig=(.)/, (_m: string, c: string) => `sig=${c === "0" ? "1" : "0"}`) })).statusCode).toBe(403);
  });

  it("لو انوقف الموظف، روابطه تبطل فورًا", async () => {
    const v2 = await ctx.staff("0590000010", "verification");
    const p = await newProvider("0560000003");
    const docId = (await upload(p.token, "id_document")).json().documentId;
    const link = (await call({ method: "GET", url: `/v1/admin/documents/${docId}/link`, token: v2.token })).json();
    await call({ method: "POST", url: `/v1/admin/staff/${v2.userId}/deactivate`, token: gm.token });
    expect((await call({ method: "GET", url: link.path })).statusCode).toBe(403);
    expect((await call({ method: "GET", url: "/v1/admin/me", token: v2.token })).statusCode).toBe(401);
  });
});

describe("انتهاء المستندات والتجديد", () => {
  it("تنبيه قبل ٣٠ يوم، وبعد الانتهاء تختفي «موثّق» تلقائيًا", async () => {
    const p = await verifiedProvider("0570000001", "2026-12-12");
    expect((await me(p.token)).verified).toBe(true);
    expect((await me(p.token)).expiring.length).toBe(2);
    const exp = (await call({ method: "GET", url: "/v1/admin/expiring", token: verifier.token })).json().expiring;
    expect(exp.some((e: { providerId: string }) => e.providerId === p.providerId)).toBe(true);
    ctx.clock.advance(25 * 24 * 3600_000);
    expect((await me(p.token)).verified).toBe(false);
  });

  it("التجديد: النسخة المقبولة القديمة تبقى لين تنقبل الجديدة", async () => {
    const p = await verifiedProvider("0570000002");
    const renewal = (await upload(p.token, "id_document", PDF, "2029-01-01")).json().documentId;
    let view = await me(p.token);
    expect(view.verified).toBe(true);
    const queue = (await call({ method: "GET", url: "/v1/admin/queue", token: verifier.token })).json().queue;
    expect(queue.some((q: { id: string }) => q.id === p.providerId)).toBe(true);
    await approve(renewal);
    view = await me(p.token);
    expect(view.documents[0].approved.expiresOn).toBe("2029-01-01");
    expect(view.verified).toBe(true);
  });
});

describe("إيقاف المزوّد", () => {
  it("موظف التوثيق ما يقدر يوقف، والمدير العام يقدر، ورفع الإيقاف يرجّعه موثّق", async () => {
    const p = await verifiedProvider("0580000001");
    const url = `/v1/admin/providers/${p.providerId}/suspend`;
    expect((await call({ method: "POST", url, token: verifier.token, payload: { reason: "مخالفة متكررة" } })).statusCode).toBe(403);
    expect((await call({ method: "POST", url, token: gm.token, payload: { reason: "مخالفة متكررة" } })).statusCode).toBe(200);
    expect((await me(p.token)).verified).toBe(false);
    expect((await upload(p.token, "id_document")).statusCode).toBe(403);
    const r = await call({ method: "POST", url: `/v1/admin/providers/${p.providerId}/reinstate`, token: gm.token, payload: { reason: "تمت التسوية" } });
    expect(r.json().status).toBe("verified");
  });
});

describe("إدارة الموظفين", () => {
  const add = (token: string, phone: string, role: string) =>
    call({ method: "POST", url: "/v1/admin/staff", token, payload: { phone, role, name: "موظف جديد" } });

  it("المدير العام يضيف موظف توثيق، وما يضيف مدير عام ولا مالك", async () => {
    expect((await add(gm.token, "0591000001", "verification")).statusCode).toBe(201);
    expect((await add(gm.token, "0591000002", "general_manager")).statusCode).toBe(403);
    expect((await add(owner.token, "0591000003", "owner")).statusCode).toBe(403);
  });

  it("المالك يضيف مدير عام، والمدير العام ما يقدر يوقفه", async () => {
    const r = await add(owner.token, "0591000004", "general_manager");
    expect(r.statusCode).toBe(201);
    expect((await call({ method: "POST", url: `/v1/admin/staff/${r.json().userId}/deactivate`, token: gm.token })).statusCode).toBe(403);
  });

  it("موظف التوثيق ما يقدر يضيف موظفين، وما أحد يوقف نفسه", async () => {
    expect((await add(verifier.token, "0591000005", "support")).statusCode).toBe(403);
    expect((await call({ method: "POST", url: `/v1/admin/staff/${gm.userId}/deactivate`, token: gm.token })).json().error.code).toBe("cannot_deactivate_self");
  });

  it("رقم مسجّل كمصنع ما يصير موظف", async () => {
    expect((await add(gm.token, "0510000001", "support")).json().error.code).toBe("phone_used_by_customer");
  });

  it("مالك واحد بس فعّال على مستوى قاعدة البيانات", async () => {
    const [u] = await ctx.db.query<{ id: string }>("INSERT INTO users (phone, role) VALUES ('+966599999999','staff') RETURNING id");
    await expect(ctx.db.query("INSERT INTO staff (user_id, role) VALUES ($1,'owner')", [u.id])).rejects.toThrow();
  });
});
