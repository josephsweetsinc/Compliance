export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  clinicName: string;
  createdAt: string;
}

export interface ComplianceMetrics {
  patient_name: string;
  start_date: string;
  end_date: string;
  total_nights: number;
  nights_over_4_hours: number;
  compliance_percentage: number;
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
