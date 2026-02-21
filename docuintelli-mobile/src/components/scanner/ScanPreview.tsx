import React, { useState, useRef } from 'react';
import { View, Image, Text, StyleSheet, Dimensions } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Check, RotateCcw, Crop } from 'lucide-react-native';
import CropOverlay, { type CropRect } from './CropOverlay';
import Button from '../ui/Button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface ScanPreviewProps {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  onConfirm: (croppedUri: string) => void;
  onRetake: () => void;
}

export default function ScanPreview({
  uri,
  imageWidth,
  imageHeight,
  onConfirm,
  onRetake,
}: ScanPreviewProps) {
  const [processing, setProcessing] = useState(false);
  const cropRef = useRef<CropRect | null>(null);

  const { width: screenW, height: screenH } = Dimensions.get('window');
  const maxH = screenH - 220;
  const scale = Math.min(screenW / imageWidth, maxH / imageHeight);
  const dispW = Math.round(imageWidth * scale);
  const dispH = Math.round(imageHeight * scale);

  const handleConfirm = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const c = cropRef.current;
      if (c) {
        const sx = imageWidth / dispW;
        const sy = imageHeight / dispH;
        const context = ImageManipulator.manipulate(uri);
        context.crop({
          originX: Math.max(0, Math.round(c.left * sx)),
          originY: Math.max(0, Math.round(c.top * sy)),
          width: Math.min(imageWidth, Math.round((c.right - c.left) * sx)),
          height: Math.min(imageHeight, Math.round((c.bottom - c.top) * sy)),
        });
        const image = await context.renderAsync();
        const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
        onConfirm(result.uri);
      } else {
        onConfirm(uri);
      }
    } catch {
      onConfirm(uri);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Title */}
      <View style={styles.header}>
        <Crop size={20} color={colors.primary[600]} strokeWidth={2} />
        <Text style={styles.title}>Adjust Document Area</Text>
      </View>

      {/* Image with crop overlay */}
      <View style={[styles.imageWrap, { width: dispW, height: dispH }]}>
        <Image source={{ uri }} style={{ width: dispW, height: dispH }} />
        <CropOverlay
          width={dispW}
          height={dispH}
          onCropChange={(c) => {
            cropRef.current = c;
          }}
        />
      </View>

      <Text style={styles.hint}>Drag the corner handles to select the document area</Text>

      {/* Action buttons */}
      <View style={styles.actions}>
        <Button
          title="Retake"
          onPress={onRetake}
          variant="outline"
          size="md"
          icon={<RotateCcw size={16} color={colors.slate[700]} strokeWidth={2} />}
          style={{ flex: 1 }}
        />
        <Button
          title={processing ? 'Cropping...' : 'Confirm'}
          onPress={handleConfirm}
          loading={processing}
          disabled={processing}
          variant="primary"
          size="md"
          icon={!processing ? <Check size={16} color={colors.white} strokeWidth={2} /> : undefined}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate[900],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  imageWrap: {
    overflow: 'hidden',
    borderRadius: 4,
  },
  hint: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[400],
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
});
