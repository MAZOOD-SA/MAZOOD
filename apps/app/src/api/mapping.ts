// تحويل شكل الطلب من الخادم لشكل الواجهة.
import { categoryById, type CategoryId } from "@/data/categories";
import type { RequestStatus, ServiceRequest, When } from "@/data/types";

export type ServerRequest = {
  id: string;
  category: CategoryId;
  typeId: string;
  details: string;
  location: string;
  when: When;
  status: RequestStatus;
  createdAt: string;
};

export function fromServerRequest(r: ServerRequest): ServiceRequest {
  const type = categoryById(r.category).types.find((x) => x.id === r.typeId);
  const title = type?.name ?? categoryById(r.category).name;
  return {
    id: r.id,
    category: r.category,
    typeId: r.typeId,
    title,
    // نص المستخدم يظهر نفسه في اللغتين.
    details: { ar: r.details, en: r.details },
    location: { ar: r.location, en: r.location },
    when: r.when,
    createdAt: new Date(r.createdAt).toISOString(),
    status: r.status,
  };
}

export type ServerFactory = {
  id: string;
  name: string | null;
  city: string | null;
  commercialRegister: string | null;
  vatNumber: string | null;
  profileComplete: boolean;
};

/** رسالة الخطأ المناسبة لرمز الخطأ القادم من الخادم. */
export function errorKey(code: string): "otpCooldown" | "otpRateLimited" | "otpInvalid" | "networkError" | "serverError" | "notCancellable" {
  switch (code) {
    case "otp_cooldown":
      return "otpCooldown";
    case "otp_rate_limited":
    case "rate_limited":
      return "otpRateLimited";
    case "otp_invalid":
    case "validation":
      return "otpInvalid";
    case "network":
      return "networkError";
    case "request_not_cancellable":
      return "notCancellable";
    default:
      return "serverError";
  }
}
