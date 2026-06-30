import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ethers } from 'ethers';
import { getEthersProvider, getEthersSigner } from '../utils/adapters';
import ElectionABI from '../abis/Election.json';
import { useToast } from '../context/ToastContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

export default function ElectionVote() {
  const { address, proposalId } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Whitelist & proof state
  const [proof, setProof] = useState([]);
  const [isWhitelisted, setIsWhitelisted] = useState(false);

  // Real proposal data from the chain
  const [proposal, setProposal] = useState(null);

  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [votingEnded, setVotingEnded] = useState(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        // 1. Fetch Merkle proof from backend
        const proofRes = await fetch(`${API_BASE}/verifications/${address}/proof`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const proofData = await proofRes.json();
        if (proofData.success) {
          setProof(proofData.proof);
          setIsWhitelisted(proofData.isWhitelisted);
        }

        // 2. Fetch real proposal data from the smart contract
        const provider = getEthersProvider();
        if (provider) {
          const contract = new ethers.Contract(address, ElectionABI, provider);

          // Get proposal on-chain
          const raw = await contract.getProposal(BigInt(proposalId));
          // raw = [id, proposer, description, endTime, executed, optionNames, optionVotes, target, value]
          const endTimestamp = Number(raw[3]) * 1000;
          setProposal({
            id: Number(raw[0]),
            description: raw[2],
            endTime: endTimestamp,
            executed: raw[4],
            optionNames: raw[5],
            optionVotes: raw[6].map(v => Number(v)),
          });
          setVotingEnded(Date.now() > endTimestamp);

          // Check if the connected wallet has already voted
          if (user?.address) {
            const voted = await contract.hasVoted(BigInt(proposalId), user.address);
            setAlreadyVoted(voted);
          }
        }
      } catch (err) {
        console.error('Failed to load voting data:', err);
        showToast('Failed to load proposal data. Is the blockchain node running?', 'error');
      } finally {
        setLoading(false);
      }
    };

    if (token) init();
    else setLoading(false);
  }, [address, proposalId, token, user?.address]);

  const handleVote = async () => {
    if (selectedOption === null) return;
    if (!window.ethereum) {
      showToast('Please install MetaMask', 'error');
      return;
    }

    setVoting(true);
    try {
      const signer = await getEthersSigner();
      if (!signer) throw new Error('No signer found. Please reconnect your wallet.');

      const contract = new ethers.Contract(address, ElectionABI, signer);
      const tx = await contract.vote(BigInt(proposalId), BigInt(selectedOption), proof);
      showToast('Vote submitted — waiting for confirmation...', 'info');
      await tx.wait();
      showToast('🎉 Vote cast successfully! Redirecting to results...', 'success');

      setTimeout(() => navigate(`/elections/${address}/proposals/${proposalId}/results`), 1800);
    } catch (err) {
      console.error(err);
      const msg = err.reason || err.message || 'Failed to cast vote';
      showToast(msg, 'error');
    } finally {
      setVoting(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        <p className="text-sm text-gray-400 dark:text-slate-500">Checking whitelist & loading ballot...</p>
      </div>
    );
  }

  // ── Not Authenticated ─────────────────────────────────────────────────────
  if (!token || !user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-4 text-2xl">🔐</div>
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Sign In Required</h1>
        <p className="text-gray-500 dark:text-slate-400">Connect your wallet and sign in to vote.</p>
      </div>
    );
  }

  // ── Not Whitelisted ───────────────────────────────────────────────────────
  if (!isWhitelisted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4 text-2xl">🚫</div>
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Access Denied</h1>
        <p className="text-gray-500 dark:text-slate-400">
          Your wallet address is not whitelisted for this election. Only eligible students can vote.
        </p>
        <button
          onClick={() => navigate(`/elections/${address}`)}
          className="mt-6 px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Back to Election
        </button>
      </div>
    );
  }

  // ── Already Voted ─────────────────────────────────────────────────────────
  if (alreadyVoted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4 text-2xl">✅</div>
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Already Voted</h1>
        <p className="text-gray-500 dark:text-slate-400">You have already cast your vote for this proposal.</p>
        <button
          onClick={() => navigate(`/elections/${address}/proposals/${proposalId}/results`)}
          className="mt-6 px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          View Results
        </button>
      </div>
    );
  }

  // ── Voting Ended ──────────────────────────────────────────────────────────
  if (votingEnded) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 text-2xl">⏰</div>
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Voting Closed</h1>
        <p className="text-gray-500 dark:text-slate-400">The voting period for this proposal has ended.</p>
        <button
          onClick={() => navigate(`/elections/${address}/proposals/${proposalId}/results`)}
          className="mt-6 px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          View Final Results
        </button>
      </div>
    );
  }

  // ── Ballot ────────────────────────────────────────────────────────────────
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

      <div className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 border-b border-gray-200 dark:border-slate-700 p-6">
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-1">Cast Your Vote</h1>
          {proposal?.description && (
            <p className="text-sm text-gray-600 dark:text-slate-400">{proposal.description}</p>
          )}
          <div className="mt-3 inline-flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 rounded-lg px-3 py-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            You are whitelisted — Merkle Proof verified ✓
          </div>
          {proposal?.endTime && (
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
              Voting ends: {new Date(proposal.endTime).toLocaleString()}
            </p>
          )}
        </div>

        {/* Options */}
        <div className="p-6">
          <h2 className="text-sm font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-4">Select an option</h2>
          <div className="space-y-3 mb-8">
            {(proposal?.optionNames ?? []).map((opt, index) => (
              <label
                key={index}
                className={`flex items-center gap-4 p-4 border rounded-xl cursor-pointer transition-all duration-200 ${
                  selectedOption === index
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-600 shadow-sm'
                    : 'border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <input
                  type="radio"
                  name="voteOption"
                  className="sr-only"
                  onChange={() => setSelectedOption(index)}
                  checked={selectedOption === index}
                />
                {/* Custom radio */}
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedOption === index
                    ? 'border-indigo-600 bg-indigo-600'
                    : 'border-gray-300 dark:border-slate-600'
                }`}>
                  {selectedOption === index && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <span className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">{opt}</span>
              </label>
            ))}
          </div>

          {/* Submit */}
          <button
            onClick={handleVote}
            disabled={selectedOption === null || voting}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
              selectedOption === null || voting
                ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow hover:shadow-md'
            }`}
          >
            {voting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting vote to blockchain...
              </>
            ) : '🔐 Submit Vote with Merkle Proof'}
          </button>

          <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-3">
            Your vote is immutable once submitted. One wallet = one vote.
          </p>
        </div>
      </div>
    </div>
  );
}
