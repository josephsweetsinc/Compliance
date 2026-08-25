export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  clinicName: string;
  createdAt: string;
  autoEmailEnabled?: boolean;
  // Billing and Subscription
  subscriptionPlan?: 'free' | 'per_report' | 'monthly_clinic';
  subscriptionStatus?: 'active' | 'inactive' | 'trial' | 'canceled';
  subscriptionCurrentPeriodEnd?: string;
  reportCredits?: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export interface PaymentTransaction {
  id: string;
  userId: string;
  amount: number; // in dollars (e.g. 9 or 250)
  type: 'single_report' | 'credit_pack' | 'monthly_subscription';
  creditsAdded?: number;
  status: 'completed' | 'pending' | 'failed';
  stripeSessionId?: string;
  createdAt: string;
}

export interface ComplianceMetrics {
  patient_name: string;
  device_type: string;
  report_start_date: string;
  report_end_date: string;
  total_days: number;
  days_used_4_plus_hours: number;
  usage_days_percent: number;
  average_usage_hours: number;
  ahi: number;
}

export interface ComplianceReport {
  id: string;
  clinicId: string;
  patientName: string;
  dob?: string;
  licenseNumber?: string;
  licenseState?: string;
  metrics: ComplianceMetrics;
  status: 'Compliant' | 'Non-Compliant';
  createdAt: string;
  expiresAt?: string;
  pdfUrl?: string;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: string;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
