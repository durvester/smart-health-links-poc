import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Spinner, CheckIcon, DocumentIcon, CopyIcon, QrCodeIcon, CloseIcon, ListIcon } from '../components/Icons';
import type { SessionData, Document } from '../types';
import { API_URL } from '../lib/api';

export default function CreateLink() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [expirationDays, setExpirationDays] = useState(90);
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const lastSessionTime = useRef<string | null>(null);

  useEffect(() => {
    // Check if this is a new session (from OAuth callback)
    const sessionParam = searchParams.get('session');
    const timeParam = searchParams.get('t');

    // If there's a new session indicator or the timestamp changed, clear state and refetch
    if (sessionParam === 'new' || (timeParam && timeParam !== lastSessionTime.current)) {
      lastSessionTime.current = timeParam;
      // Clear the URL params to avoid refetch on every render
      setSearchParams({}, { replace: true });
      // Reset all state
      setSession(null);
      setSelectedDocs(new Set());
      setPhone('');
      setEmail('');
      setGeneratedLink(null);
      setError(null);
      setLoading(true);
    }

    fetchSession();
  }, [searchParams]);

  async function fetchSession() {
    try {
      const res = await fetch(`${API_URL}/api/session`, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) {
          setError('Please launch this app from your EHR.');
          return;
        }
        throw new Error('Failed to load session');
      }
      const data = await res.json();
      setSession(data);
      // Select all documents by default
      setSelectedDocs(new Set(data.documents.map((d: Document) => d.id)));
      // Pre-fill contact info
      if (data.patient.phone) setPhone(data.patient.phone);
      if (data.patient.email) setEmail(data.patient.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function toggleDocument(id: string) {
    const next = new Set(selectedDocs);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedDocs(next);
  }

  function toggleAll() {
    if (selectedDocs.size === session?.documents.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(session?.documents.map((d) => d.id)));
    }
  }

  async function generateLink() {
    if (selectedDocs.size === 0) return;
    if (!phone && !email) return;

    setGenerating(true);
    try {
      const res = await fetch(`${API_URL}/api/shl`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentIds: Array.from(selectedDocs),
          phone: phone || null,
          email: email || null,
          expirationDays,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate link');

      const data = await res.json();
      setGeneratedLink(data.viewerUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate link');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm text-center">
          <p className="text-gray-900 font-medium mb-2">Unable to load</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (generatedLink) {
    const copyLink = async () => {
      try {
        await navigator.clipboard.writeText(generatedLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center mx-auto mb-4">
            <CheckIcon className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Link created</h1>
          <p className="text-sm text-gray-500 mb-6">
            {phone && email
              ? 'Sent via SMS and email'
              : phone
              ? 'Sent via SMS'
              : 'Sent via email'}
          </p>
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-xs text-gray-500 break-all font-mono">{generatedLink}</p>
          </div>

          {/* Copy and QR buttons */}
          <div className="flex justify-center gap-3 mb-6">
            <button
              onClick={copyLink}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <CopyIcon className="w-5 h-5 text-gray-600" />
              <span className="text-sm text-gray-700">{copied ? 'Copied!' : 'Copy link'}</span>
            </button>
            <button
              onClick={() => setShowQrModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <QrCodeIcon className="w-5 h-5 text-gray-600" />
              <span className="text-sm text-gray-700">Show QR code</span>
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setGeneratedLink(null);
                setCopied(false);
                fetchSession();
              }}
              className="btn btn-secondary flex-1"
            >
              Create another link
            </button>
            <button
              onClick={() => navigate('/links')}
              className="btn btn-secondary flex-1"
            >
              View all links
            </button>
          </div>
        </div>

        {/* QR Code Modal */}
        {showQrModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-sm w-full p-6 relative">
              <button
                onClick={() => setShowQrModal(false)}
                className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <CloseIcon className="w-5 h-5 text-gray-500" />
              </button>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 text-center">Scan to access documents</h2>
              <div className="flex justify-center mb-4">
                <div className="relative p-4 bg-white">
                  <QRCodeSVG
                    value={generatedLink}
                    size={200}
                    level="M"
                    includeMargin={true}
                  />
                  {/* SMART Logo overlay - ~5-6% of image area */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-1 rounded">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <rect width="24" height="24" fill="white"/>
                      <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" fill="#FF6B35"/>
                      <path d="M12 6l-5 2.5v5L12 16l5-2.5v-5L12 6z" fill="white"/>
                    </svg>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center">
                Point your phone camera at this QR code to open the health documents
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-gray-900">Share Documents</h1>
            <Link
              to="/links"
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <ListIcon className="w-5 h-5" />
              <span>View links</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Patient Info */}
        <section className="mb-8">
          <p className="text-sm text-gray-500 mb-1">Patient</p>
          <p className="text-lg font-medium text-gray-900">{session?.patient.name}</p>
        </section>

        {/* Documents */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">
              {selectedDocs.size} of {session?.documents.length} documents selected
            </p>
            <button onClick={toggleAll} className="text-sm text-gray-900 hover:underline">
              {selectedDocs.size === session?.documents.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="space-y-1">
            {session?.documents.map((doc) => (
              <label
                key={doc.id}
                className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedDocs.has(doc.id) ? 'bg-gray-50' : 'hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedDocs.has(doc.id)}
                  onChange={() => toggleDocument(doc.id)}
                  className="mt-0.5 checkbox"
                />
                <DocumentIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                  <p className="text-xs text-gray-500">
                    {doc.type} &middot; {doc.date} &middot; {doc.size}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Contact Info */}
        <section className="mb-8">
          <p className="text-sm text-gray-500 mb-3">Send link to</p>
          <div className="space-y-3">
            <input
              type="tel"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input"
            />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </div>
          {!phone && !email && (
            <p className="text-xs text-gray-400 mt-2">At least one contact method required</p>
          )}
        </section>

        {/* Expiration */}
        <section className="mb-8">
          <p className="text-sm text-gray-500 mb-3">Link expires in</p>
          <select
            value={expirationDays}
            onChange={(e) => setExpirationDays(Number(e.target.value))}
            className="select"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>1 year</option>
          </select>
        </section>

        {/* Generate Button */}
        <button
          onClick={generateLink}
          disabled={selectedDocs.size === 0 || (!phone && !email) || generating}
          className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? <Spinner /> : 'Generate link'}
        </button>
      </main>
    </div>
  );
}
