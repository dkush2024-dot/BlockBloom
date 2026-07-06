import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAccount } from 'wagmi';
import { ethers } from 'ethers';
import { getEthersSigner } from '../utils/adapters';
import contracts from '../contracts.json';
import { useToast } from '../context/ToastContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

// ─── Reusable Modal ───────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-700 shadow-2xl w-full max-w-lg p-8 mx-4 max-h-[90vh] overflow-y-auto z-10">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ─── Field Input ──────────────────────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function Input({ ...props }) {
  return (
    <input
      {...props}
      className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
    />
  );
}

function PrimaryBtn({ loading, children, ...props }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 mt-2 ${
        loading || props.disabled
          ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 cursor-not-allowed'
          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md'
      }`}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Please wait...
        </span>
      ) : children}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Organizations() {
  const { token, user } = useAuth();
  const { isConnected } = useAccount();
  const { showToast } = useToast();

  const [orgs, setOrgs] = useState([]);
  const [elections, setElections] = useState({});          // orgId -> elections[]
  const [loadingElections, setLoadingElections] = useState({});  // orgId -> bool
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [expandedOrg, setExpandedOrg] = useState(null);

  // Modals
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showCreateElection, setShowCreateElection] = useState(false);
  const [showCreateDept, setShowCreateDept] = useState(false);
  const [targetOrgId, setTargetOrgId] = useState(null);

  // Create Org form
  const [orgName, setOrgName] = useState('');
  const [orgDesc, setOrgDesc] = useState('');
  const [orgAdminAddress, setOrgAdminAddress] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Create Election form
  const [electionName, setElectionName] = useState('');
  const [timelockDelay, setTimelockDelay] = useState('60');
  const [quorumVotes, setQuorumVotes] = useState('3');
  const [deployingElection, setDeployingElection] = useState(false);

  // Create Dept form
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [creatingDept, setCreatingDept] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isSuperAdmin = user?.role === 'superadmin';

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchOrgs = async () => {
    setLoadingOrgs(true);
    try {
      const res = await fetch(`${API_BASE}/organizations`);
      const data = await res.json();
      if (data.success) setOrgs(data.organizations);
    } catch (e) {
      showToast('Failed to load organizations', 'error');
    } finally {
      setLoadingOrgs(false);
    }
  };

  const fetchElectionsForOrg = async (orgId) => {
    setLoadingElections(prev => ({ ...prev, [orgId]: true }));
    try {
      const res = await fetch(`${API_BASE}/elections?orgId=${orgId}`);
      const data = await res.json();
      if (data.success) {
        setElections(prev => ({ ...prev, [orgId]: data.elections }));
      }
    } catch (e) {
      console.error('Failed to load elections for org', orgId);
    } finally {
      setLoadingElections(prev => ({ ...prev, [orgId]: false }));
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  // Toggle org expansion and always re-fetch elections
  const handleToggleOrg = (orgId) => {
    if (expandedOrg === orgId) {
      setExpandedOrg(null);
    } else {
      setExpandedOrg(orgId);
      // Always re-fetch to get the latest elections (don't use stale cache)
      fetchElectionsForOrg(orgId);
    }
  };

  // ── Create Organization ────────────────────────────────────────────────────
  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setCreatingOrg(true);
    try {
      const body = { name: orgName.trim(), description: orgDesc.trim() };
      // SuperAdmin can assign a specific admin wallet
      if (isSuperAdmin && orgAdminAddress.trim()) {
        body.adminAddress = orgAdminAddress.trim();
      }
      const res = await fetch(`${API_BASE}/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Organization "${orgName}" created! 🎉`, 'success');
        setShowCreateOrg(false);
        setOrgName(''); setOrgDesc(''); setOrgAdminAddress('');
        fetchOrgs();
      } else {
        showToast(data.error || 'Failed to create organization', 'error');
      }
    } catch (e) {
      showToast('Network error', 'error');
    } finally {
      setCreatingOrg(false);
    }
  };

  // ── Deploy Election on-chain + index in DB ─────────────────────────────────
  const handleDeployElection = async (e) => {
    e.preventDefault();
    if (!electionName.trim()) return;
    if (!isConnected) { showToast('Please connect your wallet first', 'warning'); return; }

    setDeployingElection(true);
    try {
      const signer = await getEthersSigner();
      if (!signer) throw new Error('No signer available');

      // Get ElectionFactory contract
      const factoryAddress = contracts.ElectionFactory?.address;
      const factoryABI = contracts.ElectionFactory?.abi;
      if (!factoryAddress || !factoryABI) {
        throw new Error('ElectionFactory contract not found in contracts.json. Run deploy-local.js first.');
      }

      // Fetch backend admin address to set as election owner
      let adminAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // fallback to standard Hardhat Account #0
      try {
        const configRes = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'}/auth/admin-address`);
        const configData = await configRes.json();
        if (configData.success && configData.adminAddress) {
          adminAddress = configData.adminAddress;
        }
      } catch (configErr) {
        console.warn('Failed to fetch backend admin address, falling back to local default', configErr);
      }

      const factory = new ethers.Contract(factoryAddress, factoryABI, signer);
      const tx = await factory.createElection(
        targetOrgId,
        electionName.trim(),
        BigInt(timelockDelay),
        BigInt(quorumVotes),
        adminAddress
      );
      showToast('Transaction submitted, waiting for confirmation...', 'info');
      await tx.wait();

      showToast(`Election "${electionName}" deployed on-chain! The indexer will sync it shortly.`, 'success');
      setShowCreateElection(false);
      setElectionName(''); setTimelockDelay('60'); setQuorumVotes('3');

      // Refresh elections for this org after delay to allow indexer to process
      // Clear old cache first so we always show fresh data
      setElections(prev => ({ ...prev, [targetOrgId]: undefined }));
      setTimeout(() => fetchElectionsForOrg(targetOrgId), 5000);
      // Also do a second refresh in case indexer was slow
      setTimeout(() => fetchElectionsForOrg(targetOrgId), 10000);
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to deploy election', 'error');
    } finally {
      setDeployingElection(false);
    }
  };

  // ── Create Department ──────────────────────────────────────────────────────
  const handleCreateDept = async (e) => {
    e.preventDefault();
    if (!deptName.trim()) return;
    setCreatingDept(true);
    try {
      const res = await fetch(`${API_BASE}/organizations/${targetOrgId}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: deptName.trim(), description: deptDesc.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Department "${deptName}" created!`, 'success');
        setShowCreateDept(false);
        setDeptName(''); setDeptDesc('');
      } else {
        showToast(data.error || 'Failed to create department', 'error');
      }
    } catch (e) {
      showToast('Network error', 'error');
    } finally {
      setCreatingDept(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-1">
            Organizations
          </h1>
          <p className="text-gray-500 dark:text-slate-400">
            Multi-org election hub — browse organizations and their elections.
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setShowCreateOrg(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-xl shadow-sm transition-all duration-200 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Organization
          </button>
        )}
      </div>

      {/* Org List */}
      {loadingOrgs ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : orgs.length === 0 ? (
        <div className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-800 p-14 text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center mx-auto mb-4 text-2xl">🏛️</div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">No organizations yet</h3>
          <p className="text-gray-500 dark:text-slate-400 mb-6">Create the first organization to start hosting elections.</p>
          {isSuperAdmin && (
            <button
              onClick={() => setShowCreateOrg(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Create Organization
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {orgs.map(org => (
            <div
              key={org._id}
              className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden"
            >
              {/* Org Header Row */}
              <div
                className="flex items-center justify-between p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1a2035] transition-colors"
                onClick={() => handleToggleOrg(org._id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-950/40 dark:to-purple-950/40 flex items-center justify-center font-bold text-indigo-700 dark:text-indigo-400 text-lg border border-indigo-100 dark:border-indigo-900/30">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{org.name}</h2>
                    {org.description && (
                      <p className="text-sm text-gray-500 dark:text-slate-400">{org.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isAdmin && (
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => { setTargetOrgId(org._id); setShowCreateElection(true); }}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                      >
                        + Election
                      </button>
                      <button
                        onClick={() => { setTargetOrgId(org._id); setShowCreateDept(true); }}
                        className="px-3 py-1.5 text-xs font-semibold bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/40 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                      >
                        + Dept
                      </button>
                    </div>
                  )}
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${expandedOrg === org._id ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Elections Panel */}
              {expandedOrg === org._id && (
                <div className="border-t border-gray-100 dark:border-slate-800 px-6 py-5 bg-gray-50/50 dark:bg-[#0e1320]/60">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-4">Elections</h3>
                  {loadingElections[org._id] ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500" />
                      Loading elections...
                    </div>
                  ) : elections[org._id] === undefined ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500" />
                      Loading elections...
                    </div>
                  ) : elections[org._id].length === 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-gray-400 dark:text-slate-500 py-2">
                        No elections yet.{isAdmin && ' Click "+ Election" above to deploy one.'}
                      </p>
                      <button
                        onClick={() => fetchElectionsForOrg(org._id)}
                        className="text-xs text-indigo-500 hover:text-indigo-700 underline self-start"
                      >
                        ↻ Refresh
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {elections[org._id].map(el => (
                        <Link
                          key={el._id}
                          to={`/elections/${el.contractAddress}`}
                          className="group block bg-white dark:bg-[#151b2c] rounded-xl border border-gray-200 dark:border-slate-700 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-200"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate mr-2">
                              {el.name}
                            </span>
                            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              el.isActive
                                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {el.isActive ? 'Active' : 'Closed'}
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-gray-400 dark:text-slate-500 truncate">
                            {el.contractAddress}
                          </p>
                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/60">
                            <span className="text-xs text-gray-400">
                              {el.proposalCount ?? 0} proposals
                            </span>
                            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                              View →
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Create Org Modal ─── */}
      <Modal open={showCreateOrg} onClose={() => !creatingOrg && setShowCreateOrg(false)} title="Create Organization">
        <form onSubmit={handleCreateOrg} className="space-y-4">
          <Field label="Organization Name">
            <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="e.g. TPBIT University" required />
          </Field>
          <Field label="Description (optional)">
            <textarea
              value={orgDesc}
              onChange={e => setOrgDesc(e.target.value)}
              rows={3}
              placeholder="Brief description of the organization..."
              className="w-full border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </Field>
          {isSuperAdmin && (
            <Field label="Admin Wallet Address" hint="The MetaMask wallet that will manage this org's elections. Leave blank to assign yourself.">
              <Input
                value={orgAdminAddress}
                onChange={e => setOrgAdminAddress(e.target.value)}
                placeholder="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
              />
            </Field>
          )}
          <PrimaryBtn type="submit" loading={creatingOrg}>Create Organization</PrimaryBtn>
        </form>
      </Modal>

      {/* ─── Deploy Election Modal ─── */}
      <Modal open={showCreateElection} onClose={() => !deployingElection && setShowCreateElection(false)} title="Deploy New Election">
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-lg px-3 py-2 mb-4">
          ⛓️ This deploys a new smart contract on the blockchain. Your wallet will prompt you to sign a transaction.
        </p>
        <form onSubmit={handleDeployElection} className="space-y-4">
          <Field label="Election Name">
            <Input value={electionName} onChange={e => setElectionName(e.target.value)} placeholder="e.g. Student Council 2026" required />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Timelock Delay (seconds)" hint="Financial proposal delay before execution">
              <Input type="number" min="0" value={timelockDelay} onChange={e => setTimelockDelay(e.target.value)} />
            </Field>
            <Field label="Quorum Votes" hint="Absolute min votes for a proposal to pass">
              <Input type="number" min="1" value={quorumVotes} onChange={e => setQuorumVotes(e.target.value)} />
            </Field>
          </div>
          <PrimaryBtn type="submit" loading={deployingElection}>🚀 Deploy Election Contract</PrimaryBtn>
        </form>
      </Modal>

      {/* ─── Create Dept Modal ─── */}
      <Modal open={showCreateDept} onClose={() => !creatingDept && setShowCreateDept(false)} title="Create Department">
        <form onSubmit={handleCreateDept} className="space-y-4">
          <Field label="Department Name">
            <Input value={deptName} onChange={e => setDeptName(e.target.value)} placeholder="e.g. Computer Science" required />
          </Field>
          <Field label="Description (optional)">
            <Input value={deptDesc} onChange={e => setDeptDesc(e.target.value)} placeholder="Brief description..." />
          </Field>
          <PrimaryBtn type="submit" loading={creatingDept}>Create Department</PrimaryBtn>
        </form>
      </Modal>
    </div>
  );
}
