import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import '../App.css';
import { BrowserProvider } from "ethers"
import { abi, address } from "../vote.json"

function V1Demo() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState();
  const [winner, setWinner] = useState(null);
  const [isVoting, setIsVoting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [view, setView] = useState('vote'); // 'vote' | 'admin'

  // Admin form state
  const [partyName, setPartyName] = useState('');
  const [partySymbol, setPartySymbol] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const isUrl = (str) => {
    if (!str) return false;
    return str.startsWith('http://') || str.startsWith('https://') || str.startsWith('/') || str.startsWith('data:');
  };

  const getContract = async () => {
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new ethers.Contract(address, abi, signer);
  };

  const connectMetaMask = async () => {
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      setAccount(signer.address);
    } catch (error) {
      alert('Failed to connect to MetaMask. Please try again.');
    }
  };

  const vote = async (id) => {
    if (isAdmin) {
      alert("As the admin, you are not allowed to vote in the election.");
      return;
    }
    setIsVoting(true);
    try {
      const votingContract = await getContract();
      await votingContract.vote(id);
      setHasVoted(true);
      alert("Vote submitted successfully!");
    } catch (error) {
      alert("Voting failed or was cancelled.");
    } finally {
      setIsVoting(false);
    }
  };

  const getVoteCount = async () => {
    try {
      const votingContract = await getContract();
      const result = await votingContract.getWinner();
      setWinner(result);
    } catch (error) {
      console.error(error);
    }
  };

  const addCandidate = async () => {
    if (!partyName.trim() || !partySymbol.trim()) {
      alert("Please fill in both Party Name and Party Symbol.");
      return;
    }
    setIsAdding(true);
    try {
      const votingContract = await getContract();
      await votingContract.addCandidate(partyName.trim(), partySymbol.trim());
      alert(`"${partyName}" registered successfully!`);
      setPartyName('');
      setPartySymbol('');
      // Refresh candidates list
      await loadCandidates(votingContract);
    } catch (error) {
      console.error(error);
      alert("Failed to add candidate. Check console for details.");
    } finally {
      setIsAdding(false);
    }
  };

  const deleteCandidate = async (candidateId) => {
    if (!window.confirm("Are you sure you want to remove this candidate?")) return;
    try {
      const votingContract = await getContract();
      await votingContract.removeCandidate(candidateId);
      alert("Candidate removed successfully!");
      await loadCandidates(votingContract);
    } catch (error) {
      console.error(error);
      alert("Failed to remove candidate. Ensure registration is open.");
    }
  };

  const closeRegistration = async () => {
    try {
      const votingContract = await getContract();
      if (registrationOpen) {
        await votingContract.closeRegistration();
        setRegistrationOpen(false);
        alert("Registration irrevocably closed. Voting is now open!");
      }
    } catch (error) {
      alert("Transaction failed.");
    }
  };

  const loadCandidates = async (votingContract) => {
    const cands = [];
    const total = Number(await votingContract.totalCandidates());
    for (let i = 0; i < total; i++) {
      cands.push(await votingContract.candidates(i + 1));
    }
    setCandidates(cands);
  };

  useEffect(() => {
    if (account) {
      const init = async () => {
        try {
          const votingContract = await getContract();
          setContract(votingContract);
          const ownerAddr = await votingContract.owner();
          setIsAdmin(account.toLowerCase() === ownerAddr.toLowerCase());
          setRegistrationOpen(await votingContract.registrationOpen());
          setHasVoted(await votingContract.voters(account));
          await loadCandidates(votingContract);
        } catch (error) {
          console.error("Error initializing:", error);
        }
      };
      init();
    }
  }, [account]);

  const totalVotes = candidates.reduce((sum, c) => sum + Number(c.votes), 0);
  const avatarColors = [
    'bg-violet-100 text-violet-700', 'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700', 'bg-indigo-100 text-indigo-700',
    'bg-cyan-100 text-cyan-700', 'bg-pink-100 text-pink-700',
    'bg-teal-100 text-teal-700', 'bg-orange-100 text-orange-700',
  ];

  // ─── Connect Screen ───────────────────────────────────────────────────
  if (!account) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm w-full max-w-sm p-10 text-center">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">BlockBloom DAO</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            Connect your wallet to view and participate in active governance proposals.
          </p>
          <button onClick={connectMetaMask} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors duration-150">
            Connect Wallet
          </button>
          <p className="mt-4 text-xs text-gray-400">Supports MetaMask & Web3 wallets</p>
        </div>
      </div>
    );
  }

  // ─── Main App ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 3a1 1 0 110 2 1 1 0 010-2zm0 4a4 4 0 014 4H6a4 4 0 014-4z"/>
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-sm">BlockBloom DAO</span>
        </div>
        <div className="flex items-center space-x-3">
          {isAdmin && (
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button onClick={() => setView('vote')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === 'vote' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                Vote
              </button>
              <button onClick={() => setView('admin')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === 'admin' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                Admin
              </button>
            </div>
          )}
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${registrationOpen ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${registrationOpen ? 'bg-amber-500' : 'bg-green-500'}`}></span>
            {registrationOpen ? 'Registration Open' : 'Voting Open'}
          </span>
          <div className="flex items-center space-x-2 bg-gray-100 rounded-lg px-3 py-1.5">
            <div className="w-4 h-4 rounded-full bg-indigo-500 flex-shrink-0"></div>
            <span className="text-xs font-mono text-gray-700">{account.slice(0, 6)}...{account.slice(-4)}</span>
            {isAdmin && <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">Admin</span>}
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ─── ADMIN PANEL ─── */}
        {view === 'admin' && isAdmin && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-gray-500 text-sm mt-1">Register candidates and manage the election lifecycle.</p>
            </div>
            <div className="grid grid-cols-3 gap-6">
              {/* Registration Form */}
              <div className="col-span-2">
                <div className="bg-white border border-gray-200 rounded-2xl">
                  <div className="p-5 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">Register a Candidate</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {registrationOpen ? "Registration is open. Add candidates below." : "Registration is closed. Re-open to add more candidates."}
                    </p>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Party / Candidate Name</label>
                      <input
                        type="text"
                        value={partyName}
                        onChange={(e) => setPartyName(e.target.value)}
                        placeholder="e.g. Progressive Alliance"
                        disabled={!registrationOpen}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Party Logo URL or Abbreviation</label>
                      <input
                        type="text"
                        value={partySymbol}
                        onChange={(e) => setPartySymbol(e.target.value)}
                        placeholder="e.g. https://domain.com/logo.png or BJP"
                        disabled={!registrationOpen}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                    <button
                      onClick={addCandidate}
                      disabled={isAdding || !registrationOpen}
                      className={`w-full font-medium py-2.5 px-4 rounded-xl text-sm transition-colors duration-150 ${
                        isAdding || !registrationOpen
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                      }`}
                    >
                      {isAdding ? 'Registering...' : 'Register Candidate'}
                    </button>
                  </div>

                  {/* Registered candidates list */}
                  {candidates.length > 0 && (
                    <div className="border-t border-gray-100">
                      <div className="p-5 pb-2">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Registered Candidates ({candidates.length})</h3>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {candidates.map((c, i) => (
                          <div key={i} className="flex items-center px-5 py-3">
                            <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-gray-100 border border-gray-200 flex-shrink-0">
                              {isUrl(c.partySymbol) ? (
                                <img src={c.partySymbol} alt="Party Logo" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xs font-bold text-gray-700">{c.partySymbol || c.name.slice(0, 2)}</span>
                              )}
                            </div>
                            <div className="ml-3">
                              <p className="text-sm font-medium text-gray-800">{c.name}</p>
                              <p className="text-xs text-gray-400">
                                {isUrl(c.partySymbol) ? 'Logo: Custom Photo' : `Symbol: ${c.partySymbol}`}
                              </p>
                            </div>
                            <div className="ml-auto flex items-center space-x-3">
                              <span className="text-xs text-gray-400">#{i + 1}</span>
                              <button
                                onClick={() => deleteCandidate(i + 1)}
                                disabled={!registrationOpen}
                                className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Election Controls */}
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Election Controls</h3>
                  <dl className="space-y-3 text-sm mb-5">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Status</dt>
                      <dd className={`font-semibold ${registrationOpen ? 'text-amber-600' : 'text-green-600'}`}>
                        {registrationOpen ? 'Registration' : 'Voting'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Candidates</dt>
                      <dd className="font-medium text-gray-800">{candidates.length}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Total Votes</dt>
                      <dd className="font-medium text-gray-800">{totalVotes}</dd>
                    </div>
                  </dl>
                  <button
                    onClick={closeRegistration}
                    disabled={!registrationOpen}
                    className={`w-full text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors ${
                      registrationOpen
                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {registrationOpen ? '🔒 Permanently Close Registration & Start Voting' : 'Voting Active (Registration Locked)'}
                  </button>
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    {registrationOpen
                      ? "Warning: Closing registration is permanent. You cannot add candidates or reopen it afterwards."
                      : "Registration is permanently closed. Voters are now casting their ballots."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── VOTING PANEL ─── */}
        {view === 'vote' && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${registrationOpen ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                    {registrationOpen ? 'REGISTRATION' : 'ACTIVE'}
                  </span>
                  <span className="text-gray-400 text-xs">Proposal #1</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Community Governance Vote</h1>
                <p className="text-gray-500 text-sm mt-1">
                  {registrationOpen
                    ? "Candidate registration is in progress. Voting will begin once registration is closed by the admin."
                    : "Choose a representative for the next governance period. One vote per wallet."}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-4">
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">
                      {registrationOpen ? 'Registered Candidates' : 'Cast Your Vote'}
                    </h2>
                    {hasVoted && (
                      <p className="text-xs text-amber-600 mt-1">You have already cast your vote for this proposal.</p>
                    )}
                    {registrationOpen && (
                      <p className="text-xs text-amber-600 mt-1">Voting opens once the admin closes registration.</p>
                    )}
                  </div>

                  <div className="divide-y divide-gray-100">
                    {candidates.length === 0 ? (
                      <div className="p-8 text-center text-gray-400 text-sm">
                        {registrationOpen ? 'No candidates registered yet. Admin will add them shortly.' : 'Loading candidates...'}
                      </div>
                    ) : (
                      candidates.map((candidate, index) => {
                        const candidateId = index + 1;
                        const isSelected = selectedCandidate === candidateId;
                        const votes = Number(candidate.votes);
                        const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                        const avatarColor = avatarColors[index % avatarColors.length];

                        return (
                          <label key={index} className={`flex items-center px-5 py-4 cursor-pointer transition-colors duration-100 ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'} ${hasVoted || registrationOpen ? 'pointer-events-none' : ''}`}>
                            <input type="radio" name="candidate" value={candidateId} checked={isSelected} onChange={() => setSelectedCandidate(candidateId)} className="sr-only" />
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300 bg-white'}`}>
                              {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                            </div>
                            <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center bg-gray-100 border border-gray-200 ml-3 flex-shrink-0">
                              {isUrl(candidate.partySymbol) ? (
                                <img src={candidate.partySymbol} alt="Party Logo" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-sm font-bold text-gray-700">{candidate.partySymbol || candidate.name.slice(0, 2)}</span>
                              )}
                            </div>
                            <div className="ml-3 flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <div>
                                  <span className={`text-sm font-medium ${isSelected ? 'text-indigo-900' : 'text-gray-800'}`}>{candidate.name}</span>
                                  {!isUrl(candidate.partySymbol) && (
                                    <span className="ml-2 text-xs text-gray-400">{candidate.partySymbol}</span>
                                  )}
                                </div>
                                <div className="flex items-center space-x-2 text-xs text-gray-500">
                                  <span>{votes} {votes === 1 ? 'vote' : 'votes'}</span>
                                  <span className="text-gray-300">·</span>
                                  <span className="font-semibold text-gray-700">{pct}%</span>
                                </div>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full transition-all duration-500 ${isSelected ? 'bg-indigo-500' : 'bg-gray-300'}`} style={{ width: `${pct}%` }}></div>
                              </div>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>

                  {!registrationOpen && (
                    <div className="p-5 border-t border-gray-100">
                      <button onClick={() => vote(selectedCandidate)} disabled={!selectedCandidate || hasVoted || isVoting}
                        className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-150 ${!selectedCandidate || hasVoted || isVoting ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'}`}>
                        {isVoting ? 'Submitting...' : hasVoted ? 'Vote Recorded' : 'Submit Vote'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Proposal Info</h3>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd className={`font-medium ${registrationOpen ? 'text-amber-600' : 'text-green-600'}`}>{registrationOpen ? 'Registration' : 'Voting Active'}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Network</dt><dd className="font-medium text-gray-800">Localhost</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Candidates</dt><dd className="font-medium text-gray-800">{candidates.length}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Total Votes</dt><dd className="font-medium text-gray-800">{totalVotes}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">Your Vote</dt><dd className={`font-medium ${hasVoted ? 'text-green-600' : 'text-gray-400'}`}>{hasVoted ? 'Recorded ✓' : 'Pending'}</dd></div>
                  </dl>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Current Leader</h3>
                  {winner ? (
                      <div className="text-center py-2">
                        {winner[3] ? (
                          <>
                            <div className="w-10 h-10 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl overflow-hidden flex items-center justify-center font-bold text-lg mx-auto mb-2">
                              ⚖️
                            </div>
                            <p className="font-bold text-gray-900 text-base">It's a Tie!</p>
                            <p className="text-gray-500 text-xs mt-1">Top candidates have {Number(winner[2])} votes</p>
                          </>
                        ) : (
                          <>
                            <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl overflow-hidden flex items-center justify-center font-bold text-sm mx-auto mb-2">
                              {isUrl(winner[1]) ? (
                                <img src={winner[1]} alt="Winner Logo" className="w-full h-full object-cover" />
                              ) : (
                                winner[1] || '?'
                              )}
                            </div>
                            <p className="font-bold text-gray-900 text-base">{winner[0]}</p>
                            <p className="text-gray-500 text-xs mt-1">{Number(winner[2])} votes</p>
                          </>
                        )}
                        <button onClick={getVoteCount} className="w-full mt-3 border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-medium py-1.5 px-3 rounded-lg transition-colors">Refresh</button>
                      </div>
                  ) : (
                    <button onClick={getVoteCount} className="w-full border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium py-2 px-4 rounded-lg transition-colors">Check Results</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default V1Demo;
