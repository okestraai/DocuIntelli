export interface Document {
  id: string;
  user_id: string;
  name: string;
  category: DocumentCategory;
  type: string;
  size: string;
  file_path: string;
  original_name: string;
  upload_date: string;
  expiration_date?: string;
  status: 'active' | 'expiring' | 'expired';
  processed: boolean;
  created_at: string;
  updated_at: string;
  tags?: string[];
}

export type DocumentCategory = 'warranty' | 'insurance' | 'lease' | 'employment' | 'contract' | 'other';

export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'warranty', label: 'Warranty' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'lease', label: 'Lease' },
  { value: 'employment', label: 'Employment' },
  { value: 'contract', label: 'Contract' },
  { value: 'other', label: 'Other' },
];
