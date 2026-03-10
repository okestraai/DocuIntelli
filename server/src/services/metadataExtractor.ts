/**
 * DocuIntelli AI — LLM Metadata Extraction Service
 *
 * After text extraction creates document chunks, this service uses vLLM
 * to extract structured metadata (issuer, owner, policy number, address, dates)
 * from the document content. Runs in parallel with embedding generation —
 * reads only chunk_text, never touches embeddings.
 */

import { query } from './db';
import { sendNotificationEmail, resolveUserInfo } from './emailService';

// ─── vLLM Configuration ────────────────────────────────────────────────────────

const VLLM_CHAT_URL = process.env.VLLM_CHAT_URL || 'https://vllm-chat.docuintelli.com';

function getCfHeaders(): Record<string, string> {
  const cfId = process.env.CF_ACCESS_CLIENT_ID;
  const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!cfId || !cfSecret) return {};
  return {
    'CF-Access-Client-Id': cfId,
    'CF-Access-Client-Secret': cfSecret,
  };
}

// ─── Extraction Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert document analyst. Your task is to extract structured metadata from the provided document content.

Return ONLY a valid JSON object with these exact keys:
- "issuer": the company, organization, or entity that issued/created the document (string or null)
- "owner_name": the person(s) named as the policy holder, account owner, tenant, employee, or primary party (string or null)
- "policy_number": any document number, policy number, contract number, account number, or reference ID (string or null)
- "address": the most relevant address found (property address, mailing address, or service address) (string or null)
- "effective_date": the start date, effective date, or issue date in YYYY-MM-DD format (string or null)
- "expiration_date": the end date, expiration date, or renewal date in YYYY-MM-DD format (string or null)

Rules:
- If a field cannot be determined from the content, set it to null
- For dates, always use YYYY-MM-DD format
- For owner_name, include all named holders separated by " & " if multiple
- Return ONLY the JSON object, no markdown, no explanation`;

function buildUserPrompt(docName: string, category: string, text: string): string {
  return `Document name: ${docName}
Category: ${category}

Document content:
${text}

Extract the metadata as a JSON object.`;
}

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ExtractedFields {
  issuer: string | null;
  owner_name: string | null;
  policy_number: string | null;
  address: string | null;
  effective_date: string | null;
  expiration_date: string | null;
}

// ─── Main Extraction Function ───────────────────────────────────────────────────

/**
 * Extract structured metadata from a document using vLLM.
 * Runs independently of the embedding pipeline — reads chunk_text only.
 */
export async function extractDocumentMetadata(
  documentId: string,
  userId: string,
  documentName: string,
  category: string,
): Promise<void> {
  console.log(`🔍 Starting metadata extraction for: ${documentId}`);

  // 1. Fetch first 10 text chunks (same pattern as tag generation)
  const chunksResult = await query(
    `SELECT chunk_text FROM document_chunks
     WHERE document_id = $1
     ORDER BY chunk_index ASC
     LIMIT 10`,
    [documentId],
  );

  if (!chunksResult.rows.length) {
    console.warn(`⚠️ No chunks found for metadata extraction: ${documentId}`);
    return;
  }

  const sampleText = chunksResult.rows.map((r: any) => r.chunk_text).join('\n\n');

  // 2. Call vLLM Chat API
  const cfHeaders = getCfHeaders();
  if (!cfHeaders['CF-Access-Client-Id']) {
    console.warn('⚠️ Cloudflare Access credentials not configured — skipping metadata extraction');
    return;
  }

  const response = await fetch(`${VLLM_CHAT_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...cfHeaders,
    },
    body: JSON.stringify({
      model: 'hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(documentName, category, sampleText) },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`vLLM Chat API error: ${response.status} — ${errText}`);
  }

  const chatData = (await response.json()) as any;
  const rawContent = chatData.choices?.[0]?.message?.content?.trim() || '{}';
  console.log(`🔍 Metadata extraction raw response: ${rawContent.substring(0, 200)}`);

  // 3. Parse the JSON response
  const fields = parseExtractedFields(rawContent);

  // 4. Write to document columns (COALESCE to preserve any user-set values)
  await query(
    `UPDATE documents SET
       issuer = COALESCE($1, issuer),
       owner_name = COALESCE($2, owner_name),
       policy_number = COALESCE($3, policy_number),
       address = COALESCE($4, address),
       effective_date = COALESCE($5::date, effective_date),
       expiration_date = COALESCE($6::date, expiration_date),
       extracted_metadata = $7,
       metadata_confirmed = false
     WHERE id = $8 AND user_id = $9`,
    [
      fields.issuer,
      fields.owner_name,
      fields.policy_number,
      fields.address,
      fields.effective_date,
      fields.expiration_date,
      JSON.stringify({ raw: rawContent, parsed: fields, extractedAt: new Date().toISOString() }),
      documentId,
      userId,
    ],
  );

  console.log(`✅ Metadata extracted and saved for: ${documentId}`);

  // 5. Build list of fields that were actually found
  const fieldsExtracted: string[] = [];
  if (fields.issuer) fieldsExtracted.push('Issuer');
  if (fields.owner_name) fieldsExtracted.push('Owner / Holder');
  if (fields.policy_number) fieldsExtracted.push('Policy / Contract Number');
  if (fields.address) fieldsExtracted.push('Address');
  if (fields.effective_date) fieldsExtracted.push('Effective Date');
  if (fields.expiration_date) fieldsExtracted.push('Expiration Date');

  // 6. Create in-app notification
  await query(
    `INSERT INTO in_app_notifications (user_id, type, title, message, metadata)
     VALUES ($1, 'system', $2, $3, $4)`,
    [
      userId,
      'Details Extracted',
      fieldsExtracted.length > 0
        ? `We found ${fieldsExtracted.length} detail${fieldsExtracted.length !== 1 ? 's' : ''} in "${documentName}". Review and confirm.`
        : `"${documentName}" has been analyzed. Add details manually to keep your vault complete.`,
      JSON.stringify({ documentId, fieldsExtracted }),
    ],
  );

  // 7. Send email notification
  const userInfo = await resolveUserInfo(userId);
  if (userInfo) {
    await sendNotificationEmail(userId, 'metadata_extracted', {
      userName: userInfo.userName,
      documentName,
      category,
      fieldsExtracted,
    }).catch(err => console.error('📧 Metadata extraction email error:', err.message));
  }
}

// ─── JSON Parser with Fallbacks ─────────────────────────────────────────────────

function parseExtractedFields(raw: string): ExtractedFields {
  const defaults: ExtractedFields = {
    issuer: null,
    owner_name: null,
    policy_number: null,
    address: null,
    effective_date: null,
    expiration_date: null,
  };

  try {
    // Try to extract JSON from possible markdown code fence
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return defaults;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      issuer: typeof parsed.issuer === 'string' && parsed.issuer.trim() ? parsed.issuer.trim() : null,
      owner_name: typeof parsed.owner_name === 'string' && parsed.owner_name.trim() ? parsed.owner_name.trim() : null,
      policy_number: typeof parsed.policy_number === 'string' && parsed.policy_number.trim() ? parsed.policy_number.trim() : null,
      address: typeof parsed.address === 'string' && parsed.address.trim() ? parsed.address.trim() : null,
      effective_date: isValidDate(parsed.effective_date) ? parsed.effective_date : null,
      expiration_date: isValidDate(parsed.expiration_date) ? parsed.expiration_date : null,
    };
  } catch {
    console.warn('⚠️ Failed to parse metadata extraction response, using defaults');
    return defaults;
  }
}

function isValidDate(val: unknown): val is string {
  if (typeof val !== 'string' || !val.trim()) return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
}
