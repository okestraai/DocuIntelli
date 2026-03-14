import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import FieldChip from './FieldChip';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import type { EsignField, PlacedField, SignerEntry, FieldType } from '../../types/esignature';

interface PdfFieldOverlayProps {
  /** URL to the PDF binary (with auth if needed) */
  pdfUrl: string;
  /** Optional auth header for authenticated document fetches */
  authToken?: string;
  /** Mode: signing renders fill indicators, placement renders signer-colored chips */
  mode: 'signing' | 'placement';

  // ── Signing mode props ──
  fields?: EsignField[];
  filledFields?: Record<string, string>;
  onFieldPress?: (field: EsignField) => void;

  // ── Placement mode props ──
  placedFields?: PlacedField[];
  signers?: SignerEntry[];
  selectedFieldType?: FieldType | null;
  selectedSignerEmail?: string | null;
  onPlaceField?: (xPercent: number, yPercent: number, pageNumber: number) => void;
  onDeleteField?: (fieldId: string) => void;
  onFieldPress2?: (field: PlacedField) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PDF_VIEW_WIDTH = SCREEN_WIDTH - spacing.lg * 2;

function makePdfViewerHtml(pdfUrl: string, authToken?: string): string {
  const fetchHeaders = authToken
    ? `{ 'Authorization': 'Bearer ${authToken}' }`
    : '{}';

  return `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; overflow: hidden; }
  canvas { display: block; max-width: 100%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .loading { color: #64748b; font-family: system-ui; font-size: 14px; text-align: center; padding: 40px; }
</style>
</head>
<body>
<div class="loading" id="loading">Loading PDF...</div>
<canvas id="canvas" style="display:none;"></canvas>
<script>
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  let pdfDoc = null;
  let currentPage = 1;

  async function loadPdf() {
    try {
      const response = await fetch('${pdfUrl}', { headers: ${fetchHeaders} });
      const arrayBuffer = await response.arrayBuffer();
      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'pdfLoaded',
        totalPages: pdfDoc.numPages
      }));
      renderPage(1);
    } catch (e) {
      document.getElementById('loading').textContent = 'Failed to load PDF';
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: e.message }));
    }
  }

  async function renderPage(num) {
    if (!pdfDoc) return;
    currentPage = num;
    const page = await pdfDoc.getPage(num);
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    const viewport = page.getViewport({ scale: 2 });
    const displayWidth = document.body.clientWidth;
    const scale = (displayWidth * 2) / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = (scaledViewport.height / 2) + 'px';

    document.getElementById('loading').style.display = 'none';
    canvas.style.display = 'block';

    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'pageRendered',
      page: num,
      width: displayWidth,
      height: scaledViewport.height / 2
    }));
  }

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'tap',
      xPercent,
      yPercent,
      page: currentPage
    }));
  });

  window.addEventListener('message', (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'goToPage' && pdfDoc) renderPage(msg.page);
    } catch {}
  });

  loadPdf();
</script>
</body>
</html>`;
}

export default function PdfFieldOverlay({
  pdfUrl,
  authToken,
  mode,
  fields = [],
  filledFields = {},
  onFieldPress,
  placedFields = [],
  signers = [],
  selectedFieldType,
  selectedSignerEmail,
  onPlaceField,
  onDeleteField,
  onFieldPress2,
}: PdfFieldOverlayProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState({ width: PDF_VIEW_WIDTH, height: 500 });
  const [isLoading, setIsLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      switch (msg.type) {
        case 'pdfLoaded':
          setTotalPages(msg.totalPages);
          break;

        case 'pageRendered':
          setPageSize({ width: msg.width, height: msg.height });
          setCurrentPage(msg.page);
          setIsLoading(false);
          break;

        case 'tap':
          if (mode === 'placement' && selectedFieldType && selectedSignerEmail && onPlaceField) {
            onPlaceField(msg.xPercent, msg.yPercent, msg.page);
          }
          break;

        case 'error':
          setIsLoading(false);
          break;
      }
    } catch {}
  }, [mode, selectedFieldType, selectedSignerEmail, onPlaceField]);

  const goToPage = useCallback((page: number) => {
    if (page < 1 || page > totalPages) return;
    webViewRef.current?.injectJavaScript(
      `window.postMessage(${JSON.stringify({ type: 'goToPage', page })}, '*'); true;`
    );
  }, [totalPages]);

  // Fields for current page
  const currentFields = mode === 'signing'
    ? fields.filter((f) => f.page_number === currentPage)
    : placedFields.filter((f) => f.pageNumber === currentPage);

  const signerEmailIndex = (email: string) => {
    const idx = signers.findIndex((s) => s.email === email);
    return idx >= 0 ? idx : 0;
  };

  return (
    <View style={styles.container}>
      {/* Page navigation */}
      <View style={styles.pageNav}>
        <TouchableOpacity
          onPress={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          style={[styles.pageNavBtn, currentPage <= 1 && styles.pageNavBtnDisabled]}
        >
          <ChevronLeft size={18} color={currentPage <= 1 ? colors.slate[300] : colors.slate[600]} />
        </TouchableOpacity>
        <Text style={styles.pageIndicator}>
          Page {currentPage} of {totalPages}
        </Text>
        <TouchableOpacity
          onPress={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          style={[styles.pageNavBtn, currentPage >= totalPages && styles.pageNavBtnDisabled]}
        >
          <ChevronRight size={18} color={currentPage >= totalPages ? colors.slate[300] : colors.slate[600]} />
        </TouchableOpacity>
      </View>

      {/* PDF + Overlays */}
      <View style={[styles.pdfContainer, { height: pageSize.height }]}>
        <WebView
          ref={webViewRef}
          source={{ html: makePdfViewerHtml(pdfUrl, authToken) }}
          style={styles.webview}
          scrollEnabled={false}
          bounces={false}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          mixedContentMode="always"
        />

        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={styles.loadingText}>Loading PDF...</Text>
          </View>
        )}

        {/* Field overlays */}
        {!isLoading && mode === 'signing' && (currentFields as EsignField[]).map((field) => (
          <FieldChip
            key={field.id}
            fieldType={field.field_type}
            label={field.label}
            isFilled={!!filledFields[field.id]}
            onPress={() => onFieldPress?.(field)}
            mode="signing"
            style={{
              left: (field.x_percent / 100) * pageSize.width,
              top: (field.y_percent / 100) * pageSize.height,
              width: (field.width_percent / 100) * pageSize.width,
              height: (field.height_percent / 100) * pageSize.height,
            }}
          />
        ))}

        {!isLoading && mode === 'placement' && (currentFields as PlacedField[]).map((field) => (
          <FieldChip
            key={field.id}
            fieldType={field.fieldType}
            label={field.label}
            isFilled={false}
            signerIndex={signerEmailIndex(field.signerEmail)}
            onPress={() => onFieldPress2?.(field)}
            onDelete={() => onDeleteField?.(field.id)}
            mode="placement"
            style={{
              left: (field.xPercent / 100) * pageSize.width,
              top: (field.yPercent / 100) * pageSize.height,
              width: (field.widthPercent / 100) * pageSize.width,
              height: (field.heightPercent / 100) * pageSize.height,
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
  },
  pageNavBtn: {
    padding: spacing.xs,
  },
  pageNavBtnDisabled: {
    opacity: 0.4,
  },
  pageIndicator: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.slate[600],
  },
  pdfContainer: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.slate[100],
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.slate[500],
  },
});
