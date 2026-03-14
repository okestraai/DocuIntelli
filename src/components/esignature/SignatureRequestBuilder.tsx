import React, { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Send, Loader2, CheckCircle2, X, FileSignature, PenLine, Calendar, User, Type } from 'lucide-react';
import { SignerManager, type SignerEntry } from './SignerManager';
import { FieldPalette } from './FieldPalette';
import { FieldPlacementCanvas, type PlacedField } from './FieldPlacementCanvas';
import { SignatureInput } from './SignatureInput';
import { auth } from '../../lib/auth';

interface SignatureRequestBuilderProps {
  documentId: string;
  documentName: string;
  pdfUrl: string;
  userEmail?: string;
  userName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'signers' | 'fields' | 'selfsign' | 'review';

const FIELD_LABELS: Record<string, string> = {
  signature: 'Signature',
  full_name: 'Full Name',
  initials: 'Initials',
  date_signed: 'Date Signed',
  text_field: 'Text Field',
  checkbox: 'Checkbox',
  title_role: 'Title/Role',
  company_name: 'Company Name',
  custom_text: 'Custom Text',
};

export function SignatureRequestBuilder({ documentId, documentName, pdfUrl, userEmail, userName, onClose, onSuccess }: SignatureRequestBuilderProps) {
  const [step, setStep] = useState<Step>('signers');
  const [signers, setSigners] = useState<SignerEntry[]>([]);
  const [signingOrder, setSigningOrder] = useState<'parallel' | 'sequential'>('parallel');
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [selectedFieldType, setSelectedFieldType] = useState<string | null>(null);
  const [selectedSignerEmail, setSelectedSignerEmail] = useState<string | null>(null);
  const [title, setTitle] = useState(documentName);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Self-sign state: values for fields assigned to the owner
  const [selfSignValues, setSelfSignValues] = useState<Record<string, string>>({});
  const [showSignatureModal, setShowSignatureModal] = useState<string | null>(null); // fieldId for signature capture

  // Check if owner is also a signer
  const ownerIsSigner = useMemo(
    () => userEmail ? signers.some(s => s.email.toLowerCase() === userEmail.toLowerCase()) : false,
    [signers, userEmail]
  );

  // Get fields assigned to the owner
  const ownerFields = useMemo(
    () => userEmail ? fields.filter(f => f.signerEmail.toLowerCase() === userEmail.toLowerCase()) : [],
    [fields, userEmail]
  );

  // Dynamic steps based on whether owner is a signer
  const steps: Step[] = useMemo(() => {
    const base: Step[] = ['signers', 'fields'];
    if (ownerIsSigner && ownerFields.length > 0) base.push('selfsign');
    base.push('review');
    return base;
  }, [ownerIsSigner, ownerFields.length]);

  const stepIndex = steps.indexOf(step);

  const STEP_LABELS: Record<Step, string> = {
    signers: 'Add Signers',
    fields: 'Place Fields',
    selfsign: 'Sign Your Fields',
    review: 'Review & Send',
  };

  const canProceedFromSigners = signers.length > 0;
  const canProceedFromFields = fields.length > 0 && signers.every(s =>
    fields.some(f => f.signerEmail === s.email)
  );

  // Check all required self-sign fields are filled
  const canProceedFromSelfSign = useMemo(() => {
    return ownerFields.every(f => {
      const val = selfSignValues[f.id];
      if (f.fieldType === 'checkbox') return true; // checkbox can be unchecked
      return val && val.trim().length > 0;
    });
  }, [ownerFields, selfSignValues]);

  const handleNext = useCallback(() => {
    const nextStep = steps[stepIndex + 1];
    if (!nextStep) return;

    if (step === 'signers' && !canProceedFromSigners) return;
    if (step === 'fields' && !canProceedFromFields) return;
    if (step === 'selfsign' && !canProceedFromSelfSign) return;

    // Auto-fill known values when entering selfsign step
    if (nextStep === 'selfsign') {
      const autoFilled: Record<string, string> = { ...selfSignValues };
      const ownerName = userName || (userEmail ? userEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '');
      for (const f of ownerFields) {
        if (autoFilled[f.id]) continue; // don't overwrite user edits
        switch (f.fieldType) {
          case 'full_name': autoFilled[f.id] = ownerName; break;
          case 'date_signed': autoFilled[f.id] = new Date().toLocaleDateString(); break;
          case 'initials': autoFilled[f.id] = ownerName.split(' ').map(w => w[0]).join('').toUpperCase(); break;
          case 'checkbox': autoFilled[f.id] = autoFilled[f.id] || 'false'; break;
        }
      }
      setSelfSignValues(autoFilled);
    }

    setStep(nextStep);
  }, [step, steps, stepIndex, canProceedFromSigners, canProceedFromFields, canProceedFromSelfSign, ownerFields, selfSignValues, userName, userEmail]);

  const handleBack = useCallback(() => {
    const prevStep = steps[stepIndex - 1];
    if (prevStep) setStep(prevStep);
  }, [steps, stepIndex]);

  const handleSend = useCallback(async () => {
    setIsSending(true);
    setError(null);
    try {
      const { data: { session } } = await auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

      // Create the request
      const createRes = await fetch(`${API_BASE}/api/esignature/requests`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
          title,
          message: message || null,
          signingOrder,
          signers: signers.map(s => ({ name: s.name, email: s.email, orderIndex: s.orderIndex })),
          fields: fields.map(f => ({
            signerEmail: f.signerEmail,
            fieldType: f.fieldType,
            pageNumber: f.pageNumber,
            xPercent: f.xPercent,
            yPercent: f.yPercent,
            widthPercent: f.widthPercent,
            heightPercent: f.heightPercent,
            label: f.label || null,
          })),
        }),
      });

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create signature request');
      }

      const { data } = await createRes.json();

      // Send the request (locks doc, generates tokens, sends emails to non-self signers)
      const sendRes = await fetch(`${API_BASE}/api/esignature/requests/${data.requestId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentName }),
      });

      if (!sendRes.ok) {
        const errData = await sendRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send signature request');
      }

      // If owner is a signer, self-sign their fields
      if (ownerIsSigner && ownerFields.length > 0 && Object.keys(selfSignValues).length > 0) {
        // Sort owner fields by page + y position (same order as DB query)
        const sortedOwnerFields = [...ownerFields].sort((a, b) =>
          a.pageNumber !== b.pageNumber ? a.pageNumber - b.pageNumber : a.yPercent - b.yPercent
        );

        const selfSignRes = await fetch(`${API_BASE}/api/esignature/requests/${data.requestId}/self-sign`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fieldValues: sortedOwnerFields.map(f => ({
              fieldType: f.fieldType,
              pageNumber: f.pageNumber,
              value: selfSignValues[f.id] || '',
            })),
          }),
        });

        if (!selfSignRes.ok) {
          console.warn('Self-sign failed, but request was sent:', await selfSignRes.text());
        }
      }

      setIsSent(true);
      setTimeout(() => onSuccess(), 2000);
    } catch (err: any) {
      console.error('Send signature request error:', err);
      setError(err.message || 'Failed to send request');
    } finally {
      setIsSending(false);
    }
  }, [documentId, documentName, title, message, signingOrder, signers, fields, onSuccess, ownerIsSigner, ownerFields, selfSignValues]);

  if (isSent) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Signature Request Sent!</h2>
          <p className="text-slate-500">
            {ownerIsSigner
              ? `Your signature has been captured. ${signers.length - 1} other signer${signers.length - 1 !== 1 ? 's' : ''} will receive an email invitation.`
              : `${signers.length} signer${signers.length !== 1 ? 's' : ''} will receive an email invitation.`
            }
          </p>
        </div>
      </div>
    );
  }

  const renderSelfSignField = (field: PlacedField) => {
    const value = selfSignValues[field.id] || '';

    if (field.fieldType === 'signature') {
      return (
        <div key={field.id} className="bg-white border border-slate-200 rounded-xl p-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {FIELD_LABELS[field.fieldType]}
          </label>
          {value ? (
            <div className="flex items-center gap-3">
              <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
                <img src={value} alt="Signature" className="h-12 object-contain" />
              </div>
              <button
                onClick={() => setShowSignatureModal(field.id)}
                className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSignatureModal(field.id)}
              className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-emerald-300 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors w-full justify-center"
            >
              <PenLine className="h-4 w-4" />
              Add Your Signature
            </button>
          )}
        </div>
      );
    }

    if (field.fieldType === 'checkbox') {
      return (
        <div key={field.id} className="bg-white border border-slate-200 rounded-xl p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={value === 'true'}
              onChange={e => setSelfSignValues(prev => ({ ...prev, [field.id]: e.target.checked ? 'true' : 'false' }))}
              className="w-5 h-5 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
            />
            <span className="text-sm font-medium text-slate-700">{field.label || 'Checkbox'}</span>
          </label>
        </div>
      );
    }

    if (field.fieldType === 'date_signed') {
      return (
        <div key={field.id} className="bg-white border border-slate-200 rounded-xl p-4">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Date Signed</span>
          </label>
          <input
            type="text"
            value={value}
            readOnly
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-600"
          />
          <p className="text-[11px] text-slate-400 mt-1">Auto-filled with today's date</p>
        </div>
      );
    }

    // Text-based fields: full_name, initials (typed), text_field, title_role, company_name, custom_text
    const icon = field.fieldType === 'full_name' ? <User className="h-3.5 w-3.5" /> :
                 field.fieldType === 'initials' ? <Type className="h-3.5 w-3.5" /> : null;

    return (
      <div key={field.id} className="bg-white border border-slate-200 rounded-xl p-4">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          <span className="flex items-center gap-1.5">{icon} {FIELD_LABELS[field.fieldType] || field.fieldType}</span>
        </label>
        <input
          type="text"
          value={value}
          onChange={e => setSelfSignValues(prev => ({ ...prev, [field.id]: e.target.value }))}
          placeholder={`Enter your ${(FIELD_LABELS[field.fieldType] || field.fieldType).toLowerCase()}`}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
        />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-slate-900">Get Signature</h2>
          </div>
          <span className="text-sm text-slate-400">— {documentName}</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 ${i <= stepIndex ? 'text-emerald-600' : 'text-slate-300'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < stepIndex ? 'bg-emerald-600 text-white' :
                  i === stepIndex ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-600' :
                  'bg-slate-100 text-slate-400'
                }`}>
                  {i < stepIndex ? '✓' : i + 1}
                </div>
                <span className={`text-sm font-medium hidden sm:inline ${i === stepIndex ? 'text-emerald-700' : ''}`}>
                  {STEP_LABELS[s]}
                </span>
              </div>
              {i < steps.length - 1 && <div className={`w-8 h-0.5 ${i < stepIndex ? 'bg-emerald-600' : 'bg-slate-200'}`} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {step === 'signers' && (
          <div className="flex-1 flex items-start justify-center p-8 overflow-auto">
            <div className="w-full max-w-md space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Request Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Message (optional)</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Add a message for the signers..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Signers</label>
                <SignerManager
                  signers={signers}
                  onSignersChange={setSigners}
                  signingOrder={signingOrder}
                  onSigningOrderChange={setSigningOrder}
                  selectedSignerEmail={selectedSignerEmail}
                  onSelectSigner={setSelectedSignerEmail}
                  currentUserEmail={userEmail}
                  currentUserName={userName}
                />
              </div>
            </div>
          </div>
        )}

        {step === 'fields' && (
          <>
            {/* Left sidebar: Field palette + signer selection */}
            <div className="w-64 border-r border-slate-200 p-4 overflow-y-auto bg-white space-y-6">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Assign To</p>
                <div className="space-y-1">
                  {signers.map(signer => (
                    <button
                      key={signer.email}
                      onClick={() => setSelectedSignerEmail(signer.email)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedSignerEmail === signer.email
                          ? 'bg-emerald-50 text-emerald-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {signer.name}
                      {userEmail && signer.email.toLowerCase() === userEmail.toLowerCase() && (
                        <span className="text-[10px] text-emerald-500 ml-1">(You)</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <FieldPalette
                selectedFieldType={selectedFieldType}
                onSelectFieldType={setSelectedFieldType}
              />
              {!selectedSignerEmail && selectedFieldType && (
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  Select a signer first, then click on the document to place the field.
                </p>
              )}
            </div>

            {/* PDF Canvas */}
            <div className="flex-1 overflow-hidden">
              <FieldPlacementCanvas
                pdfUrl={pdfUrl}
                signers={signers}
                fields={fields}
                onFieldsChange={setFields}
                selectedFieldType={selectedFieldType}
                selectedSignerEmail={selectedSignerEmail}
              />
            </div>
          </>
        )}

        {step === 'selfsign' && (
          <div className="flex-1 flex items-start justify-center p-8 overflow-auto">
            <div className="w-full max-w-md space-y-4">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <PenLine className="h-6 w-6 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Sign Your Fields</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Complete your {ownerFields.length} field{ownerFields.length !== 1 ? 's' : ''} before sending
                </p>
              </div>

              {ownerFields.map(field => renderSelfSignField(field))}
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="flex-1 flex items-start justify-center p-8 overflow-auto">
            <div className="w-full max-w-lg space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">Review & Send</h3>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Document</span>
                    <span className="text-slate-900 font-medium">{documentName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Title</span>
                    <span className="text-slate-900 font-medium">{title}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Signing Order</span>
                    <span className="text-slate-900 font-medium capitalize">{signingOrder}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Fields</span>
                    <span className="text-slate-900 font-medium">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                <hr className="border-slate-100" />

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Signers ({signers.length})</p>
                  {signers.map(signer => {
                    const signerFields = fields.filter(f => f.signerEmail === signer.email);
                    const isSelf = userEmail && signer.email.toLowerCase() === userEmail.toLowerCase();
                    return (
                      <div key={signer.email} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-slate-800">{signer.name}</p>
                            {isSelf && <span className="text-[10px] font-medium text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">You — signed</span>}
                          </div>
                          <p className="text-xs text-slate-400">{signer.email}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">
                            {signerFields.map(f => FIELD_LABELS[f.fieldType] || f.fieldType).join(', ')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {message && (
                  <>
                    <hr className="border-slate-100" />
                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-1">Message</p>
                      <p className="text-sm text-slate-500">{message}</p>
                    </div>
                  </>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <p className="text-xs text-slate-400 text-center">
                {ownerIsSigner
                  ? 'Your signature will be applied immediately. Other signers will receive an email with a secure link to sign.'
                  : 'Each signer will receive an email with a secure link to review and sign the document.'
                }
                {' '}A tamper-resistant audit trail will be appended to the signed document.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
        <button
          onClick={stepIndex === 0 ? onClose : handleBack}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {stepIndex === 0 ? 'Cancel' : 'Back'}
        </button>

        {step !== 'review' ? (
          <button
            onClick={handleNext}
            disabled={
              (step === 'signers' && !canProceedFromSigners) ||
              (step === 'fields' && !canProceedFromFields) ||
              (step === 'selfsign' && !canProceedFromSelfSign)
            }
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 rounded-lg shadow-sm transition-all"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={isSending}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 rounded-lg shadow-sm transition-all"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {ownerIsSigner ? 'Sign & Send' : 'Send Request'}
              </>
            )}
          </button>
        )}
      </div>

      {/* Signature capture modal */}
      {showSignatureModal && (
        <SignatureInput
          onSave={(imageData) => {
            setSelfSignValues(prev => ({ ...prev, [showSignatureModal]: imageData }));
            setShowSignatureModal(null);
          }}
          onCancel={() => setShowSignatureModal(null)}
        />
      )}
    </div>
  );
}
