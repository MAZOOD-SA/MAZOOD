// شكل بيانات المزوّد كما يرجعها الخادم.
import type { CommitmentView, DocType, ProviderStatus } from "@mazood/shared";

export type DocView = {
  id: string;
  docType: DocType;
  mimeType: string;
  expiresOn: string;
  status: "pending" | "approved" | "rejected" | "replaced";
  checklist: string[];
  rejectionReason: string | null;
  uploadedAt: string;
};

export type DocSlotView = {
  docType: DocType;
  approved: DocView | null;
  pending: DocView | null;
  rejected: DocView | null;
  expired: boolean;
  expiringSoon: boolean;
};

export type ProviderView = {
  id: string;
  tradeName: string;
  ownerName: string;
  idType: "national_id" | "iqama";
  idNumberMasked: string;
  commercialRegister: string;
  categories: string[];
  status: ProviderStatus;
  statusReason: string | null;
  verified: boolean;
  readyToSubmit: boolean;
  documents: DocSlotView[];
  expiring: { docType: DocType; expiresOn: string; expired: boolean }[];
  /** نفس اللي تشوفه المصانع في بطاقة العرض (القرار ٣٣). */
  rating?: { average: number; count: number } | null;
  commitment?: CommitmentView;
};
