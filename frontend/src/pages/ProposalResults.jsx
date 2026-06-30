import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAccount } from 'wagmi';
import { ethers } from 'ethers';
import { getEthersProvider, getEthersSigner } from '../utils/adapters';
import ElectionABI from '../../../backend/src/blockchain/abis/Election.json';
import { useToast } from '../context/ToastContext';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function VoteBar({ label, votes, totalVotes, index }) {
  const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
  const colors = [
    'from-indigo-500 to-indigo-600',
    'from-emerald-500 to-emerald-600',
    'from-purple-500 to-purple-600',
    'from-amber-500 to-amber-600',
    'from-rose-500 to-rose-600',
    'from-cyan-500 to-cyan-600',
    'from-pink-500 to-pink-600',
    'from-teal-500 to-teal-600',
  ];
  const colorClass = colors[index % colors.length];

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center">
            {String.fromCharCode(65 + index)}
          </span>
          <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">{label}</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-gray-900 dark:text-white">{pct}%</span>
          <span className="text-xs text-gray-400 dark:text-slate-500 ml-1">({votes} votes)</span>
        </div>
      </div>
      <div className="w-full bg-gray-100 dark:bg-slate-700/60 rounded-full h-3 overflow-hidden">
        <div
          className={`h-3 rounded-full bg-gradient-to-r ${colorClass} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ proposal }) {
  const now = Date.now();
  const endTime = proposal?.endTime ? new Date(proposal.endTime).getTime() : 0;
  const active = endTime > now;

  if (proposal?.executed) {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40">
        Executed
      </span>
    );
  }
  if (active) {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/40 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Live
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400">
      Ended
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProposalResults() {
  const { address, proposalId } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { isConnected } = useAccount();
  const { showToast } = useToast();

  const [proposal, setProposal] = useState(null);
  const [onChainData, setOnChainData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  // ── Fetch on-chain proposal data ───────────────────────────────────────────
  const fetchOnChainProposal = useCallback(async () => {
    try {
      const provider = getEthersProvider();
      if (!provider) return;
      const contract = new ethers.Contract(address, ElectionABI, provider);
      const raw = await contract.getProposal(BigInt(proposalId));
      // raw = [id, proposer, description, endTime, executed, optionNames, optionVotes, target, value]
      setOnChainData({
        id: Number(raw[0]),
        proposer: raw[1],
        description: raw[2],
        endTime: Number(raw[3]) * 1000, // convert to ms
        executed: raw[4],
        optionNames: raw[5],
        optionVotes: raw[6].map(v => Number(v)),
        target: raw[7],
        value: raw[8],
      });
    } catch (e) {
      console.error('Failed to fetch on-chain proposal', e);
    }
  }, [address, proposalId]);

  // ── Also try backend data (for richer info) ────────────────────────────────
  const fetchBackendProposal = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/proposals/${proposalId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setProposal(data.proposal);
      }
    } catch (e) {
      // fallback to on-chain data only
    }
  }, [proposalId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchOnChainProposal(), fetchBackendProposal()]);
      setLoading(false);
    };
    load();
  }, [fetchOnChainProposal, fetchBackendProposal]);

  // Live countdown timer
  useEffect(() => {
    if (!onChainData?.endTime) return;
    const tick = () => {
      const diff = onChainData.endTime - Date.now();
      if (diff <= 0) { setTimeLeft('Voting Ended'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s remaining`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [onChainData?.endTime]);

  // Socket.io for live vote updates
  useEffect(() => {
    const socketUrl = (import.meta.env.VITE_API_BASE || 'http://localhost:5000/api').replace('/api', '');
    const socket = io(socketUrl);
    socket.on('vote:cast', (data) => {
      if (data.electionAddress?.toLowerCase() === address?.toLowerCase()) {
        fetchOnChainProposal();
      }
    });
    return () => socket.disconnect();
  }, [address, fetchOnChainProposal]);

  // ── Execute Proposal ───────────────────────────────────────────────────────
  const handleExecute = async () => {
    setExecuting(true);
    try {
      const signer = await getEthersSigner();
      const contract = new ethers.Contract(address, ElectionABI, signer);
      const tx = await contract.executeProposal(BigInt(proposalId));
      showToast('Executing proposal...', 'info');
      await tx.wait();
      showToast('Proposal executed successfully!', 'success');
      await fetchOnChainProposal();
    } catch (err) {
      showToast(err.reason || err.message || 'Execution failed', 'error');
    } finally {
      setExecuting(false);
    }
  };

  // ── Finalize (run timelock tx) ─────────────────────────────────────────────
  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const signer = await getEthersSigner();
      const contract = new ethers.Contract(address, ElectionABI, signer);
      const tx = await contract.finalizeProposal(BigInt(proposalId));
      showToast('Finalizing financial transaction...', 'info');
      await tx.wait();
      showToast('Financial transaction finalized! ETH sent from Treasury.', 'success');
      await fetchOnChainProposal();
    } catch (err) {
      showToast(err.reason || err.message || 'Finalization failed', 'error');
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // Use on-chain data as source of truth
  const data = onChainData;
  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500 dark:text-slate-400">
        Could not load proposal. Make sure the blockchain node is running.
      </div>
    );
  }

  const totalVotes = data.optionVotes.reduce((s, v) => s + v, 0);
  const winnerIdx = data.optionVotes.indexOf(Math.max(...data.optionVotes));
  const endedAndNotExecuted = Date.now() > data.endTime && !data.executed && totalVotes > 0;
  const isFinancial = data.target !== ethers.ZeroAddress;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Back */}
      <button
        onClick={() => navigate(`/elections/${address}`)}
        className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mb-8"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Election
      </button>

      {/* Main Card */}
      <div className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 border-b border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold text-gray-900 dark:text-white mb-1">
                {data.description}
              </h1>
              <p className="text-xs text-gray-400 dark:text-slate-500 font-mono">
                Proposal #{proposalId} • Proposer: {data.proposer.substring(0, 8)}…
              </p>
            </div>
            <StatusBadge proposal={data} />
          </div>

          {/* Timer / End info */}
          {Date.now() < data.endTime ? (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 rounded-lg px-3 py-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {timeLeft}
            </div>
          ) : (
            <p className="mt-3 text-xs text-gray-400 dark:text-slate-500">
              Ended {new Date(data.endTime).toLocaleString()}
            </p>
          )}

          {isFinancial && (
            <div className="mt-3 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400 rounded-lg px-3 py-1.5">
              💰 Financial Proposal — {ethers.formatEther(data.value)} ETH → {data.target.substring(0, 8)}…
            </div>
          )}
        </div>

        {/* Results Body */}
        <div className="p-6">
          {/* Total votes */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Live Results</h2>
            <span className="text-sm font-semibold text-gray-500 dark:text-slate-400">
              {totalVotes} total vote{totalVotes !== 1 ? 's' : ''}
            </span>
          </div>

          {totalVotes === 0 ? (
            <p className="text-center text-gray-400 dark:text-slate-500 py-6">No votes cast yet.</p>
          ) : (
            data.optionNames.map((name, idx) => (
              <VoteBar
                key={idx}
                index={idx}
                label={name}
                votes={data.optionVotes[idx]}
                totalVotes={totalVotes}
              />
            ))
          )}

          {/* Winner banner */}
          {!data.executed && totalVotes > 0 && Date.now() > data.endTime && (
            <div className="mt-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 border border-emerald-200 dark:border-emerald-800/30 rounded-xl p-4 flex items-center gap-3">
              <span className="text-2xl">🏆</span>
              <div>
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-400">
                  Winner: Option {String.fromCharCode(65 + winnerIdx)} — "{data.optionNames[winnerIdx]}"
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500">
                  {data.optionVotes[winnerIdx]} votes ({totalVotes > 0 ? Math.round((data.optionVotes[winnerIdx] / totalVotes) * 100) : 0}%)
                </p>
              </div>
            </div>
          )}

          {data.executed && (
            <div className="mt-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-400 font-semibold">
              ✅ This proposal has been executed.
            </div>
          )}

          {/* Admin Actions */}
          {isAdmin && (
            <div className="mt-6 space-y-3 border-t border-gray-100 dark:border-slate-700 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-3">Admin Actions</p>
              {endedAndNotExecuted && (
                <button
                  onClick={handleExecute}
                  disabled={executing}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {executing ? (
                    <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Executing...</>
                  ) : '⚡ Execute Proposal'}
                </button>
              )}
              {data.executed && isFinancial && (
                <button
                  onClick={handleFinalize}
                  disabled={finalizing}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {finalizing ? (
                    <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Finalizing...</>
                  ) : '💰 Finalize Financial Transfer'}
                </button>
              )}
              {!endedAndNotExecuted && !data.executed && (
                <p className="text-xs text-center text-gray-400 dark:text-slate-500">
                  {Date.now() < data.endTime ? 'Voting is still in progress.' : totalVotes === 0 ? 'No votes were cast — cannot execute.' : ''}
                </p>
              )}
            </div>
          )}

          {/* Vote button */}
          {!data.executed && Date.now() < data.endTime && (
            <div className="mt-5 border-t border-gray-100 dark:border-slate-700 pt-5">
              <Link
                to={`/elections/${address}/proposals/${proposalId}/vote`}
                className="block w-full py-2.5 text-center rounded-xl text-sm font-semibold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
              >
                🗳️ Cast My Vote
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
