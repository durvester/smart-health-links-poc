export interface Patient {
  id: string;
  name: string;
  birthDate?: string;
  gender?: string;
  phone?: string;
  email?: string;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  date: string;
  size: string;
  contentType: string;
}

export interface SessionData {
  patient: Patient;
  documents: Document[];
}

export interface ShlListItem {
  id: string;
  patientName: string;
  status: 'active' | 'expired' | 'revoked';
  expiresAt: string;
  accessCount: number;
  createdAt: string;
  documentCount: number;
}

export interface ShlAccessLogEntry {
  timestamp: string;
  recipient: string;
  location: { city?: string; region?: string; country?: string } | null;
  device: string | null;
}

export interface ShlDetails {
  id: string;
  status: 'active' | 'expired' | 'revoked';
  patientName: string;
  documentCount: number;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  accessCount: number;
  accessLog: ShlAccessLogEntry[];
}
