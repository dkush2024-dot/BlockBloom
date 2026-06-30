import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAccount } from 'wagmi';
import { ethers } from 'ethers';
import { getEthersSigner } from '../utils/adapters';
import ElectionABI from '../abis/Election.json';
import { useToast } from '../context/ToastContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

export default function CreateProposal() {
  const { address } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { isConnected } = useAccount();
  const { showToast } = useToast();

  const [election, setElection] = useState(null);
  const [loadingElection, setLoadingElection] = useState(true);

  // Form state
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('60');
  const [options, setOptions] = useState(['', '']);
  const [isFinancial, setIsFinancial] = useState(false);
  const [targetAddress, setTargetAddress] = useState('');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  useEffect(() => {
    const loadElection = async () => {
      try {
        const res = await fetch(`${API_BASE}/elections/${address}`);
        const data = await res.json();
        if (data.success) setElection(data.election);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingElection(false);
      }
    };
    loadElection();
  }, [address]);

  const handleOptionChange = (idx, val) => {
    setOptions(prev => prev.map((o, i) => (i === idx ? val : o)));
  };

  const addOption = () => {
    if (options.length < 8) setOptions(prev => [...prev, '']);
  };

  const removeOption = (idx) => {
    if (options.length > 2) setOptions(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isConnected) { showToast('Please connect your wallet', 'warning'); return; }
    if (!isAdmin) { showToast('Only admins can create proposals', 'error'); return; }

    const cleanOptions = options.map(o => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) { showToast('At least 2 options are required', 'warning'); return; }
    if (!description.trim()) { showToast('Description is required', 'warning'); return; }

    setSubmitting(true);
    try {
      const signer = await getEthersSigner();
      if (!signer) throw new Error('No signer found. Please reconnect your wallet.');

      const contract = new ethers.Contract(address, ElectionABI, signer);

      let tx;
      if (isFinancial) {
        if (!ethers.isAddress(targetAddress)) throw new Error('Invalid target wallet address');
        if (!value || Number(value) <= 0) throw new Error('Value must be greater than 0');
        const valueWei = ethers.parseEther(value);
        tx = await contract.createFinancialProposal(
          description.trim(),
          BigInt(duration),
          cleanOptions,
          targetAddress,
          valueWei
        );
      } else {
        tx = await contract.createProposal(
          description.trim(),
          BigInt(duration),
          cleanOptions
        );
      }

      showToast('Transaction submitted — waiting for confirmation...', 'info');
      await tx.wait();
      showToast('Proposal created successfully! 🎉', 'success');

      // Go back to election dashboard after short delay for indexer sync
      setTimeout(() => navigate(`/elections/${address}`), 1500);
    } catch (err) {
      console.error(err);
      showToast(err.reason || err.message || 'Failed to create proposal', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingElection) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4 text-2xl">🚫</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h1>
        <p className="text-gray-500 dark:text-slate-400">Only election admins can create proposals.</p>
      </div>
    );
  }

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
        Back to {election?.name ?? 'Election'}
      </button>

      <div className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-8">
        {/* Icon + Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Create Proposal</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">for <span className="font-semibold text-indigo-600 dark:text-indigo-400">{election?.name}</span></p>
          </div>
        </div>

        <p className="text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400 rounded-lg px-3 py-2 mb-6">
          ⛓️ This will send a transaction to the blockchain. MetaMask will prompt you to sign.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
              Proposal Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              required
              placeholder="Describe what this proposal is about and what will happen if it passes..."
              className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
              Voting Duration (minutes)
            </label>
            <input
              type="number"
              min="1"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">Voting period: {duration} minute{duration !== '1' ? 's' : ''}. Cannot be changed after creation.</p>
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-slate-400">
                Voting Options (min 2, max 8)
              </label>
              <button
                type="button"
                onClick={addOption}
                disabled={options.length >= 8}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Add Option
              </button>
            </div>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <input
                    type="text"
                    value={opt}
                    onChange={e => handleOptionChange(idx, e.target.value)}
                    required
                    placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                    className="flex-1 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(idx)}
                      className="text-red-400 hover:text-red-600 transition-colors p-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Financial Toggle */}
          <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isFinancial}
                onChange={e => setIsFinancial(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Financial Proposal</span>
                <p className="text-xs text-gray-400 dark:text-slate-500">If approved (Option A wins), ETH is sent from the Treasury to the target address via timelock.</p>
              </div>
            </label>

            {isFinancial && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Target Wallet Address</label>
                  <input
                    type="text"
                    value={targetAddress}
                    onChange={e => setTargetAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Value (ETH)</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder="0.1"
                    className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
              submitting
                ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow hover:shadow-md'
            }`}
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting to blockchain...
              </>
            ) : (
              '🗳️ Create Proposal'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
