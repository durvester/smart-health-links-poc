import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import { Spinner, ChevronLeftIcon, CopyIcon, QrCodeIcon, CloseIcon, TrashIcon } from '../components/Icons';
import type { ShlDetails } from '../types';

function StatusBadge({ status }: { status: 'active' | 'expired' | 'revoked' }) {
  const styles = {
    active: 'bg-green-100 text-green-800',
    expired: 'bg-gray-100 text-gray-800',
    revoked: 'bg-red-100 text-red-800',
  };

  const labels = {
    active: 'Active',
    expired: 'Expired',
    revoked: 'Revoked',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function ShlDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shl, setShl] = useState<ShlDetails | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const viewerUrl = `${window.location.origin.replace(':5173', ':5174')}#shlink:/${id}`;

  useEffect(() => {
    fetchDetails();
  }, [id]);

  async function fetchDetails() {
    try {
      const res = await fetch(`/api/shls/${id}`, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 404) {
          setError('Link not found');
          return;
        }
        if (res.status === 401) {
          setError('Session expired. Please launch from your EHR.');
          return;
        }
        throw new Error('Failed to load link details');
      }
      const data = await res.json();
      setShl(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  async function revokeLink() {
    setRevoking(true);
    try {
      const res = await fetch(`/api/shls/${id}/revoke`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to revoke link');
      await fetchDetails();
      setShowRevokeConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setRevoking(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !shl) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm text-center">
          <p className="text-gray-900 font-medium mb-2">Unable to load</p>
          <p className="text-sm text-gray-500">{error || 'Link not found'}</p>
          <Link to="/links" className="btn btn-secondary mt-4 inline-block">
            Back to links
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/links" className="p-1 hover:bg-gray-100 rounded-full transition-colors">
              <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
            </Link>
            <h1 className="text-lg font-semibold text-gray-900">Link Details</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Status and Info */}
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-medium text-gray-900">{shl.patientName}</h2>
            <StatusBadge status={shl.status} />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Created</p>
              <p className="text-gray-900">{format(new Date(shl.createdAt), 'MMM d, yyyy h:mm a')}</p>
            </div>
            <div>
              <p className="text-gray-500">
                {shl.status === 'revoked' ? 'Revoked' : shl.status === 'expired' ? 'Expired' : 'Expires'}
              </p>
              <p className="text-gray-900">{format(new Date(shl.expiresAt), 'MMM d, yyyy h:mm a')}</p>
            </div>
            <div>
              <p className="text-gray-500">Documents</p>
              <p className="text-gray-900">{shl.documentCount}</p>
            </div>
            <div>
              <p className="text-gray-500">Views</p>
              <p className="text-gray-900">{shl.accessCount}</p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500">Created by</p>
              <p className="text-gray-900">{shl.createdBy}</p>
            </div>
          </div>
        </section>

        {/* Actions */}
        {shl.status === 'active' && (
          <section className="mb-8">
            <div className="flex gap-3">
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
                <span className="text-sm text-gray-700">Show QR</span>
              </button>
              <button
                onClick={() => setShowRevokeConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 rounded-lg transition-colors ml-auto"
              >
                <TrashIcon className="w-5 h-5 text-red-600" />
                <span className="text-sm text-red-700">Revoke</span>
              </button>
            </div>
          </section>
        )}

        {/* Access Log */}
        <section>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Access Log</h3>
          {shl.accessLog.length === 0 ? (
            <p className="text-sm text-gray-500">No one has viewed this link yet</p>
          ) : (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">Time</th>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">Recipient</th>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shl.accessLog.map((entry, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 text-gray-900">
                        {format(new Date(entry.timestamp), 'MMM d, h:mm a')}
                      </td>
                      <td className="px-4 py-3 text-gray-900">{entry.recipient}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {entry.location
                          ? [entry.location.city, entry.location.region, entry.location.country]
                              .filter(Boolean)
                              .join(', ')
                          : 'Unknown'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

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
                  value={viewerUrl}
                  size={200}
                  level="M"
                  includeMargin={true}
                />
                {/* SMART Logo overlay */}
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

      {/* Revoke Confirmation Modal */}
      {showRevokeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Revoke this link?</h2>
            <p className="text-sm text-gray-500 mb-6">
              The patient will no longer be able to access their documents using this link.
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRevokeConfirm(false)}
                className="btn btn-secondary flex-1"
                disabled={revoking}
              >
                Cancel
              </button>
              <button
                onClick={revokeLink}
                className="btn bg-red-600 text-white hover:bg-red-700 flex-1 disabled:opacity-50"
                disabled={revoking}
              >
                {revoking ? <Spinner /> : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
