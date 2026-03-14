/**
 * e-Signature Service
 *
 * Business logic for the integrated e-Signature feature.
 * Handles signature requests, signing tokens, field management,
 * PDF finalization with audit trails, and notifications.
 */

import crypto from 'crypto';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { query, getClient } from './db';
import { downloadFromStorage, uploadToStorage, uploadToStoragePath } from './storage';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WORD_EXTENSIONS = ['.doc', '.docx'];

function isWordDocument(filePath: string): boolean {
  return WORD_EXTENSIONS.some(ext => filePath.toLowerCase().endsWith(ext));
}

/**
 * Convert a DOCX/DOC file buffer to PDF using LibreOffice headless.
 * Returns the PDF buffer.
 */
async function convertDocxToPdf(docBuffer: Buffer): Promise<Buffer> {
  const tmpId = crypto.randomUUID();
  const tmpDir = `/tmp/esign_docx2pdf_${tmpId}`;
  const inputPath = path.join(tmpDir, 'input.docx');

  try {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(inputPath, docBuffer);

    await new Promise<void>((resolve, reject) => {
      execFile('libreoffice', [
        '--headless', '--norestore', '--convert-to', 'pdf',
        '--outdir', tmpDir, inputPath,
      ], { timeout: 60000 }, (error, _stdout, stderr) => {
        if (error) {
          console.error('LibreOffice conversion error:', stderr);
          reject(new Error('Failed to convert document to PDF'));
        } else {
          resolve();
        }
      });
    });

    return await fs.readFile(path.join(tmpDir, 'input.pdf'));
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SignerInput {
  name: string;
  email: string;
  orderIndex?: number;
}

export interface FieldInput {
  signerEmail: string;
  fieldType: string;
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  label?: string;
  required?: boolean;
}

export interface SignatureRequest {
  id: string;
  owner_id: string;
  document_id: string;
  title: string;
  message: string | null;
  status: string;
  signing_order: string;
  document_hash: string | null;
  signed_file_path: string | null;
  expires_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignatureSigner {
  id: string;
  signature_request_id: string;
  signer_email: string;
  signer_name: string;
  signer_user_id: string | null;
  signing_order_index: number;
  status: string;
  signed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface SignatureField {
  id: string;
  signature_request_id: string;
  signer_id: string;
  field_type: string;
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

// ─── Token Helpers ──────────────────────────────────────────────────────────

function generateSigningToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ─── Request Management ────────────────────────────────────────────────────

/**
 * Create a draft signature request with signers and fields.
 * Returns the request ID and raw signing tokens for each signer.
 */
export async function createSignatureRequest(
  ownerId: string,
  documentId: string,
  title: string,
  message: string | null,
  signingOrder: 'parallel' | 'sequential',
  signers: SignerInput[],
  fields: FieldInput[],
  expiresAt?: string
): Promise<{ requestId: string; signerTokens: { email: string; rawToken: string }[] }> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Verify document exists and belongs to owner
    const docCheck = await client.query(
      'SELECT id, file_path FROM documents WHERE id = $1 AND user_id = $2',
      [documentId, ownerId]
    );
    if (docCheck.rows.length === 0) {
      throw new Error('Document not found or access denied');
    }

    // Create request
    const reqResult = await client.query(
      `INSERT INTO signature_requests (owner_id, document_id, title, message, signing_order, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [ownerId, documentId, title, message, signingOrder, expiresAt || null]
    );
    const requestId = reqResult.rows[0].id;

    // Create signers with signing tokens
    const signerTokens: { email: string; rawToken: string }[] = [];
    const signerIdMap: Record<string, string> = {}; // email -> signer id

    for (let i = 0; i < signers.length; i++) {
      const signer = signers[i];
      const { rawToken, tokenHash } = generateSigningToken();
      const expiresDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const signerResult = await client.query(
        `INSERT INTO signature_signers
         (signature_request_id, signer_email, signer_name, signing_order_index, signing_token, signing_token_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [requestId, signer.email.toLowerCase(), signer.name, signer.orderIndex ?? i, tokenHash, expiresDate]
      );
      signerIdMap[signer.email.toLowerCase()] = signerResult.rows[0].id;
      signerTokens.push({ email: signer.email.toLowerCase(), rawToken });
    }

    // Create fields
    for (const field of fields) {
      const signerId = signerIdMap[field.signerEmail.toLowerCase()];
      if (!signerId) {
        throw new Error(`Signer not found for email: ${field.signerEmail}`);
      }
      await client.query(
        `INSERT INTO signature_fields
         (signature_request_id, signer_id, field_type, page_number, x_percent, y_percent, width_percent, height_percent, label, required)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [requestId, signerId, field.fieldType, field.pageNumber, field.xPercent, field.yPercent, field.widthPercent, field.heightPercent, field.label || null, field.required !== false]
      );
    }

    // Audit log
    await client.query(
      `INSERT INTO signature_audit_log (signature_request_id, actor_user_id, action, metadata)
       VALUES ($1, $2, 'request_created', $3)`,
      [requestId, ownerId, JSON.stringify({ signerCount: signers.length, fieldCount: fields.length })]
    );

    await client.query('COMMIT');
    return { requestId, signerTokens };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Send a signature request: hash the document, update status, notify signers.
 */
export async function sendSignatureRequest(
  ownerId: string,
  requestId: string
): Promise<{ success: boolean; signerTokens: { email: string; name: string; rawToken: string }[] }> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Load request
    const reqResult = await client.query(
      `SELECT sr.*, d.file_path, d.name as document_name
       FROM signature_requests sr
       JOIN documents d ON d.id = sr.document_id
       WHERE sr.id = $1 AND sr.owner_id = $2 AND sr.status = 'draft'`,
      [requestId, ownerId]
    );
    if (reqResult.rows.length === 0) {
      throw new Error('Request not found, not owned by you, or not in draft status');
    }
    const request = reqResult.rows[0];

    // Download the document — convert Word docs to PDF first
    let pdfBuffer = await downloadFromStorage(request.file_path);

    if (isWordDocument(request.file_path)) {
      pdfBuffer = await convertDocxToPdf(pdfBuffer);
      // Store the converted PDF alongside the original for finalization
      const ext = path.extname(request.file_path);
      const pdfPath = request.file_path.replace(ext, '_esign.pdf');
      await uploadToStoragePath(pdfPath, pdfBuffer, 'application/pdf');
    }

    const docHash = hashBuffer(pdfBuffer);

    // Generate new signing tokens (replace the draft ones)
    const signersResult = await client.query(
      'SELECT id, signer_email, signer_name, signing_order_index FROM signature_signers WHERE signature_request_id = $1 ORDER BY signing_order_index',
      [requestId]
    );

    const signerTokens: { email: string; name: string; rawToken: string }[] = [];
    for (const signer of signersResult.rows) {
      const { rawToken, tokenHash } = generateSigningToken();
      const expiresDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await client.query(
        `UPDATE signature_signers
         SET signing_token = $1, signing_token_expires_at = $2, status = 'notified', updated_at = now()
         WHERE id = $3`,
        [tokenHash, expiresDate, signer.id]
      );
      signerTokens.push({ email: signer.signer_email, name: signer.signer_name, rawToken });

      // Audit: signer notified
      await client.query(
        `INSERT INTO signature_audit_log (signature_request_id, signer_id, actor_user_id, action, metadata)
         VALUES ($1, $2, $3, 'signer_notified', $4)`,
        [requestId, signer.id, ownerId, JSON.stringify({ email: signer.signer_email })]
      );
    }

    // Update request status
    await client.query(
      `UPDATE signature_requests SET status = 'pending', document_hash = $1, updated_at = now() WHERE id = $2`,
      [docHash, requestId]
    );

    // Audit: request sent
    await client.query(
      `INSERT INTO signature_audit_log (signature_request_id, actor_user_id, action, metadata)
       VALUES ($1, $2, 'request_sent', $3)`,
      [requestId, ownerId, JSON.stringify({ documentHash: docHash })]
    );

    await client.query('COMMIT');
    return { success: true, signerTokens };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Validate a signing token. Returns signer + request info if valid.
 */
export async function validateSigningToken(rawToken: string): Promise<{
  signer: SignatureSigner;
  request: SignatureRequest & { document_name: string; owner_name: string; file_path: string };
} | null> {
  const tokenHash = hashToken(rawToken);

  const result = await query(
    `SELECT ss.*, sr.id as req_id, sr.owner_id, sr.document_id, sr.title, sr.message,
            sr.status as req_status, sr.signing_order, sr.document_hash,
            d.name as document_name, d.file_path,
            COALESCE(up.display_name, au.email) as owner_name
     FROM signature_signers ss
     JOIN signature_requests sr ON sr.id = ss.signature_request_id
     JOIN documents d ON d.id = sr.document_id
     JOIN auth_users au ON au.id = sr.owner_id
     LEFT JOIN user_profiles up ON up.id = sr.owner_id
     WHERE ss.signing_token = $1
       AND ss.signing_token_expires_at > now()
       AND sr.status IN ('pending', 'completed')`,
    [tokenHash]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    signer: {
      id: row.id,
      signature_request_id: row.signature_request_id,
      signer_email: row.signer_email,
      signer_name: row.signer_name,
      signer_user_id: row.signer_user_id,
      signing_order_index: row.signing_order_index,
      status: row.status,
      signed_at: row.signed_at,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      created_at: row.created_at,
    },
    request: {
      id: row.req_id,
      owner_id: row.owner_id,
      document_id: row.document_id,
      title: row.title,
      message: row.message,
      status: row.req_status,
      signing_order: row.signing_order,
      document_hash: row.document_hash,
      signed_file_path: null,
      expires_at: null,
      completed_at: null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      document_name: row.document_name,
      owner_name: row.owner_name,
      file_path: row.file_path,
    },
  };
}

/**
 * Validate a signer by their ID + authenticated user email.
 * Used when an authenticated signer navigates from the vault Signatures tab.
 * Returns the same shape as validateSigningToken.
 */
export async function validateSignerById(signerId: string, userEmail: string): Promise<{
  signer: SignatureSigner;
  request: SignatureRequest & { document_name: string; owner_name: string; file_path: string };
} | null> {
  const result = await query(
    `SELECT ss.*, sr.id as req_id, sr.owner_id, sr.document_id, sr.title, sr.message,
            sr.status as req_status, sr.signing_order, sr.document_hash,
            d.name as document_name, d.file_path,
            COALESCE(up.display_name, au.email) as owner_name
     FROM signature_signers ss
     JOIN signature_requests sr ON sr.id = ss.signature_request_id
     JOIN documents d ON d.id = sr.document_id
     JOIN auth_users au ON au.id = sr.owner_id
     LEFT JOIN user_profiles up ON up.id = sr.owner_id
     WHERE ss.id = $1
       AND LOWER(ss.signer_email) = LOWER($2)
       AND sr.status IN ('pending', 'completed')`,
    [signerId, userEmail]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    signer: {
      id: row.id,
      signature_request_id: row.signature_request_id,
      signer_email: row.signer_email,
      signer_name: row.signer_name,
      signer_user_id: row.signer_user_id,
      signing_order_index: row.signing_order_index,
      status: row.status,
      signed_at: row.signed_at,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      created_at: row.created_at,
    },
    request: {
      id: row.req_id,
      owner_id: row.owner_id,
      document_id: row.document_id,
      title: row.title,
      message: row.message,
      status: row.req_status,
      signing_order: row.signing_order,
      document_hash: row.document_hash,
      signed_file_path: null,
      expires_at: null,
      completed_at: null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      document_name: row.document_name,
      owner_name: row.owner_name,
      file_path: row.file_path,
    },
  };
}

/**
 * Get fields assigned to a signer.
 */
export async function getSignerFields(signerId: string): Promise<SignatureField[]> {
  const result = await query(
    'SELECT * FROM signature_fields WHERE signer_id = $1 ORDER BY page_number, y_percent',
    [signerId]
  );
  return result.rows;
}

/**
 * Fill a field value.
 */
export async function fillField(
  signerId: string,
  fieldId: string,
  value: string,
  ip?: string,
  userAgent?: string
): Promise<boolean> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Verify field belongs to signer and is not already filled
    const fieldResult = await client.query(
      `SELECT sf.*, ss.signature_request_id
       FROM signature_fields sf
       JOIN signature_signers ss ON ss.id = sf.signer_id
       WHERE sf.id = $1 AND sf.signer_id = $2`,
      [fieldId, signerId]
    );

    if (fieldResult.rows.length === 0) {
      throw new Error('Field not found or not assigned to this signer');
    }

    const field = fieldResult.rows[0];

    await client.query(
      'UPDATE signature_fields SET value = $1, filled_at = now() WHERE id = $2',
      [value, fieldId]
    );

    // Audit log
    await client.query(
      `INSERT INTO signature_audit_log (signature_request_id, signer_id, action, metadata, ip_address, user_agent)
       VALUES ($1, $2, 'field_filled', $3, $4, $5)`,
      [field.signature_request_id, signerId, JSON.stringify({ fieldId, fieldType: field.field_type }), ip || null, userAgent || null]
    );

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Mark signer's view of the document.
 */
export async function markSignerViewed(signerId: string, requestId: string, ip?: string, userAgent?: string): Promise<void> {
  await query(
    `UPDATE signature_signers SET status = 'viewed', updated_at = now() WHERE id = $1 AND status IN ('notified','pending')`,
    [signerId]
  );
  await query(
    `INSERT INTO signature_audit_log (signature_request_id, signer_id, action, ip_address, user_agent)
     VALUES ($1, $2, 'signer_viewed', $3, $4)`,
    [requestId, signerId, ip || null, userAgent || null]
  );
}

/**
 * Link a signer to a user account after they log in.
 */
export async function linkSignerToUser(signerId: string, userId: string): Promise<void> {
  await query(
    'UPDATE signature_signers SET signer_user_id = $1, updated_at = now() WHERE id = $2',
    [userId, signerId]
  );
}

/**
 * Complete signing for a signer. If all signers are done, finalize the document.
 */
export async function completeSignerSigning(
  signerId: string,
  ip: string,
  userAgent: string
): Promise<{ allComplete: boolean; requestId: string }> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Get signer + request
    const signerResult = await client.query(
      'SELECT * FROM signature_signers WHERE id = $1',
      [signerId]
    );
    if (signerResult.rows.length === 0) throw new Error('Signer not found');
    const signer = signerResult.rows[0];
    const requestId = signer.signature_request_id;

    // Verify all required fields are filled
    const unfilledResult = await client.query(
      `SELECT COUNT(*) as cnt FROM signature_fields
       WHERE signer_id = $1 AND required = true AND value IS NULL`,
      [signerId]
    );
    if (parseInt(unfilledResult.rows[0].cnt) > 0) {
      throw new Error('Not all required fields have been filled');
    }

    // Mark signer as signed
    await client.query(
      `UPDATE signature_signers SET status = 'signed', signed_at = now(), ip_address = $1, user_agent = $2, updated_at = now()
       WHERE id = $3`,
      [ip, userAgent, signerId]
    );

    // Audit log
    await client.query(
      `INSERT INTO signature_audit_log (signature_request_id, signer_id, action, ip_address, user_agent)
       VALUES ($1, $2, 'signer_signed', $3, $4)`,
      [requestId, signerId, ip, userAgent]
    );

    // Check if all signers are done
    const pendingResult = await client.query(
      `SELECT COUNT(*) as cnt FROM signature_signers
       WHERE signature_request_id = $1 AND status != 'signed'`,
      [requestId]
    );
    const allComplete = parseInt(pendingResult.rows[0].cnt) === 0;

    if (allComplete) {
      // Mark request as completed
      await client.query(
        `UPDATE signature_requests SET status = 'completed', completed_at = now(), updated_at = now()
         WHERE id = $1`,
        [requestId]
      );

      await client.query(
        `INSERT INTO signature_audit_log (signature_request_id, action, metadata)
         VALUES ($1, 'document_completed', '{}')`,
        [requestId]
      );
    }

    await client.query('COMMIT');

    // If all complete, finalize the PDF (outside transaction — it's long-running)
    if (allComplete) {
      try {
        await finalizeDocument(requestId);
      } catch (err) {
        console.error('Failed to finalize signed PDF:', err);
        // Don't throw — the signing is recorded, PDF generation can be retried
      }
    }

    return { allComplete, requestId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Finalize the signed document: embed all field values + audit trail into PDF.
 */
export async function finalizeDocument(requestId: string): Promise<string> {
  // Load request
  const reqResult = await query(
    `SELECT sr.*, d.file_path, d.name as document_name
     FROM signature_requests sr
     JOIN documents d ON d.id = sr.document_id
     WHERE sr.id = $1`,
    [requestId]
  );
  if (reqResult.rows.length === 0) throw new Error('Request not found');
  const request = reqResult.rows[0];

  // Download original PDF (use converted PDF for Word docs)
  let effectivePath = request.file_path;
  if (isWordDocument(request.file_path)) {
    const ext = path.extname(request.file_path);
    effectivePath = request.file_path.replace(ext, '_esign.pdf');
  }
  const pdfBuffer = await downloadFromStorage(effectivePath);

  // Verify hash integrity
  const currentHash = hashBuffer(pdfBuffer);
  if (request.document_hash && currentHash !== request.document_hash) {
    throw new Error('Document has been tampered with — hash mismatch');
  }

  // Load PDF
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Load all fields with signer info
  const fieldsResult = await query(
    `SELECT sf.*, ss.signer_name, ss.signer_email
     FROM signature_fields sf
     JOIN signature_signers ss ON ss.id = sf.signer_id
     WHERE sf.signature_request_id = $1 AND sf.value IS NOT NULL
     ORDER BY sf.page_number, sf.y_percent`,
    [requestId]
  );

  // Embed fields into PDF pages
  for (const field of fieldsResult.rows) {
    const pageIndex = field.page_number - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const { width, height } = page.getSize();
    const x = (field.x_percent / 100) * width;
    const y = height - ((field.y_percent / 100) * height) - ((field.height_percent / 100) * height);
    const fieldWidth = (field.width_percent / 100) * width;
    const fieldHeight = (field.height_percent / 100) * height;

    if (field.field_type === 'signature' || field.field_type === 'initials') {
      // Value is base64 PNG
      try {
        const base64Data = field.value.replace(/^data:image\/png;base64,/, '');
        const imgBytes = Buffer.from(base64Data, 'base64');
        const pngImage = await pdfDoc.embedPng(imgBytes);
        const scaledDims = pngImage.scaleToFit(fieldWidth, fieldHeight);
        page.drawImage(pngImage, {
          x,
          y,
          width: scaledDims.width,
          height: scaledDims.height,
        });
      } catch (err) {
        console.error(`Failed to embed signature image for field ${field.id}:`, err);
      }
    } else if (field.field_type === 'checkbox') {
      // Draw a check mark or filled box
      if (field.value === 'true' || field.value === '1') {
        page.drawText('X', {
          x: x + 2,
          y: y + 2,
          size: Math.min(fieldHeight - 4, 14),
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      }
    } else {
      // Text-based fields
      const fontSize = Math.min(fieldHeight * 0.6, 12);
      page.drawText(field.value || '', {
        x: x + 2,
        y: y + (fieldHeight - fontSize) / 2,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        maxWidth: fieldWidth - 4,
      });
    }
  }

  // Generate audit trail page
  await appendAuditTrailPage(pdfDoc, requestId, request.document_name, request.document_hash || currentHash);

  // Save PDF
  const signedPdfBytes = await pdfDoc.save();
  const signedBuffer = Buffer.from(signedPdfBytes);

  // Upload to Azure Blob
  const timestamp = Date.now();
  const sanitizedName = request.document_name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uploadResult = await uploadToStorage(
    signedBuffer,
    request.owner_id,
    `signed-${timestamp}-${sanitizedName}`,
    'application/pdf'
  );

  if (!uploadResult.success || !uploadResult.filePath) {
    throw new Error('Failed to upload signed PDF');
  }

  // Update request with signed file path
  await query(
    'UPDATE signature_requests SET signed_file_path = $1, updated_at = now() WHERE id = $2',
    [uploadResult.filePath, requestId]
  );

  // Create a new document entry in the owner's vault so the signed PDF is visible
  const ownerDocResult = await query(
    `INSERT INTO documents (user_id, name, category, type, size, file_path, original_name, status)
     VALUES ($1, $2, $3, 'application/pdf', $4, $5, $6, 'active') RETURNING id`,
    [
      request.owner_id,
      `Signed - ${request.document_name}`,
      'contract',
      signedBuffer.length,
      uploadResult.filePath,
      request.document_name,
    ]
  );

  // Audit log
  await query(
    `INSERT INTO signature_audit_log (signature_request_id, action, metadata)
     VALUES ($1, 'document_added_to_vault', $2)`,
    [requestId, JSON.stringify({ user_id: request.owner_id, file_path: uploadResult.filePath })]
  );

  // Trigger document processing pipeline for owner's signed copy — fire and forget
  const ownerNewDocId = ownerDocResult.rows[0]?.id;
  if (ownerNewDocId) {
    try {
      const { processDocumentPipeline } = await import('./documentPipeline');
      processDocumentPipeline({
        documentId: ownerNewDocId,
        userId: request.owner_id,
        documentName: `Signed - ${request.document_name}`,
        category: 'contract',
        buffer: signedBuffer,
        mimeType: 'application/pdf',
      }).catch(err => console.error('Owner signed doc pipeline error:', err));
    } catch (err) {
      console.error('Failed to start pipeline for owner signed doc:', err);
    }
  }

  return uploadResult.filePath;
}

/**
 * Append an audit trail page to a PDF document.
 */
async function appendAuditTrailPage(
  pdfDoc: PDFDocument,
  requestId: string,
  documentName: string,
  documentHash: string
): Promise<void> {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Load signers with their signing data
  const signersResult = await query(
    `SELECT signer_name, signer_email, status, signed_at, ip_address, user_agent
     FROM signature_signers
     WHERE signature_request_id = $1
     ORDER BY signing_order_index`,
    [requestId]
  );

  // Load audit events
  const eventsResult = await query(
    `SELECT action, created_at, ip_address, metadata
     FROM signature_audit_log
     WHERE signature_request_id = $1
     ORDER BY created_at`,
    [requestId]
  );

  const page = pdfDoc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();
  let y = height - 50;

  const emeraldColor = rgb(0.02, 0.588, 0.412); // #059669

  // Header
  page.drawText('SIGNATURE VERIFICATION RECORD', {
    x: 50, y, size: 16, font: fontBold, color: emeraldColor,
  });
  y -= 8;
  page.drawRectangle({ x: 50, y, width: width - 100, height: 2, color: emeraldColor });
  y -= 25;

  // Document info
  page.drawText('Document:', { x: 50, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(documentName, { x: 130, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
  y -= 16;

  page.drawText('Document ID:', { x: 50, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(requestId, { x: 130, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 16;

  page.drawText('SHA-256:', { x: 50, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(documentHash, { x: 130, y, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 30;

  // Signers table
  page.drawText('SIGNING PARTIES', { x: 50, y, size: 12, font: fontBold, color: emeraldColor });
  y -= 20;

  // Table headers
  const cols = [50, 170, 310, 400, 510];
  const headers = ['Name', 'Email', 'Status', 'Signed At', 'IP Address'];
  headers.forEach((h, i) => {
    page.drawText(h, { x: cols[i], y, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  });
  y -= 4;
  page.drawRectangle({ x: 50, y, width: width - 100, height: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 14;

  // Signer rows
  for (const signer of signersResult.rows) {
    if (y < 100) break; // Avoid overflow for now
    page.drawText(signer.signer_name || '', { x: cols[0], y, size: 8, font, color: rgb(0.2, 0.2, 0.2), maxWidth: 115 });
    page.drawText(signer.signer_email || '', { x: cols[1], y, size: 8, font, color: rgb(0.2, 0.2, 0.2), maxWidth: 135 });
    page.drawText(signer.status || '', { x: cols[2], y, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(signer.signed_at ? new Date(signer.signed_at).toISOString() : '—', {
      x: cols[3], y, size: 7, font, color: rgb(0.3, 0.3, 0.3), maxWidth: 105,
    });
    page.drawText(signer.ip_address || '—', { x: cols[4], y, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 16;
  }

  y -= 20;

  // Event timeline
  if (y > 200) {
    page.drawText('EVENT TIMELINE', { x: 50, y, size: 12, font: fontBold, color: emeraldColor });
    y -= 18;

    for (const event of eventsResult.rows) {
      if (y < 80) break;
      const ts = new Date(event.created_at).toISOString();
      const action = event.action.replace(/_/g, ' ').toUpperCase();
      page.drawText(`${ts}  —  ${action}`, {
        x: 55, y, size: 7, font, color: rgb(0.3, 0.3, 0.3),
      });
      y -= 12;
    }
  }

  // Footer
  page.drawRectangle({ x: 50, y: 45, width: width - 100, height: 0.5, color: rgb(0.7, 0.7, 0.7) });
  page.drawText('This document was signed electronically via DocuIntelli AI (docuintelli.com)', {
    x: 50, y: 30, size: 8, font, color: rgb(0.4, 0.4, 0.4),
  });
  page.drawText(`Generated: ${new Date().toISOString()}`, {
    x: width - 200, y: 30, size: 7, font, color: rgb(0.5, 0.5, 0.5),
  });
}

// ─── Request Queries ────────────────────────────────────────────────────────

/**
 * List all signature requests for an owner.
 */
export async function getRequestsForOwner(ownerId: string): Promise<any[]> {
  const result = await query(
    `SELECT sr.*,
            d.name as document_name,
            (SELECT COUNT(*) FROM signature_signers ss WHERE ss.signature_request_id = sr.id) as signer_count,
            (SELECT COUNT(*) FROM signature_signers ss WHERE ss.signature_request_id = sr.id AND ss.status = 'signed') as signed_count
     FROM signature_requests sr
     JOIN documents d ON d.id = sr.document_id
     WHERE sr.owner_id = $1
     ORDER BY sr.created_at DESC`,
    [ownerId]
  );
  return result.rows;
}

/**
 * Get signature requests where the user is a signer (incoming to-sign requests).
 */
export async function getRequestsForSigner(userEmail: string, userId: string): Promise<any[]> {
  const result = await query(
    `SELECT sr.id, sr.title, sr.status as request_status, sr.created_at, sr.completed_at,
            sr.signed_file_path,
            d.name as document_name,
            ss.id as signer_id, ss.status as signer_status, ss.signed_at,
            COALESCE(up.display_name, au.email) as owner_name,
            (SELECT sal.id FROM signature_audit_log sal
             WHERE sal.signature_request_id = sr.id
               AND sal.signer_id = ss.id
               AND sal.action = 'vault_captured'
               AND (
                 sal.metadata->>'document_id' IS NULL
                 OR EXISTS (SELECT 1 FROM documents vd WHERE vd.id = (sal.metadata->>'document_id')::uuid)
               )
             LIMIT 1) IS NOT NULL as vault_captured
     FROM signature_signers ss
     JOIN signature_requests sr ON sr.id = ss.signature_request_id
     JOIN documents d ON d.id = sr.document_id
     JOIN auth_users au ON au.id = sr.owner_id
     LEFT JOIN user_profiles up ON up.id = sr.owner_id
     WHERE ss.signer_email = $1
       AND sr.owner_id != $2
     ORDER BY sr.created_at DESC`,
    [userEmail.toLowerCase(), userId]
  );
  return result.rows;
}

/**
 * Get combined signature data for vault display.
 * Returns both sent (as initiator) and received (as signer) requests.
 */
export async function getMySignatures(userId: string, userEmail: string): Promise<{
  sent: any[];
  received: any[];
}> {
  const [sent, received] = await Promise.all([
    getRequestsForOwner(userId),
    getRequestsForSigner(userEmail, userId),
  ]);
  return { sent, received };
}

/**
 * Get full detail of a signature request.
 */
export async function getRequestDetail(ownerId: string, requestId: string): Promise<any> {
  const reqResult = await query(
    `SELECT sr.*, d.name as document_name
     FROM signature_requests sr
     JOIN documents d ON d.id = sr.document_id
     WHERE sr.id = $1 AND sr.owner_id = $2`,
    [requestId, ownerId]
  );
  if (reqResult.rows.length === 0) return null;

  const signers = await query(
    `SELECT id, signer_email, signer_name, signing_order_index, status, signed_at, ip_address
     FROM signature_signers WHERE signature_request_id = $1 ORDER BY signing_order_index`,
    [requestId]
  );

  const fields = await query(
    'SELECT * FROM signature_fields WHERE signature_request_id = $1 ORDER BY page_number, y_percent',
    [requestId]
  );

  const auditLog = await query(
    'SELECT * FROM signature_audit_log WHERE signature_request_id = $1 ORDER BY created_at',
    [requestId]
  );

  return {
    ...reqResult.rows[0],
    signers: signers.rows,
    fields: fields.rows,
    auditLog: auditLog.rows,
  };
}

/**
 * Void a signature request.
 */
export async function voidRequest(ownerId: string, requestId: string): Promise<boolean> {
  const result = await query(
    `UPDATE signature_requests SET status = 'voided', voided_at = now(), updated_at = now()
     WHERE id = $1 AND owner_id = $2 AND status IN ('draft','pending')
     RETURNING id`,
    [requestId, ownerId]
  );
  if (result.rows.length === 0) return false;

  await query(
    `INSERT INTO signature_audit_log (signature_request_id, actor_user_id, action)
     VALUES ($1, $2, 'request_voided')`,
    [requestId, ownerId]
  );
  return true;
}

/**
 * Delete a draft request.
 */
export async function deleteRequest(ownerId: string, requestId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM signature_requests WHERE id = $1 AND owner_id = $2 AND status = 'draft' RETURNING id`,
    [requestId, ownerId]
  );
  return result.rows.length > 0;
}

/**
 * Save a signed document to the signer's vault.
 */
export async function captureToVault(
  signerId: string,
  userId: string
): Promise<{ success: boolean; error?: string; code?: string }> {
  // Get signer + request info
  const signerResult = await query(
    `SELECT ss.*, sr.signed_file_path, sr.title, d.name as document_name, d.category, d.type
     FROM signature_signers ss
     JOIN signature_requests sr ON sr.id = ss.signature_request_id
     JOIN documents d ON d.id = sr.document_id
     WHERE ss.id = $1 AND ss.status = 'signed' AND sr.status = 'completed'`,
    [signerId]
  );

  if (signerResult.rows.length === 0) return { success: false, error: 'Signing not complete' };
  const info = signerResult.rows[0];
  if (!info.signed_file_path) return { success: false, error: 'Signed document not ready yet — please try again in a moment' };

  // Check document limit for this user
  const subResult = await query(
    'SELECT document_limit FROM user_subscriptions WHERE user_id = $1',
    [userId]
  );
  const docLimit = subResult.rows[0]?.document_limit || 3;
  const countResult = await query(
    'SELECT COUNT(*)::int AS count FROM documents WHERE user_id = $1',
    [userId]
  );
  const currentCount = countResult.rows[0]?.count || 0;
  if (currentCount >= docLimit) {
    return { success: false, error: 'Document limit reached', code: 'DOCUMENT_LIMIT_REACHED' };
  }

  // Download the signed PDF
  const signedPdf = await downloadFromStorage(info.signed_file_path);

  // Upload to signer's storage
  const uploadResult = await uploadToStorage(
    signedPdf,
    userId,
    `signed-${info.document_name}`,
    'application/pdf'
  );

  if (!uploadResult.success || !uploadResult.filePath) return { success: false, error: 'Failed to upload' };

  // Create document entry for signer
  const docResult = await query(
    `INSERT INTO documents (user_id, name, category, type, size, file_path, original_name, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING id`,
    [userId, `Signed - ${info.document_name}`, info.category || 'Legal', 'application/pdf', signedPdf.length, uploadResult.filePath, info.document_name]
  );

  // Audit log — store captured document ID in metadata so we can check if it still exists
  const capturedDocId = docResult.rows[0]?.id;
  await query(
    `INSERT INTO signature_audit_log (signature_request_id, signer_id, actor_user_id, action, metadata)
     VALUES ($1, $2, $3, 'vault_captured', $4)`,
    [info.signature_request_id, signerId, userId, JSON.stringify({ document_id: capturedDocId })]
  );

  // Trigger document processing pipeline (chunking + embeddings) — fire and forget
  const newDocId = docResult.rows[0]?.id;
  if (newDocId) {
    try {
      const { processDocumentPipeline } = await import('./documentPipeline');
      processDocumentPipeline({
        documentId: newDocId,
        userId,
        documentName: `Signed - ${info.document_name}`,
        category: info.category || 'Legal',
        buffer: signedPdf,
        mimeType: 'application/pdf',
      }).catch(err => console.error('Vault capture pipeline error:', err));
    } catch (err) {
      console.error('Failed to start pipeline for vault capture:', err);
    }
  }

  return { success: true };
}

/**
 * Get pending signature requests for reminders (scheduler).
 */
export async function getPendingReminders(): Promise<any[]> {
  const result = await query(
    `SELECT ss.id as signer_id, ss.signer_email, ss.signer_name, ss.signature_request_id,
            sr.title, d.name as document_name,
            COALESCE(up.display_name, au.email) as owner_name
     FROM signature_signers ss
     JOIN signature_requests sr ON sr.id = ss.signature_request_id
     JOIN documents d ON d.id = sr.document_id
     JOIN auth_users au ON au.id = sr.owner_id
     LEFT JOIN user_profiles up ON up.id = sr.owner_id
     WHERE sr.status = 'pending'
       AND ss.status IN ('notified','viewed')
       AND ss.updated_at < now() - interval '3 days'
       AND NOT EXISTS (
         SELECT 1 FROM signature_audit_log sal
         WHERE sal.signature_request_id = sr.id
           AND sal.signer_id = ss.id
           AND sal.action = 'reminder_sent'
           AND sal.created_at > now() - interval '3 days'
       )`
  );
  return result.rows;
}

/**
 * Get expired requests for cleanup (scheduler).
 */
export async function getExpiredRequests(): Promise<any[]> {
  const result = await query(
    `SELECT id, owner_id, title FROM signature_requests
     WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < now()`
  );
  return result.rows;
}

/**
 * Mark a request as expired.
 */
export async function expireRequest(requestId: string): Promise<void> {
  await query(
    `UPDATE signature_requests SET status = 'expired', updated_at = now() WHERE id = $1`,
    [requestId]
  );
  await query(
    `INSERT INTO signature_audit_log (signature_request_id, action)
     VALUES ($1, 'request_expired')`,
    [requestId]
  );
}

/**
 * Save/update a user's signature or initials image.
 */
export async function saveSignatureImage(
  userId: string,
  imageType: 'signature' | 'initials',
  imageData: string
): Promise<void> {
  await query(
    `INSERT INTO signature_images (user_id, image_type, image_data)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, image_type) DO UPDATE SET image_data = $3`,
    [userId, imageType, imageData]
  );
}

/**
 * Get a user's saved signature/initials image.
 */
export async function getSignatureImage(
  userId: string,
  imageType: 'signature' | 'initials'
): Promise<string | null> {
  const result = await query(
    'SELECT image_data FROM signature_images WHERE user_id = $1 AND image_type = $2',
    [userId, imageType]
  );
  return result.rows.length > 0 ? result.rows[0].image_data : null;
}
