import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from 'react-native';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Pen,
  Check,
  Download,
  X,
} from 'lucide-react-native';
import PdfFieldOverlay from './PdfFieldOverlay';
import SignatureInput from './SignatureInput';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { FIELD_TYPE_LABELS } from '../../types/esignature';
import type { EsignField, SignerInfo, RequestInfo, FieldType } from '../../types/esignature';
import * as esignApi from '../../lib/esignatureApi';
import { useAuth } from '../../hooks/useAuth';

interface SigningViewProps {
  /** Token for public signing (from deep link / email) */
  token?: string;
  /** Signer ID for authenticated signing (from vault) */
  signerId?: string;
  onBack: () => void;
  onComplete?: () => void;
}

type Phase = 'loading' | 'invalid' | 'preview' | 'signing' | 'complete';

export default function SigningView({ token, signerId, onBack, onComplete }: SigningViewProps) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');

  // Request/signer info
  const [signerInfo, setSignerInfo] = useState<SignerInfo | null>(null);
  const [requestInfo, setRequestInfo] = useState<RequestInfo | null>(null);

  // Fields
  const [fields, setFields] = useState<EsignField[]>([]);
  const [filledFields, setFilledFields] = useState<Record<string, string>>({});

  // PDF URL
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfAuthToken, setPdfAuthToken] = useState<string | undefined>();

  // Input modals
  const [signatureModal, setSignatureModal] = useState<{ visible: boolean; fieldId: string; type: 'signature' | 'initials' }>({ visible: false, fieldId: '', type: 'signature' });
  const [textModal, setTextModal] = useState<{ visible: boolean; fieldId: string; fieldType: FieldType; value: string }>({ visible: false, fieldId: '', fieldType: 'text_field', value: '' });

  // Completion
  const [isCompleting, setIsCompleting] = useState(false);
  const [vaultCaptureState, setVaultCaptureState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // ── Validate token/signer ─────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        let data;
        if (token) {
          data = await esignApi.validateSigningToken(token);
        } else if (signerId) {
          data = await esignApi.validateSigner(signerId);
        } else {
          setError('No signing token or signer ID provided');
          setPhase('invalid');
          return;
        }

        setSignerInfo(data.data.signer);
        setRequestInfo(data.data.request);

        // If already signed, go straight to complete
        if (data.data.signer.status === 'signed') {
          setPhase('complete');
          return;
        }

        setPhase(token ? 'preview' : 'signing');

        // If going to signing, load fields immediately for authenticated flow
        if (!token) {
          loadFields();
        }
      } catch (err: any) {
        setError(err.message || 'Invalid or expired signing link');
        setPhase('invalid');
      }
    })();
  }, [token, signerId]);

  // ── Load fields + PDF ─────────────────────────────────────────────

  const loadFields = useCallback(async () => {
    try {
      let fieldsData;
      if (token) {
        fieldsData = await esignApi.getTokenFields(token);
        setPdfUrl(esignApi.getTokenDocumentUrl(token));
      } else if (signerId) {
        fieldsData = await esignApi.getSignerFields(signerId);
        const docInfo = await esignApi.getSignerDocumentUrl(signerId);
        setPdfUrl(docInfo.url);
        setPdfAuthToken(docInfo.headers.Authorization?.replace('Bearer ', ''));
      }

      if (fieldsData) {
        setFields(fieldsData.data.fields);
        // Pre-fill from existing values + field memory
        const filled: Record<string, string> = {};
        for (const field of fieldsData.data.fields) {
          if (field.value) {
            filled[field.id] = field.value;
          } else {
            // Try to pre-fill from memory
            const memory = await esignApi.getFieldMemory(field.field_type);
            if (memory && field.field_type !== 'signature' && field.field_type !== 'date_signed' && field.field_type !== 'checkbox') {
              filled[field.id] = memory;
            }
            // Auto-fill date
            if (field.field_type === 'date_signed') {
              const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
              filled[field.id] = today;
              // Auto-submit date field
              if (token) {
                esignApi.fillTokenField(token, field.id, today).catch(() => {});
              } else if (signerId) {
                esignApi.fillSignerField(signerId, field.id, today).catch(() => {});
              }
            }
          }
        }

        // Try to load saved signature from server
        if (user) {
          try {
            const sigImg = await esignApi.getSignatureImage('signature');
            if (sigImg.data.imageData) {
              for (const field of fieldsData.data.fields) {
                if (field.field_type === 'signature' && !filled[field.id]) {
                  filled[field.id] = sigImg.data.imageData;
                }
              }
            }
            const initImg = await esignApi.getSignatureImage('initials');
            if (initImg.data.imageData) {
              for (const field of fieldsData.data.fields) {
                if (field.field_type === 'initials' && !filled[field.id]) {
                  filled[field.id] = initImg.data.imageData;
                }
              }
            }
          } catch {
            // No saved signature — that's fine
          }
        }

        setFilledFields(filled);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load fields');
      setPhase('invalid');
    }
  }, [token, signerId, user]);

  // ── Start signing (from preview) ──────────────────────────────────

  const handleStartSigning = useCallback(async () => {
    await loadFields();
    setPhase('signing');
  }, [loadFields]);

  // ── Fill a field ──────────────────────────────────────────────────

  const fillField = useCallback(async (fieldId: string, value: string, fieldType: FieldType) => {
    // Update local state
    setFilledFields((prev) => ({ ...prev, [fieldId]: value }));

    // Save to memory
    if (!['signature', 'date_signed', 'checkbox'].includes(fieldType)) {
      esignApi.setFieldMemory(fieldType, value);
    }

    // Submit to server
    try {
      if (token) {
        await esignApi.fillTokenField(token, fieldId, value);
      } else if (signerId) {
        await esignApi.fillSignerField(signerId, fieldId, value);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save field');
    }

    // Save signature image to server for persistence
    if (user && (fieldType === 'signature' || fieldType === 'initials')) {
      esignApi.saveSignatureImage(fieldType, value).catch(() => {});
    }
  }, [token, signerId, user]);

  // ── Handle field press ────────────────────────────────────────────

  const handleFieldPress = useCallback((field: EsignField) => {
    switch (field.field_type) {
      case 'signature':
      case 'initials':
        setSignatureModal({ visible: true, fieldId: field.id, type: field.field_type === 'initials' ? 'initials' : 'signature' });
        break;

      case 'checkbox':
        // Toggle
        const current = filledFields[field.id];
        const newValue = current === 'true' ? 'false' : 'true';
        fillField(field.id, newValue, 'checkbox');
        break;

      case 'date_signed':
        // Already auto-filled, but allow re-tap to confirm
        if (!filledFields[field.id]) {
          const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          fillField(field.id, today, 'date_signed');
        }
        break;

      default:
        // Text fields
        setTextModal({
          visible: true,
          fieldId: field.id,
          fieldType: field.field_type,
          value: filledFields[field.id] || '',
        });
        break;
    }
  }, [filledFields, fillField]);

  // ── Complete signing ──────────────────────────────────────────────

  const requiredFields = fields.filter((f) => f.required);
  const filledCount = fields.filter((f) => filledFields[f.id]).length;
  const allRequiredFilled = requiredFields.every((f) => filledFields[f.id]);

  const handleComplete = useCallback(async () => {
    if (!allRequiredFilled) {
      Alert.alert('Incomplete', 'Please fill all required fields before completing.');
      return;
    }

    setIsCompleting(true);
    try {
      let result;
      if (token) {
        result = await esignApi.completeTokenSigning(token);
        // Link account if logged in
        if (user) {
          esignApi.linkTokenAccount(token, user.id).catch(() => {});
        }
      } else if (signerId) {
        result = await esignApi.completeSignerSigning(signerId);
      }

      setPhase('complete');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to complete signing');
    } finally {
      setIsCompleting(false);
    }
  }, [token, signerId, allRequiredFilled, user]);

  // ── Vault capture ─────────────────────────────────────────────────

  const handleVaultCapture = useCallback(async () => {
    if (!user) {
      Alert.alert('Login Required', 'Please log in to save this document to your vault.');
      return;
    }

    setVaultCaptureState('saving');
    try {
      if (token) {
        await esignApi.captureTokenVault(token, user.id);
      } else if (signerId) {
        await esignApi.captureSignerVault(signerId);
      }
      setVaultCaptureState('saved');
    } catch (err: any) {
      if (err.code === 'DOCUMENT_LIMIT_REACHED') {
        Alert.alert('Limit Reached', 'You have reached your document storage limit. Upgrade your plan to save more documents.');
      } else {
        Alert.alert('Error', err.message || 'Failed to save to vault');
      }
      setVaultCaptureState('error');
    }
  }, [token, signerId, user]);

  // ── Render phases ─────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Validating signing link...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'invalid') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <X size={48} color={colors.error[500]} />
          <Text style={styles.errorTitle}>Invalid Link</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onBack}>
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'preview') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <ArrowLeft size={20} color={colors.slate[700]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Signature Request</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.centered}>
          <View style={styles.previewCard}>
            <FileText size={40} color={colors.primary[600]} />
            <Text style={styles.previewTitle}>{requestInfo?.title || 'Document'}</Text>
            <Text style={styles.previewDoc}>{requestInfo?.documentName}</Text>
            <Text style={styles.previewFrom}>From: {requestInfo?.ownerName}</Text>
            {requestInfo?.message && (
              <Text style={styles.previewMessage}>{requestInfo.message}</Text>
            )}
            <TouchableOpacity style={styles.primaryBtn} onPress={handleStartSigning}>
              <Pen size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Review & Sign</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'complete') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <CheckCircle2 size={64} color={colors.primary[600]} />
          <Text style={styles.completeTitle}>Signed!</Text>
          <Text style={styles.completeText}>
            You have successfully signed "{requestInfo?.documentName || 'the document'}".
          </Text>

          {user && vaultCaptureState !== 'saved' && (
            <TouchableOpacity
              style={[styles.secondaryBtn, vaultCaptureState === 'saving' && { opacity: 0.6 }]}
              onPress={handleVaultCapture}
              disabled={vaultCaptureState === 'saving'}
            >
              {vaultCaptureState === 'saving' ? (
                <ActivityIndicator size="small" color={colors.primary[600]} />
              ) : (
                <Download size={16} color={colors.primary[600]} />
              )}
              <Text style={styles.secondaryBtnText}>
                {vaultCaptureState === 'saving' ? 'Saving...' : 'Save to Vault'}
              </Text>
            </TouchableOpacity>
          )}

          {vaultCaptureState === 'saved' && (
            <View style={styles.savedBadge}>
              <Check size={14} color={colors.primary[600]} />
              <Text style={styles.savedBadgeText}>Saved to Vault</Text>
            </View>
          )}

          <TouchableOpacity style={styles.primaryBtn} onPress={onComplete || onBack}>
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Signing phase ─────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.slate[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {requestInfo?.documentName || 'Sign Document'}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${fields.length ? (filledCount / fields.length) * 100 : 0}%` }]}
          />
        </View>
        <Text style={styles.progressText}>
          {filledCount} of {fields.length} fields
        </Text>
      </View>

      {/* PDF with fields */}
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
        {pdfUrl ? (
          <PdfFieldOverlay
            pdfUrl={pdfUrl}
            authToken={pdfAuthToken}
            mode="signing"
            fields={fields}
            filledFields={filledFields}
            onFieldPress={handleFieldPress}
          />
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
          </View>
        )}
      </ScrollView>

      {/* Field list (scrollable bottom sheet) */}
      <View style={styles.fieldListContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fieldListScroll}>
          {fields.map((field) => {
            const isFilled = !!filledFields[field.id];
            return (
              <TouchableOpacity
                key={field.id}
                style={[styles.fieldListItem, isFilled && styles.fieldListItemFilled]}
                onPress={() => handleFieldPress(field)}
              >
                {isFilled ? (
                  <Check size={12} color={colors.primary[600]} />
                ) : (
                  <Pen size={12} color={colors.warning[600]} />
                )}
                <Text
                  style={[styles.fieldListText, isFilled && styles.fieldListTextFilled]}
                  numberOfLines={1}
                >
                  {field.label || FIELD_TYPE_LABELS[field.field_type]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Complete button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.completeBtn, !allRequiredFilled && styles.completeBtnDisabled]}
          onPress={handleComplete}
          disabled={!allRequiredFilled || isCompleting}
        >
          {isCompleting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Check size={18} color="#fff" />
              <Text style={styles.completeBtnText}>Complete Signing</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Signature modal */}
      <SignatureInput
        visible={signatureModal.visible}
        type={signatureModal.type}
        onSave={(data) => {
          fillField(signatureModal.fieldId, data, signatureModal.type === 'initials' ? 'initials' : 'signature');
          setSignatureModal({ visible: false, fieldId: '', type: 'signature' });
        }}
        onCancel={() => setSignatureModal({ visible: false, fieldId: '', type: 'signature' })}
      />

      {/* Text input modal */}
      <Modal visible={textModal.visible} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.textModalOverlay}>
          <View style={styles.textModalContainer}>
            <View style={styles.textModalHeader}>
              <Text style={styles.textModalTitle}>
                {FIELD_TYPE_LABELS[textModal.fieldType] || 'Enter Value'}
              </Text>
              <TouchableOpacity onPress={() => setTextModal({ visible: false, fieldId: '', fieldType: 'text_field', value: '' })}>
                <X size={20} color={colors.slate[500]} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.textModalInput}
              value={textModal.value}
              onChangeText={(text) => setTextModal((prev) => ({ ...prev, value: text }))}
              placeholder={`Enter ${FIELD_TYPE_LABELS[textModal.fieldType]?.toLowerCase() || 'text'}...`}
              placeholderTextColor={colors.slate[400]}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.primaryBtn, !textModal.value.trim() && { opacity: 0.5 }]}
              onPress={() => {
                if (textModal.value.trim()) {
                  fillField(textModal.fieldId, textModal.value.trim(), textModal.fieldType);
                  setTextModal({ visible: false, fieldId: '', fieldType: 'text_field', value: '' });
                }
              }}
              disabled={!textModal.value.trim()}
            >
              <Check size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  loadingText: {
    fontSize: 15,
    color: colors.slate[500],
    marginTop: spacing.md,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.slate[900],
  },
  errorText: {
    fontSize: 14,
    color: colors.slate[500],
    textAlign: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
  },
  backBtn: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.slate[900],
    flex: 1,
    textAlign: 'center',
  },

  // Preview
  previewCard: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing['3xl'],
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.xl,
    width: '100%',
    maxWidth: 360,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.slate[900],
    textAlign: 'center',
  },
  previewDoc: {
    fontSize: 14,
    color: colors.slate[600],
  },
  previewFrom: {
    fontSize: 14,
    color: colors.slate[500],
  },
  previewMessage: {
    fontSize: 13,
    color: colors.slate[500],
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // Progress
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.slate[50],
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.slate[200],
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary[500],
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.slate[500],
  },

  // Field list
  fieldListContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingVertical: spacing.sm,
  },
  fieldListScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  fieldListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warning[200],
    backgroundColor: colors.warning[50],
  },
  fieldListItemFilled: {
    borderColor: colors.primary[200],
    backgroundColor: colors.primary[50],
  },
  fieldListText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.warning[700],
  },
  fieldListTextFilled: {
    color: colors.primary[700],
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  completeBtnDisabled: {
    opacity: 0.5,
  },
  completeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },

  // Complete phase
  completeTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary[600],
  },
  completeText: {
    fontSize: 15,
    color: colors.slate[600],
    textAlign: 'center',
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.md,
  },
  savedBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary[700],
  },

  // Buttons
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary[700],
  },

  // Text modal
  textModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  textModalContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.lg,
    gap: spacing.md,
  },
  textModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  textModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.slate[900],
  },
  textModalInput: {
    borderWidth: 1,
    borderColor: colors.slate[300],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.slate[900],
  },
});
