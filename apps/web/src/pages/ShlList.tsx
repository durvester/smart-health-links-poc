import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Spinner, ChevronLeftIcon, ChevronRightIcon, PlusIcon, LinkIcon } from '../components/Icons';
import type { ShlListItem } from '../types';

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

export default function ShlList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shls, setShls] = useState<ShlListItem[]>([]);

  useEffect(() => {
    fetchShls();
  }, []);

  async function fetchShls() {
    try {
      const res = await fetch('/api/shls', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) {
          setError('Session expired. Please launch from your EHR.');
          return;
        }
        throw new Error('Failed to load links');
      }
      const data = await res.json();
      setShls(data.shls || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
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

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
              </Link>
              <h1 className="text-lg font-semibold text-gray-900">Health Links</h1>
            </div>
            <Link
              to="/"
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <PlusIcon className="w-5 h-5" />
              <span>Create link</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {shls.length === 0 ? (
          <div className="text-center py-12">
            <LinkIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No links created yet</p>
            <Link to="/" className="btn btn-primary">
              Create your first link
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {shls.map((shl) => (
              <button
                key={shl.id}
                onClick={() => navigate(`/links/${shl.id}`)}
                className="w-full text-left p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {shl.patientName}
                      </p>
                      <StatusBadge status={shl.status} />
                    </div>
                    <p className="text-xs text-gray-500">
                      Created {format(new Date(shl.createdAt), 'MMM d, yyyy')}
                      {' · '}
                      {shl.status === 'active' ? (
                        <>Expires {format(new Date(shl.expiresAt), 'MMM d, yyyy')}</>
                      ) : shl.status === 'expired' ? (
                        <>Expired {format(new Date(shl.expiresAt), 'MMM d, yyyy')}</>
                      ) : (
                        'Revoked'
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {shl.accessCount} view{shl.accessCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
