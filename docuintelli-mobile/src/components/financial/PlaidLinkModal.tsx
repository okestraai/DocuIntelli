import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { X } from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface PlaidLinkModalProps {
  visible: boolean;
  linkToken: string | null;
  onSuccess: (publicToken: string, institutionName: string) => void;
  onClose: () => void;
}

const PLAID_LINK_BASE = 'https://cdn.plaid.com/link/v2/stable/link.html';

export default function PlaidLinkModal({
  visible,
  linkToken,
  onSuccess,
  onClose,
}: PlaidLinkModalProps) {
  const webViewRef = useRef<WebView>(null);
  const [loadingWeb, setLoadingWeb] = useState(true);

  if (!linkToken) return null;

  const uri = `${PLAID_LINK_BASE}?isWebview=true&token=${linkToken}`;

  const handleNavigationChange = (event: WebViewNavigation) => {
    const { url } = event;

    // Plaid redirects to plaidlink:// on completion
    if (url.startsWith('plaidlink://')) {
      const parsed = new URL(url.replace('plaidlink://', 'https://plaidlink/'));
      const path = parsed.hostname; // "connected" or "exit"

      if (path === 'connected') {
        const publicToken = parsed.searchParams.get('public_token') || '';
        const institutionName = parsed.searchParams.get('institution_name') || 'Unknown Bank';
        onSuccess(publicToken, institutionName);
      }

      // Always close after Plaid redirect (connected or exit)
      onClose();
      return false;
    }

    return true;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Connect Your Bank</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <X size={20} color={colors.slate[600]} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* WebView */}
        <View style={styles.webViewContainer}>
          {loadingWeb && (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={colors.primary[600]} />
              <Text style={styles.loaderText}>Loading Plaid...</Text>
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ uri }}
            style={styles.webView}
            onLoadEnd={() => setLoadingWeb(false)}
            onNavigationStateChange={handleNavigationChange}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState={false}
            originWhitelist={['https://*', 'plaidlink://*']}
            onShouldStartLoadWithRequest={(request) => {
              // Intercept plaidlink:// scheme
              if (request.url.startsWith('plaidlink://')) {
                handleNavigationChange(request as WebViewNavigation);
                return false;
              }
              return true;
            }}
            // Allow Plaid's third-party cookies
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
});
