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
  Coins
} from 'lucide-react';

interface BillingConfig {
  configured: boolean;
  publishableKey: string | null;
  pricing: {
    perReport: number;
    monthlySubscription: number;
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
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

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
        try {
          const res = await fetch('/api/billing/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              sessionId, 
              userId: profile.uid,
              userEmail: profile.email,
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Verification failed with status ${res.status}`);
          }

          const data = await res.json();

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
          setNotification({
            type: 'error',
            message: `Verification notice: ${err.message || 'Unable to verify payment session'}. If your card was charged, your credits will reflect shortly.`,
          });
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

    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          quantity,
          userId: profile.uid,
          userEmail: profile.email,
          clinicName: profile.clinicName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize checkout.');
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received.');
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setNotification({
        type: 'error',
        message: err.message || 'Checkout failed. Please try again.',
      });
      setProcessingPlan(null);
    }
  };

  const handleOpenPortal = async () => {
    setLoadingPortal(true);
    try {
      const res = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: profile.stripeCustomerId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error('Portal session error:', err);
      setNotification({
        type: 'error',
        message: 'Could not launch Stripe customer portal.',
      });
    } finally {
      setLoadingPortal(false);
    }
  };

  const isUnlimitedPlan = profile.subscriptionPlan === 'monthly_clinic' && profile.subscriptionStatus === 'active';
  const availableCredits = profile.reportCredits ?? 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Plans & Billing</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Choose between pay-as-you-go report credits or unlimited clinic access.
          </p>
        </div>

        {/* Current Plan Badge */}
        <div className="flex items-center gap-3 bg-white dark:bg-[#0f172a] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
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

      {/* Notification Toast */}
      {notification && (
        <div className={`p-4 rounded-xl flex items-start gap-3 border ${
          notification.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200'
            : notification.type === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200'
            : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/60 text-blue-800 dark:text-blue-200'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" size={20} />
          ) : (
            <AlertCircle className="shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" size={20} />
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
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800/70 p-8 shadow-sm flex flex-col justify-between relative transition-all hover:shadow-md">
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
            disabled={processingPlan !== null}
            className="w-full py-3.5 px-6 rounded-2xl font-bold bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
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
                  disabled={loadingPortal}
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
                disabled={processingPlan !== null}
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
