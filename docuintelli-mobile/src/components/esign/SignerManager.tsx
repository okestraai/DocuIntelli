import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
} from 'react-native';
import { Plus, X, UserPlus, Users } from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { SIGNER_COLORS } from '../../types/esignature';
import type { SignerEntry } from '../../types/esignature';

interface SignerManagerProps {
  signers: SignerEntry[];
  onSignersChange: (signers: SignerEntry[]) => void;
  signingOrder: 'parallel' | 'sequential';
  onSigningOrderChange: (order: 'parallel' | 'sequential') => void;
  selectedSignerEmail: string | null;
  onSelectSigner: (email: string | null) => void;
  currentUserEmail?: string;
  currentUserName?: string;
}

export default function SignerManager({
  signers,
  onSignersChange,
  signingOrder,
  onSigningOrderChange,
  selectedSignerEmail,
  onSelectSigner,
  currentUserEmail,
  currentUserName,
}: SignerManagerProps) {
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const addSigner = () => {
    const name = newName.trim();
    const email = newEmail.trim().toLowerCase();
    if (!name || !email) return;
    if (signers.some((s) => s.email === email)) return;

    onSignersChange([
      ...signers,
      { name, email, orderIndex: signers.length },
    ]);
    setNewName('');
    setNewEmail('');
  };

  const addMyself = () => {
    if (!currentUserEmail || !currentUserName) return;
    if (signers.some((s) => s.email === currentUserEmail)) return;
    onSignersChange([
      ...signers,
      { name: currentUserName, email: currentUserEmail, orderIndex: signers.length },
    ]);
  };

  const removeSigner = (email: string) => {
    const filtered = signers.filter((s) => s.email !== email);
    onSignersChange(filtered.map((s, i) => ({ ...s, orderIndex: i })));
    if (selectedSignerEmail === email) onSelectSigner(null);
  };

  const isMyselfAdded = signers.some((s) => s.email === currentUserEmail);

  return (
    <View style={styles.container}>
      {/* Signing order toggle */}
      <View style={styles.orderRow}>
        <View style={styles.orderInfo}>
          <Users size={16} color={colors.slate[600]} />
          <Text style={styles.orderLabel}>Sequential signing</Text>
        </View>
        <Switch
          value={signingOrder === 'sequential'}
          onValueChange={(v) => onSigningOrderChange(v ? 'sequential' : 'parallel')}
          trackColor={{ false: colors.slate[200], true: colors.primary[300] }}
          thumbColor={signingOrder === 'sequential' ? colors.primary[600] : colors.slate[400]}
        />
      </View>

      {/* Signer list */}
      {signers.map((signer, idx) => {
        const isSelected = selectedSignerEmail === signer.email;
        const color = SIGNER_COLORS[idx % SIGNER_COLORS.length];

        return (
          <TouchableOpacity
            key={signer.email}
            style={[styles.signerRow, isSelected && { borderColor: color, backgroundColor: `${color}10` }]}
            onPress={() => onSelectSigner(isSelected ? null : signer.email)}
            activeOpacity={0.7}
          >
            <View style={[styles.signerAvatar, { backgroundColor: color }]}>
              <Text style={styles.signerAvatarText}>
                {signingOrder === 'sequential' ? `${idx + 1}` : signer.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.signerInfo}>
              <Text style={styles.signerName}>{signer.name}</Text>
              <Text style={styles.signerEmail}>{signer.email}</Text>
            </View>
            <TouchableOpacity
              onPress={() => removeSigner(signer.email)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color={colors.slate[400]} />
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })}

      {/* Add signer form */}
      <View style={styles.addForm}>
        <TextInput
          style={styles.addInput}
          value={newName}
          onChangeText={setNewName}
          placeholder="Name"
          placeholderTextColor={colors.slate[400]}
        />
        <TextInput
          style={styles.addInput}
          value={newEmail}
          onChangeText={setNewEmail}
          placeholder="Email"
          placeholderTextColor={colors.slate[400]}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[styles.addBtn, (!newName.trim() || !newEmail.trim()) && styles.addBtnDisabled]}
          onPress={addSigner}
          disabled={!newName.trim() || !newEmail.trim()}
        >
          <Plus size={16} color="#fff" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Add myself */}
      {currentUserEmail && !isMyselfAdded && (
        <TouchableOpacity style={styles.myselfBtn} onPress={addMyself}>
          <UserPlus size={16} color={colors.primary[600]} />
          <Text style={styles.myselfBtnText}>Add Myself</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  orderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orderLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate[700],
  },
  signerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  signerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signerAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  signerInfo: {
    flex: 1,
  },
  signerName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate[900],
  },
  signerEmail: {
    fontSize: 12,
    color: colors.slate[500],
  },
  addForm: {
    gap: spacing.sm,
  },
  addInput: {
    borderWidth: 1,
    borderColor: colors.slate[300],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.slate[900],
    backgroundColor: colors.white,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  addBtnDisabled: {
    opacity: 0.5,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  myselfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary[200],
    backgroundColor: colors.primary[50],
  },
  myselfBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary[700],
  },
});
