import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

// ─── Proposal Status Tag ──────────────────────────────────────────────────────
function ProposalStatus({ endTime, executed }) {
  const now = Date.now();
  const end = new Date(endTime).getTime();
  if (executed) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/30">
      Executed
    </span>
  );
  if (end > now) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/30 flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      Live
    </span>
  );
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400">
      Ended
    </span>
  );
}

export default function ElectionDashboard() {
  const { address } = useParams();
  const { user, token } = useAuth();

  const [election, setElection] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [csvFile, setCsvFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploading, setUploading] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const fetchElectionData = async () => {
    try {
      const [electionRes, proposalRes] = await Promise.all([
        fetch(`${API_BASE}/elections/${address}`),
        fetch(`${API_BASE}/elections/${address}/proposals`),
      ]);

      const electionData = await electionRes.json();
      if (electionData.success) setElection(electionData.election);

      const proposalData = await proposalRes.json();
      if (proposalData.success) setProposals(proposalData.proposals);
    } catch (err) {
      console.error('Error fetching election data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchElectionData();
  }, [address]);

  const handleCsvUpload = async (e) => {
    e.preventDefault();
    if (!csvFile || uploading) return;

    setUploading(true);
    setUploadStatus('Uploading & generating Merkle Tree...');
    const formData = new FormData();
    formData.append('file', csvFile);

    try {
      const res = await fetch(`${API_BASE}/verifications/${address}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setUploadStatus(`✅ Success! ${data.count} students whitelisted. Merkle Root updated on-chain.`);
        setCsvFile(null);
        // Refresh election to show new Merkle root
        const electionRes = await fetch(`${API_BASE}/elections/${address}`);
        const electionData = await electionRes.json();
        if (electionData.success) setElection(electionData.election);
      } else {
        setUploadStatus(`❌ Error: ${data.error || 'Upload failed'}`);
      }
    } catch (err) {
      setUploadStatus('❌ Network error. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!election) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500 dark:text-slate-400">
        Election not found. Make sure the backend event indexer has synced the contract.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* ── Header ── */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-1">
              {election.name}
            </h1>
            <p className="text-xs font-mono text-gray-400 dark:text-slate-500">
              Contract: {election.contractAddress}
            </p>
          </div>
          {isAdmin && (
            <Link
              to={`/elections/${address}/proposals/new`}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-xl shadow-sm transition-all duration-200 flex items-center gap-2 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create Proposal
            </Link>
          )}
        </div>
      </div>

      {/* ── Admin: CSV Upload ── */}
      {isAdmin && (
        <div className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Upload Voter Whitelist</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">CSV with a "walletAddress" column — uploads and sets the Merkle Root on-chain.</p>
            </div>
          </div>

          <form onSubmit={handleCsvUpload} className="flex flex-wrap items-center gap-3">
            <label className="flex-1 min-w-0">
              <input
                type="file"
                accept=".csv"
                onChange={e => setCsvFile(e.target.files[0])}
                className="block w-full text-sm text-gray-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-900/20 file:text-indigo-700 dark:file:text-indigo-400 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900/40 cursor-pointer"
              />
            </label>
            <button
              type="submit"
              disabled={!csvFile || uploading}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                !csvFile || uploading
                  ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              }`}
            >
              {uploading ? 'Processing...' : 'Upload & Generate'}
            </button>
          </form>

          {uploadStatus && (
            <p className={`mt-3 text-sm font-medium ${
              uploadStatus.startsWith('✅') ? 'text-emerald-600 dark:text-emerald-400' :
              uploadStatus.startsWith('❌') ? 'text-red-600 dark:text-red-400' :
              'text-gray-600 dark:text-slate-400'
            }`}>
              {uploadStatus}
            </p>
          )}

          {election.merkleRoot && (
            <p className="mt-2 text-[11px] text-gray-400 dark:text-slate-500 font-mono truncate">
              Current Merkle Root: {election.merkleRoot}
            </p>
          )}
        </div>
      )}

      {/* ── Proposals ── */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-5">Proposals</h2>
        {proposals.length === 0 ? (
          <div className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-800 p-12 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 text-2xl">📋</div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">No proposals yet</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {isAdmin ? 'Create the first proposal using the button above.' : 'No proposals have been created for this election yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {proposals.map(p => (
              <div
                key={p.proposalId ?? p._id}
                className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">{p.description}</h3>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                      Ends: {new Date(p.endTime).toLocaleString()}
                    </p>
                  </div>
                  <ProposalStatus endTime={p.endTime} executed={p.executed} />
                </div>

                {/* Options preview */}
                {p.optionNames?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {p.optionNames.map((opt, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
                        <span className="font-bold text-indigo-500">{String.fromCharCode(65 + idx)}</span>
                        {opt}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {/* Vote button — only if voting is open */}
                  {new Date(p.endTime).getTime() > Date.now() && !p.executed && (
                    <Link
                      to={`/elections/${address}/proposals/${p.proposalId}/vote`}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      🗳️ Vote
                    </Link>
                  )}
                  {/* Results button — always available */}
                  <Link
                    to={`/elections/${address}/proposals/${p.proposalId}/results`}
                    className="px-4 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 text-sm font-semibold rounded-lg transition-colors"
                  >
                    📊 Results
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
