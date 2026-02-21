import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { DocumentVault } from './components/DocumentVault';
import { DocumentChat } from './components/DocumentChat';
import { DocumentViewer } from './components/DocumentViewer';
import { PricingPage } from './components/PricingPage';
import { AccountSettingsPage } from './components/AccountSettingsPage';
import { WeeklyAudit } from './components/WeeklyAudit';
import { LifeEventsPage } from './components/LifeEventsPage';
import { FinancialInsightsPage } from './components/FinancialInsightsPage';
import { UpgradeModal } from './components/UpgradeModal';
import { ProFeatureGate } from './components/ProFeatureGate';
import { Compass, ClipboardCheck, Landmark } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { UploadModal } from './components/UploadModal';
import { NotificationsModal } from './components/NotificationsModal';
import { useDocuments } from './hooks/useDocuments';
import { useSubscription } from './hooks/useSubscription';
import { DocumentUploadRequest, createCheckoutSession, openCustomerPortal, upgradeSubscription, previewUpgrade, syncBillingData } from './lib/api';
import { linkRelatedDocuments } from './lib/engagementApi';
import { supabase, signOut, getUserProfile, isOnboardingComplete } from './lib/supabase';
import { useFeedback } from './hooks/useFeedback';
import { OnboardingModal } from './components/OnboardingModal';
import { ToastContainer } from './components/Toast';
import { Footer } from './components/Footer';
import { TermsPage } from './components/TermsPage';
import { PrivacyPage } from './components/PrivacyPage';
import { CookiePolicyPage } from './components/CookiePolicyPage';
import { HelpCenterPage } from './components/HelpCenterPage';
import { StatusPage } from './components/StatusPage';
import { FeaturesPage } from './components/FeaturesPage';
import { BetaPage } from './components/BetaPage';
import { SecurityPolicyPage } from './components/SecurityPolicyPage';
import { DataRetentionPolicyPage } from './components/DataRetentionPolicyPage';
import { VulnerabilityManagementPage } from './components/VulnerabilityManagementPage';
import { ConfirmDialog } from './components/ConfirmDialog';
import { GlobalSearch } from './components/GlobalSearch';
import { DunningBanner } from './components/DunningBanner';
import { debugDelete } from './utils/deleteDebug';

export type Page = 'landing' | 'dashboard' | 'vault' | 'pricing' | 'settings' | 'audit' | 'life-events' | 'financial-insights' | 'terms' | 'privacy' | 'cookies' | 'help' | 'status' | 'features' | 'beta' | 'security-policy' | 'data-retention' | 'vulnerability-management';

// Path-based routing helpers
const VALID_PAGES: Page[] = ['dashboard', 'vault', 'pricing', 'settings', 'audit', 'life-events', 'financial-insights', 'terms', 'privacy', 'cookies', 'help', 'status', 'features', 'beta', 'security-policy', 'data-retention', 'vulnerability-management'];

function getPageFromPath(): Page | null {
  const path = window.location.pathname.replace(/^\//, ''); // strip leading /
  if (path && VALID_PAGES.includes(path as Page)) {
    return path as Page;
  }
  return null;
}

function navigateTo(page: Page, replace = false) {
  const target = page === 'landing' ? '/' : `/${page}`;
  if (replace) {
    // Always replace when asked — cleans query params even when pathname matches
    window.history.replaceState(null, '', target);
  } else if (window.location.pathname !== target) {
    window.history.pushState(null, '', target);
  }
}

export interface Document {
  id: string;
  name: string;
  type: string;
  category: 'warranty' | 'insurance' | 'lease' | 'employment' | 'contract' | 'other';
  uploadDate: string;
  expirationDate?: string;
  size: string;
  status: 'active' | 'expiring' | 'expired';
  tags?: string[];
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    return getPageFromPath() || 'landing';
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'documents' | 'ai-questions' | 'monthly-uploads' | 'features'>('features');
  const [pendingUpgradePlan, setPendingUpgradePlan] = useState<'starter' | 'pro' | null>(null);
  const [upgradePreviewData, setUpgradePreviewData] = useState<{ prorated_amount_display?: string; new_plan_price_display?: string } | null>(null);
  const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [renewalContext, setRenewalContext] = useState<{ documentId: string; name: string; category: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { documents, loading: documentsLoading, uploadDocuments, deleteDocument } = useDocuments(isAuthenticated);
  const { subscription, loading: subscriptionLoading, documentCount, refreshSubscription } = useSubscription();
  const feedback = useFeedback();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [seenNotificationIds, setSeenNotificationIds] = useState<Set<string>>(new Set());
  const [settingsInitialTab, setSettingsInitialTab] = useState<'profile' | 'security' | 'preferences' | 'billing'>('profile');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const hasInitialAuth = useRef(false);

  // Capture Stripe redirect params synchronously during first render,
  // BEFORE any useEffect (auth, realtime, etc.) can modify the URL.
  // This prevents a race where the INITIAL_SESSION auth handler cleans query params
  // before the Stripe handler reads them.
  const stripeRedirectParams = useRef<{ checkout: string | null; upgrade: string | null; portal: string | null } | null>(null);
  if (stripeRedirectParams.current === null) {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const upgrade = params.get('upgrade');
    const portal = params.get('portal');
    stripeRedirectParams.current = { checkout, upgrade, portal };
    // Clean URL immediately (synchronous) so no other code sees stale params
    if (checkout || upgrade || portal) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  // Scroll to top on page change (URL is managed explicitly by navigateTo calls)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  // Listen for browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const page = getPageFromPath();
      if (page) {
        setCurrentPage(page);
      } else if (isAuthenticated) {
        setCurrentPage('dashboard');
      } else {
        setCurrentPage('landing');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isAuthenticated]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile && !isAuthenticated && !isLoading && currentPage === 'landing') {
      setShowAuthModal(true);
    }
  }, [isMobile, isAuthenticated, isLoading, currentPage]);

  // Global search keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isAuthenticated) {
          setGlobalSearchOpen(prev => !prev);
        }
      }
      if (e.key === 'Escape' && globalSearchOpen) {
        setGlobalSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isAuthenticated, globalSearchOpen]);

  const expiringDocuments = useMemo(() => {
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));

    return documents.filter(doc => {
      if (!doc.expirationDate) return false;
      const expDate = new Date(doc.expirationDate);
      return expDate <= thirtyDaysFromNow;
    }).sort((a, b) => {
      if (!a.expirationDate || !b.expirationDate) return 0;
      return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
    });
  }, [documents]);

  // Clean up seen notification IDs when expiring documents change
  useEffect(() => {
    const currentIds = new Set(expiringDocuments.map(d => d.id));
    setSeenNotificationIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => { if (currentIds.has(id)) next.add(id); });
      return next.size !== prev.size ? next : prev;
    });
  }, [expiringDocuments]);

  // Check for existing session on app load
  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setIsLoading(false);
        if (event === 'SIGNED_IN' && session?.user) {
          setIsAuthenticated(true);
          setShowAuthModal(false);
          // Clean up OAuth params from URL after Supabase has consumed them
          // PKCE flow uses ?code= query param; implicit flow uses #access_token=
          const params = new URLSearchParams(window.location.search);
          const hash = window.location.hash;
          if (params.has('code') || (hash && hash.includes('access_token'))) {
            window.history.replaceState(null, '', window.location.pathname);
          }
          // Only navigate to dashboard on fresh sign-in (not token refresh/page reload)
          if (!hasInitialAuth.current) {
            hasInitialAuth.current = true;
            // If pathname already has a valid page, keep it (page reload case)
            const pathPage = getPageFromPath();
            if (!pathPage) {
              navigateTo('dashboard', true);
              setCurrentPage('dashboard');
            }
          }
        } else if (event === 'SIGNED_OUT') {
          hasInitialAuth.current = false;
          setIsAuthenticated(false);
          navigateTo('landing', true);
          setCurrentPage('landing');
          setSelectedDocument(null);
        } else if (event === 'INITIAL_SESSION') {
          if (session?.user) {
            setIsAuthenticated(true);
            hasInitialAuth.current = true;
            // Restore page from pathname or default to dashboard
            const pathPage = getPageFromPath();
            if (pathPage && pathPage !== 'landing') {
              navigateTo(pathPage, true);
              setCurrentPage(pathPage);
            } else {
              navigateTo('dashboard', true);
              setCurrentPage('dashboard');
            }
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Check if onboarding is complete whenever auth state becomes authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setShowOnboarding(false);
      return;
    }
    getUserProfile().then(profile => {
      if (!isOnboardingComplete(profile)) {
        setShowOnboarding(true);
      }
    }).catch(() => {
      // Fail-open: don't block the user if profile fetch fails
    });
  }, [isAuthenticated]);

  // Handle Stripe checkout success/cancel/portal return.
  // Params were captured synchronously during first render (stripeRedirectParams ref).
  // URL was already cleaned at that point, so this effect just shows the toast.
  useEffect(() => {
    const sp = stripeRedirectParams.current;
    if (!sp || (!sp.checkout && !sp.upgrade && !sp.portal)) return;

    // Clear ref so StrictMode double-invoke or any re-run can't reprocess
    const { checkout, upgrade, portal } = sp;
    stripeRedirectParams.current = { checkout: null, upgrade: null, portal: null };

    setCurrentPage('dashboard');

    if (checkout === 'success') {
      feedback.showSuccess(
        'Subscription Activated!',
        'Your subscription is now active. Welcome to the premium experience!',
        8000
      );
      refreshSubscription();
      syncBillingData().catch(() => {});
    } else if (checkout === 'cancel') {
      feedback.showWarning(
        'Checkout Cancelled',
        'Your subscription was not completed. You can upgrade anytime from your dashboard.',
        6000
      );
    } else if (upgrade === 'success') {
      feedback.showSuccess(
        'Plan Upgraded!',
        'Your plan has been upgraded. Enjoy your expanded document storage and all premium features!',
        8000
      );
      refreshSubscription();
      syncBillingData().catch(() => {});
    } else if (upgrade === 'cancel') {
      feedback.showWarning(
        'Upgrade Cancelled',
        'Your plan was not changed. You can upgrade anytime from your billing settings.',
        6000
      );
    } else if (portal === 'return') {
      feedback.showInfo(
        'Subscription Updated',
        'Any changes to your subscription have been saved.',
        5000
      );
      refreshSubscription();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const handleAuth = () => {
    setIsAuthenticated(true);
    setShowAuthModal(false);
    navigateTo('dashboard', true);
    setCurrentPage('dashboard');
  };

  const handleGetStarted = () => {
    setShowAuthModal(true);
  };

  const handleDocumentSelect = (doc: Document) => {
    setSelectedDocument(doc);
    window.scrollTo(0, 0);
  };

  const handleDocumentView = (doc: Document) => {
    setViewingDocument(doc);
    window.scrollTo(0, 0);
  };

  const handleBackToVault = () => {
    setSelectedDocument(null);
    window.scrollTo(0, 0);
  };

  const handleBackFromViewer = () => {
    setViewingDocument(null);
    window.scrollTo(0, 0);
  };

  const handleNavigate = (page: Page) => {
    // Clear any selected/viewing document states when navigating
    setSelectedDocument(null);
    setViewingDocument(null);
    // Push to history so back/forward buttons work
    navigateTo(page);
    setCurrentPage(page);
  };

  const handleDocumentsUploadNew = async (documentsData: DocumentUploadRequest[]) => {
    const loadingToastId = feedback.showLoading('Uploading documents...', 'Please wait while we process your files');
    try {
      const uploadedIds = await uploadDocuments(documentsData);
      feedback.removeToast(loadingToastId);

      // If this was a renewal upload, link new docs to the original
      if (renewalContext && uploadedIds.length > 0) {
        try {
          for (const newDocId of uploadedIds) {
            await linkRelatedDocuments(newDocId, renewalContext.documentId, 'supersedes');
          }
          feedback.showSuccess('Renewal uploaded!', `Linked as renewal of "${renewalContext.name}"`);
        } catch (linkError) {
          console.error('Failed to link renewal:', linkError);
          feedback.showSuccess('Upload successful!', 'Document uploaded but linking failed. You can link it manually.');
        }
        setRenewalContext(null);
      } else {
        feedback.showSuccess('Upload successful!', `${documentsData.length} document${documentsData.length !== 1 ? 's' : ''} uploaded successfully`);
      }

      setShowUploadModal(false);
    } catch (error) {
      feedback.removeToast(loadingToastId);

      const errorMessage = error instanceof Error ? error.message : 'Failed to upload documents';

      if (errorMessage.includes('backend server')) {
        feedback.showError('Backend Server Not Running', 'Please start the backend: cd server && npm run dev', 10000);
      } else {
        feedback.showError('Upload failed', errorMessage, 8000);
      }

      console.error('Upload failed:', error);
    }
  };

  const handleUploadRenewal = (doc: Document) => {
    setRenewalContext({ documentId: doc.id, name: doc.name, category: doc.category });
    setShowUploadModal(true);
  };

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      feedback.showSuccess('Logged out successfully', 'You have been signed out of your account');
      setShowLogoutConfirm(false);
    } catch (error) {
      feedback.showError('Logout failed', error instanceof Error ? error.message : 'Failed to sign out');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleUpgradeNeeded = (reason: 'documents' | 'ai-questions' | 'monthly-uploads' | 'features' = 'features') => {
    setUpgradeReason(reason);
    setShowUpgradeModal(true);
  };

  const handleSelectPlan = async (plan: 'free' | 'starter' | 'pro') => {
    if (plan === 'free') {
      setShowUpgradeModal(false);
      return;
    }

    let loadingToastId: string | undefined;
    try {
      // If user already has a paid plan (not free), show confirmation with prorated amount
      if (subscription && subscription.plan !== 'free') {
        setPendingUpgradePlan(plan);
        setUpgradePreviewData(null);
        setShowUpgradeModal(false);

        // Fetch preview in background, then show confirmation
        const preview = await previewUpgrade(plan);
        if (preview.success && preview.prorated_amount_display && !preview.prorated_amount_display.includes('NaN')) {
          setUpgradePreviewData(preview);
        }
        setShowUpgradeConfirm(true);
      } else {
        // Free user needs to go through checkout to add payment method
        loadingToastId = feedback.showLoading('Creating checkout session...', 'Please wait while we prepare your payment');
        const { url } = await createCheckoutSession(plan);
        feedback.removeToast(loadingToastId);
        window.location.href = url;
      }
    } catch (error) {
      // Remove loading toast if it was shown (prevents permanent stuck toast)
      if (loadingToastId) {
        feedback.removeToast(loadingToastId);
      }

      const errorMessage = error instanceof Error ? error.message : 'Failed to upgrade plan';

      if (errorMessage.includes('Price ID not configured')) {
        feedback.showError(
          'Stripe Not Configured',
          'Payment processing is not set up yet. Please add your Stripe price IDs to the environment variables.',
          10000
        );
      } else {
        feedback.showError('Upgrade Failed', errorMessage);
      }

      console.error('Upgrade error:', error);
    }
  };

  const handleConfirmUpgrade = async () => {
    if (!pendingUpgradePlan) return;
    setIsUpgrading(true);
    try {
      const result = await upgradeSubscription(pendingUpgradePlan);
      setShowUpgradeConfirm(false);

      if (result.success) {
        feedback.showSuccess(
          'Plan Upgraded!',
          result.message || `Your plan has been upgraded to ${pendingUpgradePlan}. Enjoy your expanded features!`
        );
        await refreshSubscription();
        syncBillingData().catch(() => {});
        // Navigate to dashboard after successful upgrade
        navigateTo('dashboard', true);
        setCurrentPage('dashboard');
      } else if (result.requiresCheckout) {
        const { url } = await createCheckoutSession(pendingUpgradePlan);
        window.location.href = url;
      } else {
        feedback.showError('Upgrade Failed', result.error || 'Failed to upgrade plan. Please try again.');
      }
    } catch (error) {
      feedback.showError('Upgrade Failed', error instanceof Error ? error.message : 'Failed to upgrade plan');
    } finally {
      setIsUpgrading(false);
      setPendingUpgradePlan(null);
      setUpgradePreviewData(null);
    }
  };

  const handleManageSubscription = () => {
    setSettingsInitialTab('billing');
    navigateTo('settings');
    setCurrentPage('settings');
  };

  const renderPage = () => {
    // Public pages — accessible whether signed in or not
    const publicBackTarget = isAuthenticated ? 'dashboard' : 'landing';
    const publicBack = () => handleNavigate(publicBackTarget as Page);

    if (currentPage === 'terms') return <TermsPage onBack={publicBack} />;
    if (currentPage === 'privacy') return <PrivacyPage onBack={publicBack} />;
    if (currentPage === 'cookies') return <CookiePolicyPage onBack={publicBack} />;
    if (currentPage === 'help') return <HelpCenterPage onBack={publicBack} onViewPricing={() => handleNavigate('pricing')} />;
    if (currentPage === 'status') return <StatusPage onBack={publicBack} />;
    if (currentPage === 'features') return <FeaturesPage onBack={publicBack} onGetStarted={isAuthenticated ? undefined : () => setShowAuthModal(true)} onViewPricing={() => handleNavigate('pricing')} />;
    if (currentPage === 'beta') return <BetaPage onGetStarted={() => setShowAuthModal(true)} onBack={publicBack} />;
    if (currentPage === 'security-policy') return <SecurityPolicyPage onBack={publicBack} />;
    if (currentPage === 'data-retention') return <DataRetentionPolicyPage onBack={publicBack} />;
    if (currentPage === 'vulnerability-management') return <VulnerabilityManagementPage onBack={publicBack} />;

    // Show pricing page if requested, even when not authenticated
    if (currentPage === 'pricing' && !isAuthenticated) {
      return (
        <ErrorBoundary>
          <PricingPage
            onBack={() => handleNavigate('landing')}
            onSelectPlan={(plan) => {
              if (plan === 'free') {
                handleGetStarted();
              } else {
                handleGetStarted();
              }
            }}
            currentPlan="free"
          />
        </ErrorBoundary>
      );
    }

    // Always show landing page if not authenticated (except for pricing)
    if (!isAuthenticated) {
      return <LandingPage onGetStarted={handleGetStarted} onSignIn={handleGetStarted} onViewPricing={() => handleNavigate('pricing')} onViewFeatures={() => handleNavigate('features')} />;
    }

    // Only show app UI if authenticated
    // Note: When in DocumentChat or DocumentViewer, header navigation still works
    // because the Header is always rendered when authenticated
    if (selectedDocument) {
      return (
        <DocumentChat
          document={selectedDocument}
          onBack={handleBackToVault}
          onUpgradeNeeded={() => handleUpgradeNeeded('ai-questions')}
        />
      );
    }

    if (viewingDocument) {
      return (
        <DocumentViewer
          document={viewingDocument}
          onBack={handleBackFromViewer}
          onChatWithDocument={() => {
            setSelectedDocument(viewingDocument);
            setViewingDocument(null);
          }}
          currentPlan={subscriptionLoading ? undefined : subscription?.plan}
          onUpgrade={() => handleUpgradeNeeded('features')}
          onUploadRenewal={handleUploadRenewal}
          onNavigateToDocument={(docId: string) => {
            const doc = documents.find(d => d.id === docId);
            if (doc) setViewingDocument(doc);
          }}
        />
      );
    }

    switch (currentPage) {
      case 'pricing':
        return (
          <ErrorBoundary>
            <PricingPage
              onBack={() => handleNavigate('dashboard')}
              onSelectPlan={handleSelectPlan}
              currentPlan={subscription?.plan}
            />
          </ErrorBoundary>
        );
      case 'settings':
        return (
          <ErrorBoundary>
            <AccountSettingsPage initialTab={settingsInitialTab} onSubscriptionChange={refreshSubscription} />
          </ErrorBoundary>
        );
      case 'dashboard':
        return (
          <ErrorBoundary>
            <Dashboard
              documents={documentsLoading ? undefined : documents}
              onNavigate={handleNavigate}
              onAddDocument={() => setShowUploadModal(true)}
              onDocumentDelete={handleDocumentDelete}
              onUpgrade={() => handleUpgradeNeeded('features')}
              onManageSubscription={handleManageSubscription}
              onViewDocument={(docId) => {
                const doc = documents.find(d => d.id === docId);
                if (doc) handleDocumentView(doc);
              }}
            />
          </ErrorBoundary>
        );
      case 'vault':
        if (documentsLoading) {
          return <PageSkeleton title="Document Vault" />;
        }
        return (
          <ErrorBoundary>
            <DocumentVault
              documents={documents}
              onDocumentSelect={handleDocumentSelect}
              onDocumentView={handleDocumentView}
              onDocumentUpload={handleDocumentsUploadNew}
              onDocumentDelete={handleDocumentDelete}
              feedback={feedback}
            />
          </ErrorBoundary>
        );
      case 'audit':
        if (subscriptionLoading) {
          return <PageSkeleton title="Weekly Audit" />;
        }
        if (!subscription || subscription.plan === 'free') {
          return (
            <ErrorBoundary>
              <ProFeatureGate
                featureName="Weekly Audit"
                featureDescription="Automated weekly audits of your document vault to spot gaps, expirations, and action items. Available on Starter and Pro plans."
                featureIcon={ClipboardCheck}
                onUpgrade={() => handleUpgradeNeeded('features')}
                requiredPlan="starter"
              >
                <WeeklyAudit
                  onNavigateToDocument={() => {}}
                />
              </ProFeatureGate>
            </ErrorBoundary>
          );
        }
        return (
          <ErrorBoundary>
            <WeeklyAudit
              onNavigateToDocument={(docId) => {
                const doc = documents.find(d => d.id === docId);
                if (doc) handleDocumentView(doc);
              }}
            />
          </ErrorBoundary>
        );
      case 'life-events':
        if (subscriptionLoading) {
          return <PageSkeleton title="Life Events" />;
        }
        if (!subscription || subscription.plan !== 'pro') {
          return (
            <ErrorBoundary>
              <ProFeatureGate
                featureName="Life Events"
                featureDescription="Plan for major life events with smart document checklists that auto-match your existing documents."
                featureIcon={Compass}
                onUpgrade={() => handleUpgradeNeeded('features')}
              >
                <LifeEventsPage
                  documents={documents}
                  onShowUpload={() => {}}
                />
              </ProFeatureGate>
            </ErrorBoundary>
          );
        }
        return (
          <ErrorBoundary>
            <LifeEventsPage
              documents={documents}
              onShowUpload={() => setShowUploadModal(true)}
            />
          </ErrorBoundary>
        );
      case 'financial-insights':
        if (subscriptionLoading) {
          return <PageSkeleton title="Financial Insights" />;
        }
        if (!subscription || subscription.plan === 'free') {
          return (
            <ErrorBoundary>
              <ProFeatureGate
                featureName="Financial Insights"
                featureDescription="Connect your bank account for AI-powered spending analysis, recurring bill detection, and personalized financial recommendations."
                featureIcon={Landmark}
                onUpgrade={() => handleUpgradeNeeded('features')}
                requiredPlan="starter"
              >
                <FinancialInsightsPage />
              </ProFeatureGate>
            </ErrorBoundary>
          );
        }
        return (
          <ErrorBoundary>
            <FinancialInsightsPage />
          </ErrorBoundary>
        );
      default:
        return (
          <ErrorBoundary>
            <Dashboard
              documents={documentsLoading ? undefined : documents}
              onNavigate={handleNavigate}
              onAddDocument={() => setShowUploadModal(true)}
              onDocumentDelete={handleDocumentDelete}
              onUpgrade={() => handleUpgradeNeeded('features')}
              onManageSubscription={handleManageSubscription}
              onViewDocument={(docId) => {
                const doc = documents.find(d => d.id === docId);
                if (doc) handleDocumentView(doc);
              }}
            />
          </ErrorBoundary>
        );
    }
  };

  const handleDocumentDelete = async (documentId: string) => {
    try {
      const loadingToastId = feedback.showLoading('Deleting document...', 'Please wait while we remove the document');
      await deleteDocument(documentId);
      feedback.removeToast(loadingToastId);
      feedback.showSuccess('Document deleted', 'The document has been successfully removed');
    } catch (error) {
      feedback.showError('Delete failed', error instanceof Error ? error.message : 'Failed to delete document');
      console.error('Delete failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Only show header if authenticated */}
      {isAuthenticated && (
        <>
          <Header
            currentPage={currentPage}
            onNavigate={handleNavigate}
            onSignOut={() => setShowLogoutConfirm(true)}
            onOpenProfile={() => { setSettingsInitialTab('profile'); handleNavigate('settings'); }}
            onOpenNotifications={() => setShowNotificationsModal(true)}
            notificationCount={expiringDocuments.filter(d => !seenNotificationIds.has(d.id)).length}
            currentPlan={subscription?.plan}
          />
          <DunningBanner onNavigate={handleNavigate} />
        </>
      )}

      <div className={isAuthenticated ? 'pb-20 md:pb-0' : ''}>
        {renderPage()}
      </div>

      {/* Footer — only show when not signed in */}
      {!isAuthenticated && !isLoading && (
        <Footer onNavigate={handleNavigate} />
      )}

      {/* Only show auth modal if not authenticated */}
      {showAuthModal && !isAuthenticated && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onAuth={handleAuth}
        />
      )}

      {/* Only show upload modal if authenticated */}
      {showUploadModal && isAuthenticated && (
        <UploadModal
          isOpen={showUploadModal}
          onClose={() => { setShowUploadModal(false); setRenewalContext(null); }}
          onUpload={handleDocumentsUploadNew}
          onUpgradeNeeded={(reason) => handleUpgradeNeeded(reason || 'documents')}
          renewalOf={renewalContext}
        />
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && isAuthenticated && subscription && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={handleSelectPlan}
          reason={upgradeReason}
          currentPlan={subscription.plan}
          currentUsage={{
            documents: documentCount,
            documentLimit: subscription.document_limit,
            aiQuestions: subscription.ai_questions_used,
            aiQuestionsLimit: subscription.ai_questions_limit,
            monthlyUploads: subscription.monthly_uploads_used,
            monthlyUploadLimit: subscription.monthly_upload_limit,
          }}
        />
      )}

      {/* Upgrade Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showUpgradeConfirm}
        onCancel={() => {
          setShowUpgradeConfirm(false);
          setPendingUpgradePlan(null);
          setUpgradePreviewData(null);
        }}
        onConfirm={handleConfirmUpgrade}
        title="Upgrade Plan?"
        message={
          upgradePreviewData?.prorated_amount_display
            ? `You'll be charged ${upgradePreviewData.prorated_amount_display} now for the prorated difference, then ${upgradePreviewData.new_plan_price_display}/month starting next billing cycle.`
            : `Your plan will be upgraded immediately. The prorated difference will be charged to your card on file right away.`
        }
        confirmText="Upgrade Now"
        cancelText="Cancel"
        confirmVariant="primary"
        isLoading={isUpgrading}
      />

      {/* Notifications Modal */}
      {showNotificationsModal && isAuthenticated && (
        <NotificationsModal
          isOpen={showNotificationsModal}
          onClose={() => setShowNotificationsModal(false)}
          expiringDocuments={expiringDocuments}
          seenIds={seenNotificationIds}
          onNotificationRead={(id) => {
            setSeenNotificationIds(prev => {
              const next = new Set(prev);
              next.add(id);
              return next;
            });
          }}
        />
      )}

      {/* Global Search Floating Bubble (visible when authenticated) */}
      {isAuthenticated && (
        <GlobalSearch
          isOpen={globalSearchOpen}
          onToggle={() => setGlobalSearchOpen(prev => !prev)}
          onClose={() => setGlobalSearchOpen(false)}
          onNavigateToDocument={(docId) => {
            const doc = documents.find(d => d.id === docId);
            if (doc) {
              setViewingDocument(doc);
              setSelectedDocument(null);
              setGlobalSearchOpen(false);
              if (currentPage !== 'vault') {
                navigateTo('vault');
                setCurrentPage('vault');
              }
            }
          }}
          onNavigateToDocumentChat={(docId) => {
            const doc = documents.find(d => d.id === docId);
            if (doc) {
              setSelectedDocument(doc);
              setViewingDocument(null);
              setGlobalSearchOpen(false);
              if (currentPage !== 'vault') {
                navigateTo('vault');
                setCurrentPage('vault');
              }
            }
          }}
          onUpgrade={() => handleUpgradeNeeded('features')}
          documents={documents.map(d => ({ id: d.id, name: d.name }))}
        />
      )}

      {/* Onboarding Modal — non-dismissable, shown when profile is incomplete */}
      {showOnboarding && isAuthenticated && (
        <OnboardingModal onComplete={() => setShowOnboarding(false)} />
      )}

      {/* Toast Container */}
      <ToastContainer toasts={feedback.toasts} onClose={feedback.removeToast} />

      {/* Logout Confirmation */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out of your account?"
        confirmText="Sign Out"
        cancelText="Cancel"
        confirmVariant="primary"
        isLoading={isLoggingOut}
        onConfirm={handleSignOut}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}


function PageSkeleton({ title: _title }: { title: string }) {
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <div className="h-7 sm:h-8 bg-slate-200 rounded w-48 mb-2 animate-pulse" />
        <div className="h-4 bg-slate-200 rounded w-72 animate-pulse" />
      </div>
      <div className="space-y-4">
        <div className="h-32 bg-white rounded-xl border border-slate-200 animate-pulse" />
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="h-48 bg-white rounded-xl border border-slate-200 animate-pulse" />
          <div className="h-48 bg-white rounded-xl border border-slate-200 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default App;