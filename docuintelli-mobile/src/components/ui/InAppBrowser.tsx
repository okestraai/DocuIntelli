import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, RefreshCw } from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

// Only import WebView on native platforms
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

interface InAppBrowserProps {
  url: string | null;
  onClose: () => void;
  title?: string;
  /** Hint that the URL points to a PDF — enables Google Docs viewer on Android */
  isPdf?: boolean;
  /** Called when WebView navigates to a URL matching a custom scheme (e.g. docuintelli://).
   *  The browser auto-closes and the matched URL is passed to the callback. */
  onRedirect?: (url: string) => void;
  /** Custom scheme(s) to intercept. Defaults to ['docuintelli://']. */
  interceptSchemes?: string[];
  /** Text patterns on the page that indicate completion (e.g. 'Bank Connected').
   *  When detected, the browser auto-closes and onRedirect is called. */
  successTextPatterns?: string[];
}

export default function InAppBrowser({
  url, onClose, title, isPdf, onRedirect, interceptSchemes, successTextPatterns,
}: InAppBrowserProps) {
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<any>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const didFireSuccessRef = useRef(false);

  const schemes = interceptSchemes || ['docuintelli://'];

  // Build injected JS that monitors for success text on the page
  const successDetectionJs = successTextPatterns && successTextPatterns.length > 0
    ? `
      (function() {
        var patterns = ${JSON.stringify(successTextPatterns)};
        var check = function() {
          var text = document.body ? document.body.innerText : '';
          for (var i = 0; i < patterns.length; i++) {
            if (text.indexOf(patterns[i]) !== -1) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'success-text-detected',
                pattern: patterns[i],
                url: window.location.href
              }));
              return;
            }
          }
          setTimeout(check, 1000);
        };
        setTimeout(check, 2000);
      })();
      true;
    `
    : undefined;

  // Reset success detection when URL changes
  if (!url) {
    didFireSuccessRef.current = false;
    return null;
  }

  // Android WebView can't render PDFs natively — use Google Docs viewer
  const displayUrl =
    isPdf && Platform.OS === 'android'
      ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`
      : url;

  return (
    <Modal
      visible={!!url}
      animationType="slide"
      presentationStyle={Platform.OS === 'web' ? 'fullScreen' : 'pageSheet'}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header toolbar */}
        <View style={styles.toolbar}>
          <View style={styles.toolbarLeft}>
            <TouchableOpacity onPress={onClose} style={styles.toolbarBtn} activeOpacity={0.7}>
              <X size={20} color={colors.slate[700]} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <View style={styles.toolbarCenter}>
            <Text style={styles.toolbarTitle} numberOfLines={1}>
              {title || 'Document'}
            </Text>
          </View>
          <View style={styles.toolbarRight}>
            {loading && (
              <ActivityIndicator size="small" color={colors.primary[600]} />
            )}
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === 'web') {
                  setIframeKey((k) => k + 1);
                  setLoading(true);
                } else {
                  webViewRef.current?.reload();
                }
              }}
              style={styles.toolbarBtn}
              activeOpacity={0.7}
            >
              <RefreshCw size={18} color={colors.slate[700]} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Content: iframe on web, WebView on native */}
        {Platform.OS === 'web' ? (
          <View style={styles.webView}>
            <iframe
              key={iframeKey}
              src={displayUrl}
              style={{ width: '100%', height: '100%', border: 'none' } as any}
              onLoad={() => setLoading(false)}
              title={title || 'Document'}
            />
          </View>
        ) : WebView ? (
          <WebView
            ref={webViewRef}
            source={{ uri: displayUrl }}
            style={styles.webView}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            scalesPageToFit
            allowsInlineMediaPlayback
            startInLoadingState
            {...(successDetectionJs ? { injectedJavaScript: successDetectionJs } : {})}
            onMessage={(event: any) => {
              try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.type === 'success-text-detected' && !didFireSuccessRef.current) {
                  didFireSuccessRef.current = true;
                  console.log('[InAppBrowser] Success text detected:', data.pattern);
                  // Signal completion via onRedirect so the hook knows this is a
                  // success close (not a user cancel). Then close the browser.
                  onRedirect?.('plaid-success://completed');
                  onClose();
                }
              } catch {
                // ignore non-JSON messages
              }
            }}
            onShouldStartLoadWithRequest={(request: any) => {
              const navUrl: string = request.url || '';
              if (onRedirect && schemes.some((s) => navUrl.startsWith(s))) {
                onRedirect(navUrl);
                onClose();
                return false;
              }
              return true;
            }}
            onNavigationStateChange={(navState: any) => {
              const navUrl: string = navState.url || '';
              if (onRedirect && schemes.some((s) => navUrl.startsWith(s))) {
                onRedirect(navUrl);
                onClose();
              }
            }}
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={colors.primary[600]} />
              </View>
            )}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.white,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
    backgroundColor: colors.white,
    minHeight: 48,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 60,
  },
  toolbarCenter: {
    flex: 1,
    alignItems: 'center',
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    width: 60,
  },
  toolbarBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
