import React, { useState, useEffect } from 'react';
import { AlertTriangle, CreditCard, X, Clock, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { openCustomerPortal } from '../lib/api';
import type { Page } from '../App';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface DunningStatus {
  inDunning: boolean;
  paymentStatus: 'active' | 'past_due' | 'restricted' | 'downgraded';
  dunningStep: number;
  paymentFailedAt: string | null;
  restrictedAt: string | null;
  downgradeDate: string | null;
  deletionDate: string | null;
  previousPlan: string | null;
}

interface DunningBannerProps {
  onNavigate: (page: Page) => void;
}

export function DunningBanner({ onNavigate }: DunningBannerProps) {
  const [status, setStatus] = useState<DunningStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    fetchDunningStatus();
  }, []);

  const fetchDunningStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${API_BASE}/api/dunning/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStatus(data);
        }
      }
    } catch {
      // Silently fail — banner is non-critical
    }
  };

  const handleOpenStripePortal = async () => {
    setOpeningPortal(true);
    try {
      const { url } = await openCustomerPortal();
      window.location.href = url;
    } catch {
      // Fallback to billing settings if portal fails
      onNavigate('settings');
    } finally {
      setOpeningPortal(false);
    }
  };

  if (!status || !status.inDunning || dismissed) return null;

  const { paymentStatus, dunningStep, deletionDate } = status;

  // Banner config by status
  let bgColor: string;
  let borderColor: string;
  let icon: React.ReactNode;
  let title: string;
  let message: string;
  let actionText: string;
  let onAction: () => void;

  if (paymentStatus === 'past_due') {
    bgColor = 'bg-amber-50';
    borderColor = 'border-amber-300';
    icon = <CreditCard className="w-5 h-5 text-amber-600 flex-shrink-0" />;
    title = 'Payment Issue';
    message = "We couldn't process your payment. We'll keep retrying automatically.";
    actionText = 'Update Card';
    onAction = handleOpenStripePortal;
  } else if (paymentStatus === 'restricted') {
    bgColor = 'bg-orange-50';
    borderColor = 'border-orange-300';
    icon = <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />;
    title = 'Account Restricted';
    message = 'Your account is restricted due to unpaid balance. Uploads and AI chat are disabled.';
    actionText = 'Update Card';
    onAction = handleOpenStripePortal;
  } else if (paymentStatus === 'downgraded') {
    bgColor = 'bg-red-50';
    borderColor = 'border-red-300';

    if (dunningStep >= 7 && deletionDate) {
      const delDate = new Date(deletionDate).toLocaleDateString('en-US', { dateStyle: 'medium' });
      icon = <Trash2 className="w-5 h-5 text-red-600 flex-shrink-0" />;
      title = 'Documents Will Be Deleted';
      message = `Excess documents will be permanently deleted on ${delDate}. Resubscribe to prevent this.`;
      actionText = 'Resubscribe';
      onAction = () => onNavigate('pricing');
    } else {
      icon = <Clock className="w-5 h-5 text-red-600 flex-shrink-0" />;
      title = 'Plan Downgraded';
      message = 'Your plan was downgraded to Free due to non-payment.';
      actionText = 'Resubscribe';
      onAction = () => onNavigate('pricing');
    }
  } else {
    return null;
  }

  const textColor = paymentStatus === 'past_due' ? 'text-amber-800' : paymentStatus === 'restricted' ? 'text-orange-800' : 'text-red-800';
  const btnColor = paymentStatus === 'past_due' ? 'bg-amber-600 hover:bg-amber-700' : paymentStatus === 'restricted' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-red-600 hover:bg-red-700';

  return (
    <div className={`${bgColor} border-b ${borderColor} px-4 py-3`}>
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        {icon}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${textColor}`}>{title}</p>
          <p className={`text-xs ${textColor} opacity-80`}>{message}</p>
        </div>
        <button
          onClick={onAction}
          disabled={openingPortal}
          className={`${btnColor} text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors flex-shrink-0 disabled:opacity-60`}
        >
          {openingPortal ? <Loader2 className="w-4 h-4 animate-spin" /> : actionText}
        </button>
        {paymentStatus === 'past_due' && (
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-400 hover:text-amber-600 transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
