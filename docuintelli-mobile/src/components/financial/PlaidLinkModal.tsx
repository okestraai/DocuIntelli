import React, { useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { X } from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { API_BASE } from '../../lib/config';

interface PlaidLinkModalProps {
  visible: boolean;
  linkToken: string | null;
  onSuccess: (publicToken: string, institutionName: string) => Promise<void> | void;
  onClose: () => void;
}

/**
 * Plaid Link via WebView — hybrid approach:
 *
 * 1. Loads our server's /plaid-link-popup page which uses Plaid's Drop-in SDK
 *    (Plaid.create + handler.open). This loads Plaid reliably in the WebView.
 *
 * 2. The popup page has ?mobile=1 flag, so after Plaid completes it navigates
 *    to plaidlink://connected?public_token=...&institution_name=... instead of
 *    using postMessage (which doesn't work in RN WebViews).
 *
 * 3. We intercept the plaidlink:// URL via onShouldStartLoadWithRequest,
 *    extract the data, and exchange the token on our backend.
 */
export default function PlaidLinkModal({
  visible,
  linkToken,
  onSuccess,
  onClose,
}: PlaidLinkModalProps) {
  const webViewRef = useRef<WebView>(null);
  const [loadingWeb, setLoadingWeb] = useState(true);
  const [exchanging, setExchanging] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const handledRef = useRef(false);

  const handleShow = useCallback(() => {
    setLoadingWeb(true);
    setExchanging(false);
    setExchangeError(null);
    handledRef.current = false;
  }, []);

  // Exchange the public token on our backend
  const processSuccess = useCallback(async (publicToken: string, institutionName: string) => {
    if (handledRef.current) return;
    handledRef.current = true;
    setExchanging(true);
    setExchangeError(null);
    try {
      await onSuccess(publicToken, institutionName);
    } catch (err: any) {
      setExchangeError(err?.message || 'Failed to connect bank');
    }
    setExchanging(false);
    onClose();
  }, [onSuccess, onClose]);

  // PRIMARY: Handle messages from WebView via ReactNativeWebView.postMessage
  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'plaid-link-success') {
        processSuccess(data.publicToken || '', data.institutionName || 'Unknown Bank');
      } else if (data.type === 'plaid-link-exit') {
        if (!handledRef.current) {
          handledRef.current = true;
          onClose();
        }
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  }, [processSuccess, onClose]);

  // FALLBACK: Intercept plaidlink:// URL redirects from the popup page
  const handleShouldStartLoad = useCallback((event: { url: string }): boolean => {
    const { url } = event;

    if (!url.startsWith('plaidlink://')) {
      return true; // Allow normal HTTPS navigation
    }

    // Parse: plaidlink://connected?public_token=...&institution_name=...
    //        plaidlink://exit
    const afterScheme = url.substring('plaidlink://'.length);
    const qIndex = afterScheme.indexOf('?');
    const host = qIndex >= 0 ? afterScheme.substring(0, qIndex) : afterScheme;
    const queryString = qIndex >= 0 ? afterScheme.substring(qIndex + 1) : '';

    const params: Record<string, string> = {};
    if (queryString) {
      queryString.split('&').forEach((pair) => {
        const eqIndex = pair.indexOf('=');
        if (eqIndex >= 0) {
          params[pair.substring(0, eqIndex)] = decodeURIComponent(pair.substring(eqIndex + 1));
        }
      });
    }

    if (host === 'connected') {
      processSuccess(params.public_token || '', params.institution_name || 'Unknown Bank');
    } else if (host === 'exit') {
      if (!handledRef.current) {
        handledRef.current = true;
        onClose();
      }
    }

    return false; // Block all plaidlink:// navigation
  }, [processSuccess, onClose]);

  // Fallback for Android: onShouldStartLoadWithRequest doesn't fire for
  // custom URL schemes on Android. Use onNavigationStateChange instead.
  const handleNavigationStateChange = useCallback((navState: { url: string }) => {
    const { url } = navState;
    if (url && url.startsWith('plaidlink://')) {
      handleShouldStartLoad({ url });
    }
  }, [handleShouldStartLoad]);

  if (!linkToken) return null;

  // Server popup with mobile=1 flag → uses plaidlink:// URL redirect on success
  const uri = `${API_BASE}/plaid-link-popup?token=${encodeURIComponent(linkToken)}&mobile=1`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onShow={handleShow}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Connect Your Bank</Text>
          {!exchanging && (
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <X size={20} color={colors.slate[600]} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.webViewContainer}>
          {(loadingWeb || exchanging) && (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={colors.primary[600]} />
              <Text style={styles.loaderText}>
                {exchanging ? 'Connecting your account...' : 'Loading Plaid...'}
              </Text>
              {exchanging && (
                <Text style={styles.loaderSubtext}>
                  Securely linking your bank. This may take a moment.
                </Text>
              )}
            </View>
          )}
          {exchangeError && (
            <View style={styles.loader}>
              <Text style={styles.errorText}>{exchangeError}</Text>
              <TouchableOpacity onPress={onClose} style={styles.errorBtn}>
                <Text style={styles.errorBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ uri }}
            style={styles.webView}
            onLoadEnd={() => setLoadingWeb(false)}
            onMessage={handleWebViewMessage}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            onNavigationStateChange={handleNavigationStateChange}
            originWhitelist={['https://*', 'http://*', 'plaidlink://*']}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    zIndex: 10,
  },
  loaderText: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },
  loaderSubtext: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: '#dc2626',
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  errorBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.md,
  },
  errorBtnText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});
