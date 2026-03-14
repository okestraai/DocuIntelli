import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  Users,
  Grid3X3,
  Pen,
  Send,
  Check,
  CheckCircle2,
} from 'lucide-react-native';
import SignerManager from './SignerManager';
import FieldPlacementView from './FieldPlacementView';
import SignatureInput from './SignatureInput';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { FIELD_TYPE_LABELS } from '../../types/esignature';
import type { SignerEntry, PlacedField, FieldType, SelfSignFieldValue } from '../../types/esignature';
import * as esignApi from '../../lib/esignatureApi';

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

export default function SignatureRequestBuilder({
  documentId,
  documentName,
  pdfUrl,
  userEmail,
  userName,
  onClose,
  onSuccess,
}: SignatureRequestBuilderProps) {
  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('signers');

  // Step 1: Signers
  const [title, setTitle] = useState(documentName);
  const [message, setMessage] = useState('');
  const [signers, setSigners] = useState<SignerEntry[]>([]);
  const [signingOrder, setSigningOrder] = useState<'parallel' | 'sequential'>('parallel');
  const [selectedSignerEmail, setSelectedSignerEmail] = useState<string | null>(null);

  // Step 2: Fields
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [selectedFieldType, setSelectedFieldType] = useState<FieldType | null>(null);

  // Step 3: Self-sign
  const [selfSignValues, setSelfSignValues] = useState<Record<string, string>>({});
  const [signatureModalField, setSignatureModalField] = useState<{ id: string; type: 'signature' | 'initials' } | null>(null);

  // Submission
  const [isSending, setIsSending] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Determine if owner is a signer and has fields
  const ownerIsSigner = signers.some((s) => s.email === userEmail);
  const ownerFields = useMemo(
    () => fields.filter((f) => f.signerEmail === userEmail),
    [fields, userEmail]
  );
  const needsSelfSign = ownerIsSigner && ownerFields.length > 0;

  // Steps flow
  const steps = useMemo((): Step[] => {
    const s: Step[] = ['signers', 'fields'];
    if (needsSelfSign) s.push('selfsign');
    s.push('review');
    return s;
  }, [needsSelfSign]);

  const stepIndex = steps.indexOf(currentStep);
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;

  const STEP_LABELS: Record<Step, { label: string; icon: typeof Users }> = {
    signers: { label: 'Signers', icon: Users },
    fields: { label: 'Fields', icon: Grid3X3 },
    selfsign: { label: 'Self-Sign', icon: Pen },
    review: { label: 'Review', icon: Send },
  };

  // ── Navigation ────────────────────────────────────────────────────

  const canGoNext = useCallback(() => {
    switch (currentStep) {
      case 'signers':
        return title.trim() && signers.length > 0;
      case 'fields':
        return fields.length > 0;
      case 'selfsign':
        return ownerFields.every((f) => {
          if (f.fieldType === 'date_signed') return true; // auto-filled
          return !!selfSignValues[f.id];
        });
      case 'review':
        return true;
      default:
        return false;
    }
  }, [currentStep, title, signers, fields, ownerFields, selfSignValues]);

  const goNext = () => {
    if (!canGoNext()) return;
    const nextIdx = stepIndex + 1;
    if (nextIdx < steps.length) {
      const nextStep = steps[nextIdx];
      // Auto-fill self-sign defaults when entering selfsign step
      if (nextStep === 'selfsign') {
        const defaults: Record<string, string> = {};
        for (const field of ownerFields) {
          if (field.fieldType === 'date_signed') {
            defaults[field.id] = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          } else if (field.fieldType === 'full_name' && userName) {
            defaults[field.id] = userName;
          } else if (field.fieldType === 'checkbox') {
            defaults[field.id] = 'true';
          } else if (field.fieldType === 'initials' && userName) {
            // Generate initials from name
            defaults[field.id] = userName.split(' ').map((w) => w[0]).join('').toUpperCase();
          }
        }
        setSelfSignValues((prev) => ({ ...defaults, ...prev }));
      }
      setCurrentStep(nextStep);
    }
  };

  const goBack = () => {
    if (isFirstStep) {
      onClose();
      return;
    }
    setCurrentStep(steps[stepIndex - 1]);
  };

  // ── Submit ────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setIsSending(true);
    try {
      // Create request
      const createRes = await esignApi.createRequest({
        documentId,
        title: title.trim(),
        message: message.trim() || undefined,
        signingOrder,
        signers,
        fields: fields.map((f) => ({
          signerEmail: f.signerEmail,
          fieldType: f.fieldType,
          pageNumber: f.pageNumber,
          xPercent: f.xPercent,
          yPercent: f.yPercent,
          widthPercent: f.widthPercent,
          heightPercent: f.heightPercent,
          label: f.label,
        })),
      });

      const requestId = createRes.data.requestId;

      // Send request
      await esignApi.sendRequest(requestId, documentName);

      // Self-sign if needed
      if (needsSelfSign) {
        const fieldValues: SelfSignFieldValue[] = ownerFields.map((f) => ({
          fieldType: f.fieldType,
          pageNumber: f.pageNumber,
          value: selfSignValues[f.id] || '',
        }));
        await esignApi.selfSign(requestId, fieldValues);
      }

      setIsComplete(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send request');
    } finally {
      setIsSending(false);
    }
  };

  // ── Complete screen ───────────────────────────────────────────────

  if (isComplete) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <CheckCircle2 size={64} color={colors.primary[600]} />
          <Text style={styles.completeTitle}>Sent!</Text>
          <Text style={styles.completeText}>
            Your signature request has been sent to {signers.length} signer{signers.length !== 1 ? 's' : ''}.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onSuccess}>
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ───────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.slate[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{documentName}</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Step indicator */}
      <View style={styles.stepRow}>
        {steps.map((step, idx) => {
          const { label, icon: Icon } = STEP_LABELS[step];
          const isActive = idx === stepIndex;
          const isDone = idx < stepIndex;
          return (
            <View key={step} style={styles.stepItem}>
              <View style={[styles.stepCircle, isActive && styles.stepCircleActive, isDone && styles.stepCircleDone]}>
                {isDone ? (
                  <Check size={12} color="#fff" />
                ) : (
                  <Icon size={12} color={isActive ? '#fff' : colors.slate[400]} />
                )}
              </View>
              <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{label}</Text>
            </View>
          );
        })}
      </View>

      {/* Content */}
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {currentStep === 'signers' && (
          <View style={styles.stepContent}>
            <Text style={styles.sectionLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Request title"
              placeholderTextColor={colors.slate[400]}
            />

            <Text style={styles.sectionLabel}>Message (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              placeholder="Add a message for signers..."
              placeholderTextColor={colors.slate[400]}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.sectionLabel}>Signers</Text>
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
          </View>
        )}

        {currentStep === 'fields' && (
          <View style={styles.flex}>
            {!selectedSignerEmail && (
              <View style={styles.hintBanner}>
                <Text style={styles.hintText}>Select a signer, then a field type, then tap on the PDF to place it.</Text>
              </View>
            )}
            {/* Signer selector for field assignment */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.signerChips}>
              {signers.map((s, idx) => {
                const isSelected = selectedSignerEmail === s.email;
                const color = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][idx % 5];
                return (
                  <TouchableOpacity
                    key={s.email}
                    style={[styles.signerChip, isSelected && { borderColor: color, backgroundColor: `${color}15` }]}
                    onPress={() => setSelectedSignerEmail(isSelected ? null : s.email)}
                  >
                    <View style={[styles.signerChipDot, { backgroundColor: color }]} />
                    <Text style={[styles.signerChipText, isSelected && { color }]}>{s.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <FieldPlacementView
              pdfUrl={pdfUrl}
              signers={signers}
              fields={fields}
              onFieldsChange={setFields}
              selectedFieldType={selectedFieldType}
              onSelectFieldType={setSelectedFieldType}
              selectedSignerEmail={selectedSignerEmail}
            />
          </View>
        )}

        {currentStep === 'selfsign' && (
          <View style={styles.stepContent}>
            <Text style={styles.sectionLabel}>Fill Your Fields</Text>
            {ownerFields.map((field) => {
              const value = selfSignValues[field.id] || '';
              const label = FIELD_TYPE_LABELS[field.fieldType] || field.fieldType;

              if (field.fieldType === 'signature' || field.fieldType === 'initials') {
                return (
                  <View key={field.id} style={styles.selfSignField}>
                    <Text style={styles.fieldLabel}>{label}</Text>
                    <TouchableOpacity
                      style={[styles.signatureBtn, value && styles.signatureBtnFilled]}
                      onPress={() => setSignatureModalField({ id: field.id, type: field.fieldType === 'initials' ? 'initials' : 'signature' })}
                    >
                      <Pen size={14} color={value ? colors.primary[600] : colors.slate[500]} />
                      <Text style={[styles.signatureBtnText, value && { color: colors.primary[600] }]}>
                        {value ? 'Change' : 'Tap to sign'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              if (field.fieldType === 'checkbox') {
                return (
                  <View key={field.id} style={styles.selfSignField}>
                    <Text style={styles.fieldLabel}>{label}</Text>
                    <TouchableOpacity
                      style={styles.checkboxBtn}
                      onPress={() =>
                        setSelfSignValues((prev) => ({ ...prev, [field.id]: prev[field.id] === 'true' ? 'false' : 'true' }))
                      }
                    >
                      <View style={[styles.checkbox, value === 'true' && styles.checkboxChecked]}>
                        {value === 'true' && <Check size={12} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              }

              if (field.fieldType === 'date_signed') {
                return (
                  <View key={field.id} style={styles.selfSignField}>
                    <Text style={styles.fieldLabel}>{label}</Text>
                    <Text style={styles.dateValue}>{value || 'Auto-filled'}</Text>
                  </View>
                );
              }

              return (
                <View key={field.id} style={styles.selfSignField}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={(text) => setSelfSignValues((prev) => ({ ...prev, [field.id]: text }))}
                    placeholder={`Enter ${label.toLowerCase()}`}
                    placeholderTextColor={colors.slate[400]}
                  />
                </View>
              );
            })}
          </View>
        )}

        {currentStep === 'review' && (
          <View style={styles.stepContent}>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Document</Text>
              <Text style={styles.reviewValue}>{documentName}</Text>
            </View>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Title</Text>
              <Text style={styles.reviewValue}>{title}</Text>
            </View>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Signers</Text>
              {signers.map((s) => (
                <Text key={s.email} style={styles.reviewValue}>{s.name} ({s.email})</Text>
              ))}
            </View>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Fields</Text>
              <Text style={styles.reviewValue}>{fields.length} fields placed</Text>
            </View>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Signing Order</Text>
              <Text style={styles.reviewValue}>{signingOrder === 'parallel' ? 'All at once' : 'Sequential'}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom nav */}
      <View style={styles.bottomBar}>
        {isLastStep ? (
          <TouchableOpacity
            style={[styles.primaryBtn, isSending && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Send size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Send Request</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryBtn, !canGoNext() && { opacity: 0.5 }]}
            onPress={goNext}
            disabled={!canGoNext()}
          >
            <Text style={styles.primaryBtnText}>Next</Text>
            <ArrowRight size={16} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Signature capture modal */}
      {signatureModalField && (
        <SignatureInput
          visible
          type={signatureModalField.type}
          onSave={(data) => {
            setSelfSignValues((prev) => ({ ...prev, [signatureModalField.id]: data }));
            setSignatureModalField(null);
          }}
          onCancel={() => setSignatureModalField(null)}
        />
      )}
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
    fontSize: 15,
    fontWeight: '700',
    color: colors.slate[900],
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.md,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate[500],
  },

  // Steps
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.slate[50],
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
  },
  stepItem: {
    alignItems: 'center',
    gap: 4,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.slate[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: colors.primary[600],
  },
  stepCircleDone: {
    backgroundColor: colors.primary[500],
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.slate[400],
  },
  stepLabelActive: {
    color: colors.primary[700],
  },

  // Content
  stepContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.slate[800],
  },
  input: {
    borderWidth: 1,
    borderColor: colors.slate[300],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.slate[900],
    backgroundColor: colors.white,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Field placement hints
  hintBanner: {
    backgroundColor: colors.info[50],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.info[200],
  },
  hintText: {
    fontSize: 12,
    color: colors.info[700],
    textAlign: 'center',
  },
  signerChips: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  signerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  signerChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  signerChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.slate[600],
  },

  // Self-sign
  selfSignField: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.slate[700],
  },
  signatureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.slate[300],
    borderStyle: 'dashed',
  },
  signatureBtnFilled: {
    borderColor: colors.primary[300],
    borderStyle: 'solid',
    backgroundColor: colors.primary[50],
  },
  signatureBtnText: {
    fontSize: 14,
    color: colors.slate[500],
  },
  checkboxBtn: {
    paddingVertical: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.slate[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  dateValue: {
    fontSize: 14,
    color: colors.slate[600],
    fontStyle: 'italic',
  },

  // Review
  reviewCard: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.slate[50],
    gap: 4,
  },
  reviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.slate[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reviewValue: {
    fontSize: 14,
    color: colors.slate[800],
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
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },

  // Complete
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
});
