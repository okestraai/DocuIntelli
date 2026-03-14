// ── E-Signature shared types ─────────────────────────────────────────
// Mirrors the web app's e-signature interfaces for like-for-like parity.

/** A field on a signature request (from the server) */
export interface EsignField {
  id: string;
  signature_request_id: string;
  signer_id: string;
  field_type: FieldType;
  page_number: number;
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
  label: string | null;
  required: boolean;
  value: string | null;
  filled_at: string | null;
}

/** A field placed by the request creator (client-side, before submission) */
export interface PlacedField {
  id: string;
  signerEmail: string;
  fieldType: FieldType;
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  label?: string;
}

export type FieldType =
  | 'signature'
  | 'full_name'
  | 'initials'
  | 'date_signed'
  | 'text_field'
  | 'checkbox'
  | 'title_role'
  | 'company_name'
  | 'custom_text';

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  signature: 'Signature',
  full_name: 'Full Name',
  initials: 'Initials',
  date_signed: 'Date Signed',
  text_field: 'Text Field',
  checkbox: 'Checkbox',
  title_role: 'Title / Role',
  company_name: 'Company Name',
  custom_text: 'Custom Text',
};

/** Default field dimensions (percentage of page) per field type — matches web */
export const FIELD_DEFAULTS: Record<FieldType, { widthPercent: number; heightPercent: number }> = {
  signature: { widthPercent: 20, heightPercent: 6 },
  initials: { widthPercent: 8, heightPercent: 5 },
  checkbox: { widthPercent: 3, heightPercent: 3 },
  full_name: { widthPercent: 18, heightPercent: 3.5 },
  date_signed: { widthPercent: 15, heightPercent: 3.5 },
  text_field: { widthPercent: 18, heightPercent: 3.5 },
  title_role: { widthPercent: 18, heightPercent: 3.5 },
  company_name: { widthPercent: 18, heightPercent: 3.5 },
  custom_text: { widthPercent: 18, heightPercent: 3.5 },
};

/** Signer colors for field placement differentiation — matches web */
export const SIGNER_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
];

// ── Request / Signer types ──────────────────────────────────────────

export interface SignerEntry {
  name: string;
  email: string;
  orderIndex: number;
}

export interface SignerInfo {
  id: string;
  name: string;
  email: string;
  status: SignerStatus;
}

export type SignerStatus = 'pending' | 'notified' | 'viewed' | 'signed' | 'declined';

export type RequestStatus = 'draft' | 'pending' | 'completed' | 'voided' | 'expired';

export interface RequestInfo {
  id: string;
  title: string;
  message: string | null;
  documentName: string;
  ownerName: string;
  signingOrder?: 'parallel' | 'sequential';
}

export interface SentRequest {
  id: string;
  title: string;
  document_id: string;
  document_name: string;
  status: RequestStatus;
  signer_count: number;
  signed_count: number;
  created_at: string;
  completed_at: string | null;
  signed_file_path: string | null;
}

export interface ReceivedRequest {
  id: string;
  title: string;
  request_status: RequestStatus;
  document_name: string;
  owner_name: string;
  signer_id: string;
  signer_status: SignerStatus;
  signed_at: string | null;
  created_at: string;
  vault_captured: boolean;
}

export interface SignerDetail {
  id: string;
  signer_email: string;
  signer_name: string;
  signing_order_index: number;
  status: SignerStatus;
  signed_at: string | null;
}

export interface RequestDetail {
  id: string;
  title: string;
  message: string | null;
  document_name: string;
  status: RequestStatus;
  signing_order: 'parallel' | 'sequential';
  created_at: string;
  completed_at: string | null;
  signed_file_path: string | null;
  signers: SignerDetail[];
  fields: EsignField[];
  auditLog: AuditEntry[];
}

export interface AuditEntry {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ── API response wrappers ───────────────────────────────────────────

export interface ValidateTokenResponse {
  success: boolean;
  data: {
    signer: SignerInfo;
    request: RequestInfo;
  };
}

export interface FieldsResponse {
  success: boolean;
  data: {
    fields: EsignField[];
    documentName: string;
    documentId: string;
  };
}

export interface CompleteResponse {
  success: boolean;
  allComplete: boolean;
  signerId?: string;
  data?: { allComplete: boolean; requestId: string };
}

export interface MySignaturesResponse {
  success: boolean;
  data: {
    sent: SentRequest[];
    received: ReceivedRequest[];
  };
}

export interface CreateRequestPayload {
  documentId: string;
  title: string;
  message?: string;
  signingOrder: 'parallel' | 'sequential';
  signers: SignerEntry[];
  fields: {
    signerEmail: string;
    fieldType: FieldType;
    pageNumber: number;
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
    label?: string;
    required?: boolean;
  }[];
  expiresAt?: string;
}

export interface CreateRequestResponse {
  success: boolean;
  data: {
    requestId: string;
    signerTokens: { email: string; rawToken: string }[];
  };
}

export interface SelfSignFieldValue {
  fieldType: FieldType;
  pageNumber: number;
  value: string;
}

export interface SignedPdfResponse {
  success: boolean;
  data: {
    url: string;
    documentName: string;
  };
}
