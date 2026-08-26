import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { UserProfile } from '../types';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { 
  CreditCard, 
  Check, 
  Sparkles, 
  Zap, 
  ShieldCheck, 
  FileText, 
  Building2, 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw,
  ExternalLink,
  Coins,
  Copy,
  CheckCheck,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  ShieldAlert,
  Info
} from 'lucide-react';

interface BillingConfig {
  configured: boolean;
  publishableKey: string | null;
  pricing: {
    perReport: number;
    monthlySubscription: number;
  };
}

export interface StripeErrorDetails {
  title: string;
  code?: string;
  declineCode?: string;
  type?: string;
  param?: string;
  statusCode?: number;
  explanation: string;
  troubleshootingSteps: string[];
  rawMessage: string;
  timestamp: string;
  retryPlan?: 'per_report' | 'monthly_clinic';
  retryQuantity?: number;
  retrySessionId?: string;
  retryKind?: 'checkout' | 'verify' | 'portal';
}

function interpretStripeError(
  errData: any,
  fallbackMsg: string,
  retryKind: 'checkout' | 'verify' | 'portal' = 'checkout',
  retryPlan?: 'per_report' | 'monthly_clinic',
  retryQuantity: number = 1,
  retrySessionId?: string
): StripeErrorDetails {
  const code = (errData?.code || errData?.raw?.code || '').toString().toLowerCase();
  const declineCode = (errData?.declineCode || errData?.raw?.decline_code || errData?.decline_code || '').toString().toLowerCase();
  const errorType = errData?.type || errData?.raw?.type || '';
  const param = errData?.param || errData?.raw?.param || '';
  const rawMsg = errData?.error || errData?.message || fallbackMsg;

  let title = 'Payment Issue Encountered';
  let explanation = 'An issue occurred while processing your request with the payment provider.';
  let steps: string[] = [
    'Verify your payment card details and billing address.',
    'Click "Retry Payment" to attempt the transaction again.',
    'If the issue persists, try an alternative credit or debit card.',
  ];

  // Specific Stripe error code and decline code mappings
  if (code === 'card_declined' || declineCode) {
    title = 'Payment Card Declined';
    if (declineCode === 'insufficient_funds') {
      title = 'Card Declined: Insufficient Funds';
      explanation = 'Your financial institution declined the transaction because there are insufficient funds or credit limit available.';
      steps = [
        'Verify your current bank account balance or available credit limit.',
        'Try an alternative business or personal credit/debit card.',
        'Contact your bank to authorize the transaction amount.',
      ];
    } else if (declineCode === 'lost_card' || declineCode === 'stolen_card') {
      title = 'Card Declined: Card Flagged';
      explanation = 'The transaction was blocked because this card has been flagged as lost or stolen by the issuer.';
      steps = [
        'Please enter a different, active payment card.',
        'Contact your card provider immediately to resolve the account hold.',
      ];
    } else if (declineCode === 'expired_card' || code === 'expired_card') {
      title = 'Card Declined: Expired Card';
      explanation = 'The card entered has reached its expiration date and was rejected by the issuing bank.';
      steps = [
        'Check the expiration month and year (MM/YY) entered.',
        'Use an active, non-expired credit or debit card.',
      ];
    } else if (
      declineCode === 'incorrect_cvc' || 
      declineCode === 'invalid_cvc' || 
      code === 'incorrect_cvc' || 
      code === 'invalid_cvc'
    ) {
      title = 'Card Declined: Invalid Security Code (CVC)';
      explanation = 'The 3 or 4 digit security code (CVC/CVV) provided did not match your bank records.';
      steps = [
        'For Visa, Mastercard, or Discover: check the 3 digits on the back signature strip.',
        'For American Express: check the 4 digits printed on the front above the account number.',
        'Click Retry and carefully re-enter the card security code.',
      ];
    } else if (
      declineCode === 'incorrect_number' || 
      declineCode === 'invalid_number' || 
      code === 'incorrect_number' || 
      code === 'invalid_number'
    ) {
      title = 'Card Declined: Invalid Card Number';
      explanation = 'The card number entered is invalid or could not be recognized by Visa/Mastercard/Amex.';
      steps = [
        'Double-check all 16 digits of your credit card number.',
        'Ensure there are no accidental letters, dashes, or missing digits.',
      ];
    } else if (declineCode === 'do_not_honor' || declineCode === 'transaction_not_allowed') {
      title = 'Card Declined: Bank Policy Hold';
      explanation = 'Your card issuer blocked the charge under their automated fraud prevention or corporate spending policy.';
      steps = [
        'Call the phone number on the back of your card to authorize online charges for ComplyZzz.',
        'Ask your bank to lift any temporary e-commerce or international charge blocks.',
        'Try a different corporate or personal credit card.',
      ];
    } else {
      explanation = `Your financial institution declined the payment authorization${declineCode ? ` (${declineCode.replace(/_/g, ' ')})` : ''}.`;
      steps = [
        'Ensure your billing ZIP code and billing address match your card statement.',
        'Try an alternate credit or debit card.',
        'Contact your issuing bank for specific authorization details.',
      ];
    }
  } else if (code === 'expired_card') {
    title = 'Card Expired';
    explanation = 'The payment card entered has passed its expiration date.';
    steps = [
      'Enter an updated expiration date.',
      'Use a valid, active credit or debit card.',
    ];
  } else if (code === 'incorrect_cvc' || code === 'invalid_cvc') {
    title = 'Invalid Security Code (CVC)';
    explanation = 'The card verification code (CVC) provided was invalid.';
    steps = [
      'Verify the 3-digit code on the back (or 4-digit code on the front for Amex).',
      'Click Retry and re-enter the correct security code.',
    ];
  } else if (code === 'processing_error') {
    title = 'Gateway Processing Error';
    explanation = 'A temporary network glitch occurred between Stripe and the banking card network.';
    steps = [
      'Wait 15 to 30 seconds for the banking network to settle.',
      'Click the "Retry Payment" button below to re-submit.',
      'Your card was not charged multiple times.',
    ];
  } else if (code === 'rate_limit') {
    title = 'Rate Limit Reached';
    explanation = 'Too many payment requests were initiated in a short period of time.';
    steps = [
      'Wait 10 to 15 seconds before trying again.',
      'Click "Retry Payment" to continue.',
    ];
  } else if (code === 'authentication_required') {
    title = '3D Secure Authentication Required';
    explanation = 'Your card issuer requires 3D Secure verification to authorize this online transaction.';
    steps = [
      'Approve the verification prompt sent via your banking app or SMS code.',
      'Click "Retry Payment" to relaunch the verified checkout window.',
    ];
  } else if (code === 'parameter_invalid_empty' || code === 'resource_missing') {
    title = 'Checkout Configuration Notice';
    explanation = 'A required checkout parameter was missing or could not be verified on the server.';
    steps = [
      'Click "Retry Payment" to generate a fresh checkout session.',
      'Ensure you are logged into your ComplyZzz account.',
    ];
  }

  return {
    title,
    code: code || undefined,
    declineCode: declineCode || undefined,
    type: errorType || undefined,
    param: param || undefined,
    statusCode: errData?.statusCode,
    explanation,
    troubleshootingSteps: steps,
    rawMessage: rawMsg,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    retryPlan,
    retryQuantity,
    retrySessionId,
    retryKind,
  };
}

export default function BillingPage({ 
  profile, 
  setProfile 
}: { 
  profile: UserProfile; 
  setProfile: (p: UserProfile) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [creditQuantity, setCreditQuantity] = useState<number>(1);
  
  // High-fidelity notification & structured Stripe error states
  const [notification, setNotification] = useState<{ type: 'success' | 'info'; message: string } | null>(null);
  const [stripeError, setStripeError] = useState<StripeErrorDetails | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const [checkoutModal, setCheckoutModal] = useState<{ url: string; planName: string; amount: string; sessionId?: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [verifyingModalPayment, setVerifyingModalPayment] = useState(false);

  const sessionId = searchParams.get('session_id');
  const statusParam = searchParams.get('status');
  const planParam = searchParams.get('plan');
  const creditsParam = searchParams.get('credits');

  // Fetch billing configuration
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/billing/config');
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } catch (err) {
        console.error('Error fetching billing configuration:', err);
      } finally {
        setLoadingConfig(false);
      }
    }
    fetchConfig();
  }, []);

  // Handle successful redirect back from Stripe checkout
  useEffect(() => {
    if (statusParam === 'success' && sessionId && profile?.uid) {
      async function completeCheckout() {
        setStripeError(null);
        try {
          const res = await fetch('/api/billing/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              sessionId, 
              userId: profile.uid,
              userEmail: profile.email || '',
            }),
          });

          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            const parsedError = interpretStripeError(
              data,
              `Verification failed with status ${res.status}`,
              'verify',
              (planParam as any) || 'per_report',
              parseInt(creditsParam || '1', 10),
              sessionId
            );
            setStripeError(parsedError);
            return;
          }

          if (data.verified) {
            const userRef = doc(db, 'users', profile.uid);

            if (planParam === 'monthly_clinic' || data.planType === 'monthly_clinic') {
              const nextMonth = new Date();
              nextMonth.setMonth(nextMonth.getMonth() + 1);

              const updates: Partial<UserProfile> = {
                subscriptionPlan: 'monthly_clinic',
                subscriptionStatus: 'active',
                subscriptionCurrentPeriodEnd: nextMonth.toISOString(),
              };
              const custId = data.customerId || profile.stripeCustomerId;
              if (custId) updates.stripeCustomerId = custId;
              const subId = data.subscriptionId || profile.stripeSubscriptionId;
              if (subId) updates.stripeSubscriptionId = subId;

              await updateDoc(userRef, updates);
              setProfile({ ...profile, ...updates });
              setNotification({
                type: 'success',
                message: '🎉 Congratulations! Your $250/month Clinic & Fleet Unlimited Plan is now active. You have unlimited report processing.',
              });
            } else {
              // Per-report credit purchase
              const creditsToAdd = parseInt(creditsParam || String(data.credits || 1), 10);
              const currentCredits = profile.reportCredits ?? 0;
              const newCreditCount = currentCredits + creditsToAdd;

              const updates: Partial<UserProfile> = {
                subscriptionPlan: profile.subscriptionPlan || 'per_report',
                reportCredits: newCreditCount,
              };
              const custId = data.customerId || profile.stripeCustomerId;
              if (custId) updates.stripeCustomerId = custId;

              await updateDoc(userRef, updates);
              setProfile({ ...profile, ...updates });
              setNotification({
                type: 'success',
                message: `🎉 Payment successful! Added ${creditsToAdd} report credit${creditsToAdd > 1 ? 's' : ''} to your account. Available balance: ${newCreditCount} credits.`,
              });
            }
          } else {
            console.warn('Session verification returned not verified:', data);
            setNotification({
              type: 'info',
              message: `Payment status: ${data.paymentStatus || data.status || 'processing'}. Your account balance will update once confirmed.`,
            });
          }
        } catch (err: any) {
          console.error('Error verifying payment session:', err);
          const parsedError = interpretStripeError(
            err,
            err.message || 'Unable to verify payment session with Stripe.',
            'verify',
            (planParam as any) || 'per_report',
            parseInt(creditsParam || '1', 10),
            sessionId
          );
          setStripeError(parsedError);
        } finally {
          // Clean search params without reloading
          setSearchParams({});
        }
      }

      completeCheckout();
    } else if (statusParam === 'cancelled') {
      setNotification({
        type: 'info',
        message: 'Payment checkout was cancelled. No charges were made.',
      });
      setSearchParams({});
    }
  }, [statusParam, sessionId, profile?.uid]);

  const handleCheckout = async (planType: 'per_report' | 'monthly_clinic', quantity: number = 1) => {
    setProcessingPlan(planType === 'per_report' ? `per_report_${quantity}` : 'monthly_clinic');
    setNotification(null);
    setStripeError(null);

    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          quantity,
          userId: profile?.uid || 'user_' + Date.now(),
          userEmail: profile?.email || 'operator@complyzzz.com',
          clinicName: profile?.clinicName || '',
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const parsed = interpretStripeError(
          data,
          data.error || 'Failed to initialize checkout session on server.',
          'checkout',
          planType,
          quantity
        );
        setStripeError(parsed);
        return;
      }

      if (data.simulated) {
        // In preview simulation mode, apply smoothly via local client router
        navigate(
          `/dashboard/billing?session_id=${data.sessionId}&status=success&plan=${planType}${
            planType === 'per_report' ? `&credits=${quantity}` : ''
          }&simulated=true`
        );
        return;
      }

      if (data.url) {
        const planLabel = planType === 'monthly_clinic' ? 'Clinic & Fleet Unlimited Plan' : `${quantity} Report Credit${quantity > 1 ? 's' : ''}`;
        const amountLabel = planType === 'monthly_clinic' ? '$250/mo' : `$${quantity * 9}`;

        // Attempt opening Stripe Checkout directly in a new tab
        const checkoutWindow = window.open(data.url, '_blank', 'noopener,noreferrer');

        // If popup was blocked or running inside embedded iframe, display the explicit checkout modal
        if (!checkoutWindow || checkoutWindow.closed || typeof checkoutWindow.closed === 'undefined') {
          setCheckoutModal({
            url: data.url,
            planName: planLabel,
            amount: amountLabel,
            sessionId: data.sessionId,
          });
        } else {
          setCheckoutModal({
            url: data.url,
            planName: planLabel,
            amount: amountLabel,
            sessionId: data.sessionId,
          });
        }
      } else {
        throw new Error('No checkout URL was returned by Stripe.');
      }
    } catch (err: any) {
      console.error('Checkout launch error:', err);
      const parsed = interpretStripeError(
        err,
        err.message || 'Unable to connect to Stripe Checkout server.',
        'checkout',
        planType,
        quantity
      );
      setStripeError(parsed);
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleOpenPortal = async () => {
    setLoadingPortal(true);
    setNotification(null);
    setStripeError(null);
    try {
      const res = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: profile.stripeCustomerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const parsed = interpretStripeError(
          data,
          data.error || 'Failed to create customer portal session.',
          'portal'
        );
        setStripeError(parsed);
        return;
      }
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('No portal URL received from Stripe.');
      }
    } catch (err: any) {
      console.error('Portal session error:', err);
      const parsed = interpretStripeError(
        err,
        err.message || 'Could not launch Stripe customer portal.',
        'portal'
      );
      setStripeError(parsed);
    } finally {
      setLoadingPortal(false);
    }
  };

  const handleRetryAction = async () => {
    if (!stripeError) return;
    setIsRetrying(true);

    try {
      if (stripeError.retryKind === 'checkout') {
        const plan = stripeError.retryPlan || 'per_report';
        const qty = stripeError.retryQuantity || creditQuantity || 1;
        await handleCheckout(plan, qty);
      } else if (stripeError.retryKind === 'verify' && stripeError.retrySessionId) {
        // Re-verify session
        const res = await fetch('/api/billing/verify-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: stripeError.retrySessionId,
            userId: profile.uid,
            userEmail: profile.email || '',
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.verified) {
          setStripeError(null);
          navigate(
            `/dashboard/billing?session_id=${stripeError.retrySessionId}&status=success&plan=${data.planType || 'per_report'}&credits=${data.credits || 1}`
          );
        } else {
          setStripeError(
            interpretStripeError(
              data,
              'Payment session status still pending or unverified on Stripe.',
              'verify',
              stripeError.retryPlan,
              stripeError.retryQuantity,
              stripeError.retrySessionId
            )
          );
        }
      } else if (stripeError.retryKind === 'portal') {
        await handleOpenPortal();
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCopyDiagnostics = () => {
    if (!stripeError) return;
    const diagnosticPayload = JSON.stringify({
      timestamp: stripeError.timestamp,
      errorTitle: stripeError.title,
      stripeCode: stripeError.code || 'none',
      stripeDeclineCode: stripeError.declineCode || 'none',
      errorType: stripeError.type || 'none',
      param: stripeError.param || 'none',
      rawMessage: stripeError.rawMessage,
      action: stripeError.retryKind,
      plan: stripeError.retryPlan,
      quantity: stripeError.retryQuantity,
      userUid: profile?.uid,
      userEmail: profile?.email,
    }, null, 2);

    navigator.clipboard.writeText(diagnosticPayload);
    setCopiedDiagnostics(true);
    setTimeout(() => setCopiedDiagnostics(false), 2500);
  };

  const checkModalPaymentStatus = async () => {
    if (!checkoutModal?.sessionId || !profile?.uid) return;
    setVerifyingModalPayment(true);
    try {
      const res = await fetch('/api/billing/verify-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: checkoutModal.sessionId,
          userId: profile.uid,
          userEmail: profile.email || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.verified) {
        setCheckoutModal(null);
        navigate(
          `/dashboard/billing?session_id=${checkoutModal.sessionId}&status=success&plan=${data.planType || 'per_report'}&credits=${data.credits || 1}`
        );
      } else {
        setNotification({
          type: 'info',
          message: 'Payment is not yet marked as completed on Stripe. If you just paid, please allow a few moments and check again.',
        });
      }
    } catch (e: any) {
      const parsed = interpretStripeError(
        e,
        e.message || 'Status check error',
        'verify',
        'per_report',
        1,
        checkoutModal.sessionId
      );
      setStripeError(parsed);
    } finally {
      setVerifyingModalPayment(false);
    }
  };

  const handleCopyLink = () => {
    if (checkoutModal?.url) {
      navigator.clipboard.writeText(checkoutModal.url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const isUnlimitedPlan = profile.subscriptionPlan === 'monthly_clinic' && profile.subscriptionStatus === 'active';
  const availableCredits = profile.reportCredits ?? 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 relative">
      {/* Checkout Session Modal (for Iframe / New Tab Launch) */}
      {checkoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 md:p-8 space-y-6 relative">
            <button
              onClick={() => setCheckoutModal(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/50 rounded-2xl text-blue-600 dark:text-blue-400">
                <CreditCard size={28} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Stripe Checkout Ready</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {checkoutModal.planName} • <span className="font-semibold text-slate-700 dark:text-slate-300">{checkoutModal.amount}</span>
                </p>
              </div>
            </div>

            <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/60 rounded-2xl p-4 text-xs text-slate-700 dark:text-slate-300 leading-relaxed space-y-2">
              <p className="font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-blue-600 dark:text-blue-400" />
                Browser Iframe Notice
              </p>
              <p>
                Because secure checkout pages cannot be loaded inside embedded preview frames, please open Stripe Checkout in a new browser tab to complete your payment safely.
              </p>
            </div>

            <div className="space-y-3">
              <a
                href={checkoutModal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 px-6 rounded-2xl font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer text-center text-sm"
              >
                <span>Open Stripe Checkout in New Tab</span>
                <ExternalLink size={18} />
              </a>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedLink ? <CheckCheck size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  <span>{copiedLink ? 'Link Copied!' : 'Copy Payment Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={checkModalPaymentStatus}
                  disabled={verifyingModalPayment}
                  className="py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {verifyingModalPayment ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  <span>I've Completed Payment</span>
                </button>
              </div>
            </div>

            <p className="text-center text-[11px] text-slate-400">
              Payments are 256-bit encrypted and handled directly by Stripe.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Plans & Billing</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Choose between pay-as-you-go report credits or unlimited clinic access.
          </p>
        </div>

        {/* Current Plan Badge */}
        <div className="flex items-center gap-3 bg-white dark:bg-[#0f172a] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className={`p-2 rounded-lg ${isUnlimitedPlan ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400' : 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'}`}>
            {isUnlimitedPlan ? <Building2 size={20} /> : <Coins size={20} />}
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Current Status</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {isUnlimitedPlan ? 'Unlimited Clinic Plan' : `${availableCredits} Report Credit${availableCredits === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
      </header>

      {/* Structured Stripe Error Troubleshooting Card / Toast */}
      {stripeError && (
        <div 
          id="stripe-error-card"
          className="bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-3xl p-5 sm:p-6 shadow-md animate-in slide-in-from-top-2 duration-200 space-y-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded-2xl shrink-0 mt-0.5">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-rose-900 dark:text-rose-100 text-base">
                    {stripeError.title}
                  </h3>
                  {stripeError.code && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-200/80 dark:bg-rose-900 text-rose-900 dark:text-rose-200 text-[11px] font-mono font-bold tracking-tight">
                      {stripeError.code.toUpperCase()}{stripeError.declineCode ? `: ${stripeError.declineCode.toUpperCase()}` : ''}
                    </span>
                  )}
                </div>
                <p className="text-sm text-rose-800 dark:text-rose-200 leading-relaxed">
                  {stripeError.explanation}
                </p>
              </div>
            </div>

            <button
              onClick={() => setStripeError(null)}
              className="text-rose-400 hover:text-rose-700 dark:hover:text-rose-200 p-1.5 rounded-lg hover:bg-rose-100/50 dark:hover:bg-rose-900/40 transition-colors cursor-pointer shrink-0"
              title="Dismiss error"
            >
              <X size={18} />
            </button>
          </div>

          {/* Actionable Troubleshooting Steps */}
          {stripeError.troubleshootingSteps && stripeError.troubleshootingSteps.length > 0 && (
            <div className="bg-white/80 dark:bg-slate-900/70 border border-rose-100 dark:border-rose-900/50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-900 dark:text-rose-300">
                <HelpCircle size={14} className="text-rose-600 dark:text-rose-400" />
                <span>Self-Service Troubleshooting Steps</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 pl-1">
                {stripeError.troubleshootingSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span className="w-4 h-4 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Row: Instant Retry + Technical Diagnostics Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                id="retry-payment-button"
                onClick={handleRetryAction}
                disabled={isRetrying || processingPlan !== null}
                className="py-2.5 px-4 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all flex items-center gap-2 text-xs shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isRetrying ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Retrying Transaction...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    <span>
                      Retry {stripeError.retryKind === 'verify' ? 'Verification' : stripeError.retryKind === 'portal' ? 'Portal Launch' : 'Payment'}
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="py-2.5 px-3 rounded-xl border border-rose-200 dark:border-rose-800/80 hover:bg-rose-100/50 dark:hover:bg-rose-900/30 text-rose-800 dark:text-rose-200 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Info size={14} />
                <span>{showDiagnostics ? 'Hide Error Diagnostics' : 'Show Error Diagnostics'}</span>
                {showDiagnostics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            <span className="text-[11px] text-rose-500/80 dark:text-rose-400/80 font-mono">
              Logged at {stripeError.timestamp}
            </span>
          </div>

          {/* Expandable Technical Diagnostics Accordion */}
          {showDiagnostics && (
            <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 space-y-3 text-xs font-mono border border-slate-800 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-[11px] text-slate-400 font-semibold">Technical Stripe Payload</span>
                <button
                  type="button"
                  onClick={handleCopyDiagnostics}
                  className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copiedDiagnostics ? <CheckCheck size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedDiagnostics ? 'Copied Diagnostics!' : 'Copy Diagnostics'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="bg-slate-800/60 p-2 rounded-lg">
                  <span className="text-slate-400 block text-[10px]">Stripe Code</span>
                  <span className="text-rose-300 font-semibold">{stripeError.code || 'N/A'}</span>
                </div>
                <div className="bg-slate-800/60 p-2 rounded-lg">
                  <span className="text-slate-400 block text-[10px]">Decline Code</span>
                  <span className="text-amber-300 font-semibold">{stripeError.declineCode || 'N/A'}</span>
                </div>
                <div className="bg-slate-800/60 p-2 rounded-lg">
                  <span className="text-slate-400 block text-[10px]">Error Type</span>
                  <span className="text-slate-200">{stripeError.type || 'Standard'}</span>
                </div>
                <div className="bg-slate-800/60 p-2 rounded-lg">
                  <span className="text-slate-400 block text-[10px]">Param / Target</span>
                  <span className="text-slate-200">{stripeError.param || 'N/A'}</span>
                </div>
              </div>

              <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/70 text-[11px] text-slate-300 break-all">
                <span className="text-slate-500 block text-[10px] uppercase font-bold mb-0.5">Raw Stripe Message</span>
                {stripeError.rawMessage}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notification Toast (Success / General Info) */}
      {notification && (
        <div className={`p-4 rounded-xl flex items-start gap-3 border ${
          notification.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200'
            : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/60 text-blue-800 dark:text-blue-200'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" size={20} />
          ) : (
            <Info className="shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" size={20} />
          )}
          <div className="flex-1 text-sm font-medium leading-relaxed">
            {notification.message}
          </div>
          <button 
            onClick={() => setNotification(null)} 
            className="text-xs font-semibold hover:underline opacity-70 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Pricing Cards Grid */}
      <div className="grid md:grid-cols-2 gap-8">
        
        {/* Tier 1: Pay-Per-Report ($9/Report) */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800/70 p-8 shadow-xs flex flex-col justify-between relative transition-all hover:shadow-md">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
              <Zap size={14} className="text-blue-600 dark:text-blue-400" />
              <span>Pay-As-You-Go</span>
            </div>

            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Pay-Per-Report</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 leading-relaxed">
              Ideal for individual commercial drivers, pilots, owner-operators, and occasional physical certification exams.
            </p>

            <div className="mt-6 flex items-baseline gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-6">
              <span className="text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">$9</span>
              <span className="text-slate-500 dark:text-slate-400 font-medium">/ certified report</span>
            </div>

            {/* Credit Pack Selector */}
            <div className="my-6">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Select Quantity
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { qty: 1, label: '1 Report', price: '$9' },
                  { qty: 5, label: '5 Reports', price: '$45' },
                  { qty: 10, label: '10 Reports', price: '$90' },
                ].map((tier) => (
                  <button
                    key={tier.qty}
                    type="button"
                    onClick={() => setCreditQuantity(tier.qty)}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      creditQuantity === tier.qty
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300 font-medium'
                    }`}
                  >
                    <p className="text-xs">{tier.label}</p>
                    <p className="text-sm font-bold mt-0.5">{tier.price}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Feature List */}
            <ul className="space-y-3.5 text-sm text-slate-600 dark:text-slate-300 mb-8">
              <li className="flex items-center gap-3">
                <Check className="text-blue-600 dark:text-blue-400 shrink-0" size={18} />
                <span>Instant AI extraction from any CPAP vendor PDF</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="text-blue-600 dark:text-blue-400 shrink-0" size={18} />
                <span>FMCSA 70% rule & FAA compliance validation</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="text-blue-600 dark:text-blue-400 shrink-0" size={18} />
                <span>Certified clinical determination letter (PDF export)</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="text-blue-600 dark:text-blue-400 shrink-0" size={18} />
                <span>Encrypted SMS delivery directly to your phone</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="text-blue-600 dark:text-blue-400 shrink-0" size={18} />
                <span>1-year secure report history & cloud retrieval</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleCheckout('per_report', creditQuantity)}
            disabled={processingPlan !== null || isRetrying}
            className="w-full py-3.5 px-6 rounded-2xl font-bold bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
          >
            {processingPlan === `per_report_${creditQuantity}` ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Connecting to Checkout...</span>
              </>
            ) : (
              <>
                <CreditCard size={18} />
                <span>Buy {creditQuantity} Report{creditQuantity > 1 ? 's' : ''} (${creditQuantity * 9})</span>
              </>
            )}
          </button>
        </div>

        {/* Tier 2: Unlimited Clinic Plan ($250/Month) */}
        <div className="bg-gradient-to-b from-blue-50/50 to-white dark:from-blue-950/20 dark:to-[#0f172a] rounded-3xl border-2 border-blue-600/80 dark:border-blue-500/80 p-8 shadow-xl relative flex flex-col justify-between">
          <div className="absolute -top-3.5 right-8 bg-blue-600 text-white text-[11px] font-extrabold uppercase tracking-widest px-3.5 py-1 rounded-full shadow-md">
            Recommended for Clinics
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
              <Sparkles size={14} />
              <span>Fleet & Clinic Unlimited</span>
            </div>

            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Clinic & Fleet Plan</h3>
            <p className="text-slate-600 dark:text-slate-300 text-sm mt-2 leading-relaxed">
              Unlimited CPAP compliance audits and certified letters for medical examiners, occupational clinics, and fleet safety managers.
            </p>

            <div className="mt-6 flex items-baseline gap-2 border-b border-blue-100 dark:border-slate-800/60 pb-6">
              <span className="text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">$250</span>
              <span className="text-slate-500 dark:text-slate-400 font-medium">/ month</span>
            </div>

            {/* Feature List */}
            <ul className="space-y-3.5 text-sm text-slate-700 dark:text-slate-200 my-8">
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Check size={14} />
                </div>
                <span className="font-semibold">Unlimited CPAP report uploads & verifications</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Check size={14} />
                </div>
                <span>Batch multi-file queue (process 10 drivers at once)</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Check size={14} />
                </div>
                <span>Automated operator email scorecard summaries</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Check size={14} />
                </div>
                <span>Custom clinic & employer name on official letters</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Check size={14} />
                </div>
                <span>Permanent encrypted archive & instant search</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Check size={14} />
                </div>
                <span>Priority processing engine & 24/7 dedicated support</span>
              </li>
            </ul>
          </div>

          <div>
            {isUnlimitedPlan ? (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center">
                  <p className="text-emerald-700 dark:text-emerald-300 font-bold text-sm flex items-center justify-center gap-2">
                    <CheckCircle2 size={18} />
                    <span>You are on the Clinic & Fleet Plan</span>
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                    Enjoy unlimited processing and compliance letters.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenPortal}
                  disabled={loadingPortal || isRetrying}
                  className="w-full py-3 px-4 rounded-2xl font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-all flex items-center justify-center gap-2 text-xs cursor-pointer shadow-xs"
                >
                  {loadingPortal ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ExternalLink size={14} />
                  )}
                  <span>Manage in Stripe Customer Portal</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleCheckout('monthly_clinic')}
                disabled={processingPlan !== null || isRetrying}
                className="w-full py-4 px-6 rounded-2xl font-bold bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 cursor-pointer disabled:opacity-50"
              >
                {processingPlan === 'monthly_clinic' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Connecting to Stripe...</span>
                  </>
                ) : (
                  <>
                    <span>Subscribe for $250/Month</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Value Assurance / FAQ Strip */}
      <div className="bg-slate-50 dark:bg-[#0f172a]/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6">
        <div className="grid md:grid-cols-3 gap-6 text-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-bold text-slate-800 dark:text-white">DOT & FAA Standards</p>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 leading-relaxed">
                Calculations adhere strictly to FMCSA 70% rule & FAA 6-hour clinical sleep rubrics.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-bold text-slate-800 dark:text-white">Certified PDF Letters</p>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 leading-relaxed">
                Downloadable clinical determination letters with driver and clinic identifiers.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Building2 className="text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-bold text-slate-800 dark:text-white">Enterprise Privacy</p>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 leading-relaxed">
                Secure transmission and encryption protocols safeguard all clinical records.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

