import { useState, useEffect, useCallback } from 'react';
import * as jose from 'jose';
import pako from 'pako';
import type {
  ShlPayload,
  ManifestResponse,
  FhirBundle,
  FhirPatient,
  FhirDocumentReference,
} from '@myhealthurl/shared';

// ============================================
// Types
// ============================================

type ViewerState =
  | { type: 'loading' }
  | { type: 'no-link' }
  | { type: 'prompt-recipient'; payload: ShlPayload }
  | { type: 'fetching' }
  | { type: 'error'; message: string; errorType?: 'expired' | 'revoked' | 'invalid' }
  | { type: 'success'; patient: FhirPatient; documents: DocumentInfo[]; bundle: FhirBundle };

interface DocumentInfo {
  id: string;
  name: string;
  type: string;
  date: string;
  contentType: string;
  size: number;
  url: string;
}

// ============================================
// Icons
// ============================================

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

// ============================================
// Utilities
// ============================================

function parseShlPayload(base64url: string): ShlPayload | null {
  try {
    const json = new TextDecoder().decode(jose.base64url.decode(base64url));
    return JSON.parse(json) as ShlPayload;
  } catch {
    return null;
  }
}

async function decryptJwe(jwe: string, keyBase64url: string): Promise<Uint8Array> {
  const key = jose.base64url.decode(keyBase64url);

  // jose v5 handles deflate internally via inflateRaw option in the decrypt call
  const decryptOptions = {
    inflateRaw: async (bytes: Uint8Array) => pako.inflateRaw(bytes),
  };

  const { plaintext } = await jose.compactDecrypt(
    jwe,
    key,
    decryptOptions as jose.DecryptOptions
  );

  return new Uint8Array(plaintext);
}

function getPatientDisplayName(patient: FhirPatient): string {
  if (!patient.name || patient.name.length === 0) return 'Patient';

  const name = patient.name[0];
  if (name.text) return name.text;

  const parts: string[] = [];
  if (name.given) parts.push(...name.given);
  if (name.family) parts.push(name.family);

  return parts.join(' ') || 'Patient';
}

function formatDate(dateString: string | undefined): string {
  if (!dateString) return 'Unknown date';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function extractDocuments(bundle: FhirBundle): { patient: FhirPatient; documents: DocumentInfo[] } {
  let patient: FhirPatient | null = null;
  const documents: DocumentInfo[] = [];

  for (const entry of bundle.entry) {
    if (entry.resource.resourceType === 'Patient') {
      patient = entry.resource as FhirPatient;
    } else if (entry.resource.resourceType === 'DocumentReference') {
      const doc = entry.resource as FhirDocumentReference;
      const attachment = doc.content[0]?.attachment;

      if (attachment) {
        documents.push({
          id: doc.id || crypto.randomUUID(),
          name: attachment.title || 'Untitled Document',
          type: doc.type?.coding?.[0]?.display || 'Document',
          date: formatDate(doc.date),
          contentType: attachment.contentType || 'application/octet-stream',
          size: attachment.size || 0,
          url: attachment.url || '',
        });
      }
    }
  }

  if (!patient) {
    throw new Error('No patient found in bundle');
  }

  return { patient, documents };
}

// ============================================
// Main App
// ============================================

export default function App() {
  const [state, setState] = useState<ViewerState>({ type: 'loading' });
  const [recipientName, setRecipientName] = useState('');
  const [shlKey, setShlKey] = useState<string | null>(null);
  const [showBundleModal, setShowBundleModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedBundle, setCopiedBundle] = useState(false);

  // Parse SHL from URL on mount
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#shlink:/')) {
      const payloadBase64 = hash.slice(9);
      const payload = parseShlPayload(payloadBase64);

      if (payload) {
        // Check if expired
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          setState({
            type: 'error',
            message: 'This link has expired.',
            errorType: 'expired',
          });
          return;
        }

        setShlKey(payload.key);
        setState({ type: 'prompt-recipient', payload });
      } else {
        setState({
          type: 'error',
          message: 'Invalid health link format.',
          errorType: 'invalid',
        });
      }
    } else {
      setState({ type: 'no-link' });
    }
  }, []);

  // Fetch and decrypt documents
  const fetchDocuments = useCallback(async (payload: ShlPayload, recipient: string) => {
    setState({ type: 'fetching' });

    try {
      // 1. POST to manifest endpoint
      const manifestRes = await fetch(payload.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient }),
      });

      if (!manifestRes.ok) {
        if (manifestRes.status === 410) {
          const error = await manifestRes.json();
          const isRevoked = error.error?.includes('revoked');
          setState({
            type: 'error',
            message: isRevoked
              ? 'This link has been revoked by the provider.'
              : 'This link has expired.',
            errorType: isRevoked ? 'revoked' : 'expired',
          });
          return;
        }
        throw new Error('Failed to fetch manifest');
      }

      const manifest = (await manifestRes.json()) as ManifestResponse;

      if (!manifest.files || manifest.files.length === 0) {
        throw new Error('No files in manifest');
      }

      // 2. Fetch encrypted bundle from S3
      const bundleFile = manifest.files[0];
      const bundleUrl = bundleFile.location;

      if (!bundleUrl) {
        throw new Error('No bundle location in manifest');
      }

      const bundleRes = await fetch(bundleUrl);
      if (!bundleRes.ok) {
        throw new Error('Failed to fetch bundle');
      }

      const encryptedBundle = await bundleRes.text();

      // 3. Decrypt bundle
      const decryptedBytes = await decryptJwe(encryptedBundle, payload.key);
      const bundleJson = new TextDecoder().decode(decryptedBytes);
      const bundle = JSON.parse(bundleJson) as FhirBundle;

      // 4. Extract patient and documents
      const { patient, documents } = extractDocuments(bundle);

      setState({ type: 'success', patient, documents, bundle });
    } catch (error) {
      console.error('Failed to load documents:', error);
      setState({
        type: 'error',
        message: 'Failed to load your documents. Please try again or contact your healthcare provider.',
        errorType: 'invalid',
      });
    }
  }, []);

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (state.type === 'prompt-recipient' && recipientName.trim()) {
      fetchDocuments(state.payload, recipientName.trim());
    }
  };

  // Download a single document
  const downloadDocument = async (doc: DocumentInfo) => {
    if (!shlKey) return;

    try {
      // Fetch encrypted document
      const res = await fetch(doc.url);
      if (!res.ok) throw new Error('Failed to fetch document');

      const encryptedContent = await res.text();
      const decryptedBytes = await decryptJwe(encryptedContent, shlKey);

      // Create blob and download
      const blob = new Blob([new Uint8Array(decryptedBytes)], { type: doc.contentType });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download document:', error);
      alert('Failed to download document. Please try again.');
    }
  };

  // Download all documents
  const downloadAll = async () => {
    if (state.type !== 'success' || !shlKey) return;

    for (const doc of state.documents) {
      await downloadDocument(doc);
      // Small delay between downloads
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  // ============================================
  // Render
  // ============================================

  // Loading state
  if (state.type === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-6 w-6 text-gray-400" />
      </div>
    );
  }

  // No link state
  if (state.type === 'no-link') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm text-center">
          <ShieldIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">No health link found</h1>
          <p className="text-sm text-gray-500">
            Health links should be in the format:<br />
            <code className="text-xs text-gray-400 font-mono">
              myhealthurl.com#shlink:/...
            </code>
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (state.type === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm text-center">
          <AlertIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            {state.errorType === 'expired'
              ? 'Link expired'
              : state.errorType === 'revoked'
              ? 'Link revoked'
              : 'Unable to load'}
          </h1>
          <p className="text-sm text-gray-500">{state.message}</p>
          {state.errorType !== 'invalid' && (
            <p className="text-xs text-gray-400 mt-4">
              Please contact your healthcare provider for a new link.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Recipient prompt
  if (state.type === 'prompt-recipient') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm w-full">
          <div className="text-center mb-8">
            <ShieldIcon className="w-12 h-12 text-gray-900 mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-gray-900 mb-2">
              {state.payload.label || 'Your Health Documents'}
            </h1>
            <p className="text-sm text-gray-500">
              For your security, please enter your name to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Your name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="input mb-4"
              autoFocus
              required
            />
            <button
              type="submit"
              disabled={!recipientName.trim()}
              className="btn btn-primary w-full disabled:opacity-50"
            >
              View documents
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-6">
            Your access will be logged and the document owner will be notified.
          </p>
        </div>
      </div>
    );
  }

  // Fetching state
  if (state.type === 'fetching') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <Spinner className="h-6 w-6 text-gray-400 mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading your documents...</p>
        </div>
      </div>
    );
  }

  // Success state - show documents
  const patientName = getPatientDisplayName(state.patient);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyBundleJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state.bundle, null, 2));
      setCopiedBundle(true);
      setTimeout(() => setCopiedBundle(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Health Documents</h1>
              <p className="text-sm text-gray-500">{patientName}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyLink}
                className="p-2 text-gray-400 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100"
                title={copied ? 'Copied!' : 'Copy link'}
              >
                <CopyIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowBundleModal(true)}
                className="p-2 text-gray-400 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100"
                title="View FHIR Bundle"
              >
                <CodeIcon className="w-5 h-5" />
              </button>
              <ShieldIcon className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Document count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            {state.documents.length} document{state.documents.length !== 1 ? 's' : ''}
          </p>
          {state.documents.length > 1 && (
            <button onClick={downloadAll} className="text-sm text-gray-900 hover:underline">
              Download all
            </button>
          )}
        </div>

        {/* Document list */}
        <div className="space-y-1">
          {state.documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <DocumentIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                <p className="text-xs text-gray-500">
                  {doc.type} &middot; {doc.date}
                  {doc.size > 0 && <> &middot; {formatFileSize(doc.size)}</>}
                </p>
              </div>
              <button
                onClick={() => downloadDocument(doc)}
                className="p-2 text-gray-400 hover:text-gray-900 transition-colors"
                title="Download"
              >
                <DownloadIcon className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            This link was shared by your healthcare provider.<br />
            Your access has been logged for security purposes.
          </p>
        </div>
      </main>

      {/* FHIR Bundle Modal */}
      {showBundleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">FHIR Bundle</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyBundleJson}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <CopyIcon className="w-4 h-4" />
                  {copiedBundle ? 'Copied!' : 'Copy JSON'}
                </button>
                <button
                  onClick={() => setShowBundleModal(false)}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <CloseIcon className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap">
                {JSON.stringify(state.bundle, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
