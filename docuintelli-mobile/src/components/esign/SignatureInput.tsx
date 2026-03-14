import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { X, Pen, Type, Upload, Check } from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';

interface SignatureInputProps {
  visible: boolean;
  onSave: (imageData: string) => void;
  onCancel: () => void;
  title?: string;
  type?: 'signature' | 'initials';
}

type InputMode = 'draw' | 'type' | 'upload';

const SIGNATURE_FONTS = [
  { name: 'Dancing Script', label: 'Elegant' },
  { name: 'Great Vibes', label: 'Classic' },
  { name: 'Satisfy', label: 'Casual' },
  { name: 'Pacifico', label: 'Bold' },
];

const CANVAS_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #fff; overflow: hidden; touch-action: none; }
  canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let hasDrawn = false;

  function resize() {
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  resize();

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!drawing) return; hasDrawn = true; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
  canvas.addEventListener('touchend', (e) => { e.preventDefault(); drawing = false; });

  canvas.addEventListener('mousedown', (e) => { drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  canvas.addEventListener('mousemove', (e) => { if (!drawing) return; hasDrawn = true; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
  canvas.addEventListener('mouseup', () => { drawing = false; });

  window.addEventListener('message', (e) => {
    const msg = typeof e.data === 'string' ? e.data : '';
    if (msg === 'clear') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawn = false;
    } else if (msg === 'save') {
      if (!hasDrawn) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'empty' }));
        return;
      }
      const data = canvas.toDataURL('image/png');
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'signature', data }));
    }
  });
</script>
</body>
</html>
`;

function makeTypedSignatureHtml(text: string, fontName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@400&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; }
  body { background: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; }
  canvas { display: none; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
  document.fonts.ready.then(() => {
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const text = ${JSON.stringify(text)};
    const font = '48px "${fontName}"';
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width) + 40;
    const h = 80;
    canvas.width = w * 2;
    canvas.height = h * 2;
    ctx.scale(2, 2);
    ctx.font = font;
    ctx.fillStyle = '#1e293b';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 20, h / 2);
    const data = canvas.toDataURL('image/png');
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'signature', data }));
  });
</script>
</body>
</html>`;
}

export default function SignatureInput({ visible, onSave, onCancel, title, type = 'signature' }: SignatureInputProps) {
  const [mode, setMode] = useState<InputMode>('draw');
  const [typedText, setTypedText] = useState('');
  const [selectedFont, setSelectedFont] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const drawWebViewRef = useRef<WebView>(null);
  const typeWebViewRef = useRef<WebView>(null);

  const heading = title || (type === 'initials' ? 'Enter Your Initials' : 'Enter Your Signature');

  const handleDrawSave = useCallback(() => {
    drawWebViewRef.current?.injectJavaScript("window.postMessage('save', '*'); true;");
  }, []);

  const handleDrawClear = useCallback(() => {
    drawWebViewRef.current?.injectJavaScript("window.postMessage('clear', '*'); true;");
  }, []);

  const handleTypeSave = useCallback(() => {
    if (!typedText.trim()) return;
    setIsExporting(true);
    // The WebView will post back the PNG data
  }, [typedText]);

  const handleUpload = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/png', 'image/jpeg', 'image/jpg'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (asset.size && asset.size > 2 * 1024 * 1024) {
        // 2MB limit
        return;
      }

      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            onSave(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      } else {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const mimeType = asset.mimeType || 'image/png';
        onSave(`data:${mimeType};base64,${base64}`);
      }
    } catch {
      // User cancelled or error
    }
  }, [onSave]);

  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'signature' && msg.data) {
        setIsExporting(false);
        onSave(msg.data);
      } else if (msg.type === 'empty') {
        // Nothing drawn
      }
    } catch {
      // Ignore malformed messages
    }
  }, [onSave]);

  const modeButtons: { key: InputMode; icon: typeof Pen; label: string }[] = [
    { key: 'draw', icon: Pen, label: 'Draw' },
    { key: 'type', icon: Type, label: 'Type' },
    { key: 'upload', icon: Upload, label: 'Upload' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{heading}</Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
              <X size={20} color={colors.slate[500]} />
            </TouchableOpacity>
          </View>

          {/* Mode tabs */}
          <View style={styles.modeTabs}>
            {modeButtons.map(({ key, icon: Icon, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.modeTab, mode === key && styles.modeTabActive]}
                onPress={() => setMode(key)}
              >
                <Icon size={16} color={mode === key ? colors.primary[600] : colors.slate[400]} />
                <Text style={[styles.modeTabText, mode === key && styles.modeTabTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <View style={styles.content}>
            {mode === 'draw' && (
              <View style={styles.canvasContainer}>
                <WebView
                  ref={drawWebViewRef}
                  source={{ html: CANVAS_HTML }}
                  style={styles.canvas}
                  scrollEnabled={false}
                  bounces={false}
                  onMessage={handleWebViewMessage}
                  javaScriptEnabled
                />
                <Text style={styles.hint}>Draw your {type} above</Text>
              </View>
            )}

            {mode === 'type' && (
              <View style={styles.typeContainer}>
                <TextInput
                  style={styles.typeInput}
                  value={typedText}
                  onChangeText={setTypedText}
                  placeholder={type === 'initials' ? 'Enter initials' : 'Type your name'}
                  placeholderTextColor={colors.slate[400]}
                  autoFocus
                />
                <Text style={styles.fontLabel}>Choose a style:</Text>
                <View style={styles.fontGrid}>
                  {SIGNATURE_FONTS.map((font, idx) => (
                    <TouchableOpacity
                      key={font.name}
                      style={[styles.fontOption, selectedFont === idx && styles.fontOptionActive]}
                      onPress={() => setSelectedFont(idx)}
                    >
                      <Text style={styles.fontOptionLabel}>{font.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {isExporting && typedText.trim() && (
                  <View style={styles.hiddenWebView}>
                    <WebView
                      ref={typeWebViewRef}
                      source={{ html: makeTypedSignatureHtml(typedText.trim(), SIGNATURE_FONTS[selectedFont].name) }}
                      onMessage={handleWebViewMessage}
                      javaScriptEnabled
                    />
                  </View>
                )}
              </View>
            )}

            {mode === 'upload' && (
              <View style={styles.uploadContainer}>
                <TouchableOpacity style={styles.uploadButton} onPress={handleUpload}>
                  <Upload size={24} color={colors.primary[600]} />
                  <Text style={styles.uploadText}>Choose Image</Text>
                  <Text style={styles.uploadHint}>PNG or JPG, max 2MB</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {mode === 'draw' && (
              <>
                <TouchableOpacity style={styles.clearBtn} onPress={handleDrawClear}>
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleDrawSave}>
                  <Check size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </>
            )}
            {mode === 'type' && (
              <TouchableOpacity
                style={[styles.saveBtn, !typedText.trim() && styles.saveBtnDisabled]}
                onPress={handleTypeSave}
                disabled={!typedText.trim() || isExporting}
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Check size={16} color="#fff" />
                    <Text style={styles.saveBtnText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.slate[900],
  },
  closeBtn: {
    padding: spacing.xs,
  },
  modeTabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.slate[100],
    borderRadius: borderRadius.md,
    padding: 3,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  modeTabActive: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.slate[400],
  },
  modeTabTextActive: {
    color: colors.primary[600],
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  canvasContainer: {
    height: 180,
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.md,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
    backgroundColor: '#fff',
  },
  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.slate[400],
    paddingVertical: 4,
  },
  typeContainer: {
    gap: spacing.md,
  },
  typeInput: {
    borderWidth: 1,
    borderColor: colors.slate[300],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 18,
    color: colors.slate[900],
  },
  fontLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.slate[600],
  },
  fontGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fontOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
  },
  fontOptionActive: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  fontOptionLabel: {
    fontSize: 13,
    color: colors.slate[700],
    fontWeight: '500',
  },
  hiddenWebView: {
    width: 1,
    height: 1,
    opacity: 0,
    position: 'absolute',
  },
  uploadContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  uploadButton: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderWidth: 2,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.lg,
    borderStyle: 'dashed',
    width: '100%',
  },
  uploadText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary[600],
  },
  uploadHint: {
    fontSize: 12,
    color: colors.slate[400],
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  clearBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.slate[300],
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate[600],
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[600],
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
});
