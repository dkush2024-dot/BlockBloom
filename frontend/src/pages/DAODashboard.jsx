import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { BrowserProvider, Contract, formatEther } from "ethers";
import { io } from "socket.io-client";
import contracts from "../contracts.json";

function DAODashboard() {
  const { address } = useParams();
  const [daoName, setDaoName] = useState("");
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tokenBalance, setTokenBalance] = useState("0");
  const [votingPower, setVotingPower] = useState("0");

  // Create proposal form
  const [proposalDesc, setProposalDesc] = useState("");
  const [proposalDuration, setProposalDuration] = useState("5");
  const [proposalOptions, setProposalOptions] = useState(["Yes", "No"]);

  // Vote state
  const [votingOn, setVotingOn] = useState(null);

  useEffect(() => {
    connectAndLoad();

    // Connect to WebSocket server on Port 5000
    const socket = io("http://localhost:5000");

    // Subscribe to this DAO's update channel
    socket.emit("join:dao", address);

    // Listen to real-time events and refresh state
    socket.on("proposal:created", (newProp) => {
      if (newProp.daoAddress.toLowerCase() === address.toLowerCase()) {
        console.log("Real-time proposal created:", newProp);
        connectAndLoad();
      }
    });

    socket.on("vote:cast", (voteInfo) => {
      if (voteInfo.daoAddress.toLowerCase() === address.toLowerCase()) {
        console.log("Real-time vote cast:", voteInfo);
        connectAndLoad();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [address]);

  const connectAndLoad = async () => {
    try {
      if (!window.ethereum) return;
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      setAccount(signer.address);
      
      // Load user token details
      const token = new Contract(contracts.BloomToken.address, contracts.BloomToken.abi, provider);
      const bal = await token.balanceOf(signer.address);
      const votes = await token.getVotes(signer.address);
      setTokenBalance(parseFloat(formatEther(bal)).toLocaleString(undefined, { maximumFractionDigits: 2 }));
      setVotingPower(parseFloat(formatEther(votes)).toLocaleString(undefined, { maximumFractionDigits: 2 }));

      await loadDAO(provider);
    } catch (err) {
      console.error(err);
    }
  };

  const loadDAO = async (provider) => {
    try {
      setLoading(true);

      // Fetch DAO details from blockchain for Name
      const gov = new Contract(address, contracts.Governance.abi, provider);
      const name = await gov.name();
      setDaoName(name);

      // 1. Try to fetch proposals from MongoDB fast REST API first
      try {
        const response = await fetch(`http://localhost:5000/api/proposals?daoAddress=${address}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            const mapped = result.data.map(p => ({
              id: Number(p.proposalId),
              proposer: p.proposer,
              description: p.description,
              endTime: Math.floor(new Date(p.endTime).getTime() / 1000),
              executed: p.executed,
              optionNames: p.options.map(o => o.name),
              optionVotes: p.options.map(o => parseFloat(formatEther(o.voteCount))),
              target: p.target,
              value: Number(p.value),
            }));
            setProposals(mapped);
            return;
          }
        }
      } catch (backendError) {
        console.warn("Backend down, falling back to on-chain proposal querying:", backendError);
      }

      // 2. On-chain Fallback
      const count = Number(await gov.proposalCount());
      const props = [];
      for (let i = 1; i <= count; i++) {
        const p = await gov.getProposal(i);
        props.push({
          id: Number(p.id),
          proposer: p.proposer,
          description: p.description,
          endTime: Number(p.endTime),
          executed: p.executed,
          optionNames: [...p.optionNames],
          optionVotes: p.optionVotes.map((v) => parseFloat(formatEther(v))),
          target: p.target,
          value: Number(p.value),
        });
      }
      setProposals(props);
    } catch (err) {
      console.error("Error loading DAO:", err);
    } finally {
      setLoading(false);
    }
  };

  const createProposal = async () => {
    if (!proposalDesc.trim()) {
      alert("Please enter a proposal description.");
      return;
    }
    if (proposalOptions.filter((o) => o.trim()).length < 2) {
      alert("At least 2 voting options are required.");
      return;
    }
    setCreating(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const gov = new Contract(address, contracts.Governance.abi, signer);

      const tx = await gov.createProposal(
        proposalDesc.trim(),
        BigInt(proposalDuration),
        proposalOptions.filter((o) => o.trim())
      );
      await tx.wait();

      alert("Proposal created successfully! 🎉");
      setShowCreateModal(false);
      setProposalDesc("");
      setProposalDuration("5");
      setProposalOptions(["Yes", "No"]);
      await loadDAO(new BrowserProvider(window.ethereum));
    } catch (err) {
      console.error("Create proposal failed:", err);
      alert("Failed to create proposal. You may not have enough $BLOOM tokens.");
    } finally {
      setCreating(false);
    }
  };

  const castVote = async (proposalId, optionIndex) => {
    setVotingOn(proposalId);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const gov = new Contract(address, contracts.Governance.abi, signer);
      const tx = await gov.vote(BigInt(proposalId), BigInt(optionIndex));
      await tx.wait();
      alert("Vote cast successfully! ✅");
      await loadDAO(new BrowserProvider(window.ethereum));
    } catch (err) {
      console.error("Vote failed:", err);
      alert("Vote failed. You may have already voted or lack voting power.");
    } finally {
      setVotingOn(null);
    }
  };

  const getTimeRemaining = (endTime) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = endTime - now;
    if (diff <= 0) return "Ended";
    const mins = Math.floor(diff / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m remaining`;
    return `${mins}m remaining`;
  };

  const isActive = (endTime) => {
    return Math.floor(Date.now() / 1000) < endTime;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-gray-400 mb-6">
        <Link to="/" className="hover:text-indigo-600 transition-colors">
          DAOs
        </Link>
        <span>→</span>
        <span className="text-gray-700 font-medium">{daoName}</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
              {daoName.charAt(0)}
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              {daoName}
            </h1>
          </div>
          <p className="text-gray-500 font-mono text-xs ml-[52px]">
            {address}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-xl shadow-sm transition-all duration-200"
        >
          + New Proposal
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Total Proposals</p>
          <p className="text-2xl font-bold text-gray-900">{proposals.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Active Proposals</p>
          <p className="text-2xl font-bold text-green-600">
            {proposals.filter((p) => isActive(p.endTime)).length}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Your Balance</p>
          <p className="text-2xl font-bold text-indigo-600">{tokenBalance} BLOOM</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Voting Power</p>
          <p className="text-2xl font-bold text-purple-600">{votingPower} Votes</p>
        </div>
      </div>

      {/* Proposals */}
      {proposals.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
            📋
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No proposals yet</h3>
          <p className="text-gray-500 mb-6">
            Create the first governance proposal for this DAO.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Create Proposal
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {proposals.map((p) => {
            const totalVotes = p.optionVotes.reduce((a, b) => a + b, 0);
            const active = isActive(p.endTime);
            const maxVotes = Math.max(...p.optionVotes);

            return (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Proposal Header */}
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          active
                            ? "bg-green-50 text-green-700 border border-green-100"
                            : p.executed
                            ? "bg-purple-50 text-purple-700 border border-purple-100"
                            : "bg-gray-100 text-gray-600 border border-gray-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                            active ? "bg-green-500" : p.executed ? "bg-purple-500" : "bg-gray-400"
                          }`}
                        ></span>
                        {active ? "Active" : p.executed ? "Executed" : "Ended"}
                      </span>
                      <span className="text-xs text-gray-400">
                        Proposal #{p.id}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {active ? getTimeRemaining(p.endTime) : "Voting closed"}
                    </span>
                  </div>
                  <p className="text-gray-900 font-semibold text-base leading-relaxed">
                    {p.description}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    by {p.proposer.substring(0, 6)}...{p.proposer.substring(38)} · {totalVotes.toLocaleString()} total votes
                  </p>
                </div>

                {/* Voting Options */}
                <div className="p-6">
                  <div className="space-y-3">
                    {p.optionNames.map((opt, idx) => {
                      const votes = p.optionVotes[idx];
                      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                      const isWinning = votes === maxVotes && totalVotes > 0;

                      return (
                        <div key={idx} className="relative">
                          <div
                            className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                              isWinning && !active
                                ? "border-indigo-200 bg-indigo-50/50"
                                : "border-gray-100 bg-gray-50/50"
                            }`}
                          >
                            <div className="flex items-center space-x-3 z-10 relative">
                              {active && (
                                <button
                                  onClick={() => castVote(p.id, idx)}
                                  disabled={votingOn === p.id}
                                  className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
                                >
                                  ✓
                                </button>
                              )}
                              <span className="text-sm font-medium text-gray-800">{opt}</span>
                            </div>
                            <div className="flex items-center space-x-3 z-10 relative">
                              <span className="text-xs text-gray-500">{votes.toLocaleString()} votes</span>
                              <span
                                className={`text-sm font-bold ${
                                  isWinning && totalVotes > 0 ? "text-indigo-600" : "text-gray-400"
                                }`}
                              >
                                {pct}%
                              </span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="absolute bottom-0 left-0 h-1 rounded-b-xl overflow-hidden w-full">
                            <div
                              className={`h-full transition-all duration-700 ${
                                isWinning ? "bg-indigo-400" : "bg-gray-300"
                              }`}
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Create Proposal Modal ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !creating && setShowCreateModal(false)}
          ></div>
          <div className="relative bg-white rounded-3xl border border-gray-200 shadow-2xl w-full max-w-md p-8 mx-4">
            <button
              onClick={() => !creating && setShowCreateModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-5 shadow-lg">
              <span className="text-white text-xl">📋</span>
            </div>

            <h2 className="text-xl font-bold text-gray-900 text-center mb-1">
              New Proposal
            </h2>
            <p className="text-sm text-gray-500 text-center mb-6">
              Submit a governance proposal for the community to vote on.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Description
                </label>
                <textarea
                  value={proposalDesc}
                  onChange={(e) => setProposalDesc(e.target.value)}
                  placeholder="e.g. Should we allocate 10 ETH to the marketing fund?"
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  value={proposalDuration}
                  onChange={(e) => setProposalDuration(e.target.value)}
                  min="1"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Voting Options
                </label>
                <div className="space-y-2">
                  {proposalOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const copy = [...proposalOptions];
                          copy[idx] = e.target.value;
                          setProposalOptions(copy);
                        }}
                        placeholder={`Option ${idx + 1}`}
                        className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      {proposalOptions.length > 2 && (
                        <button
                          onClick={() =>
                            setProposalOptions(proposalOptions.filter((_, i) => i !== idx))
                          }
                          className="text-rose-400 hover:text-rose-600 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setProposalOptions([...proposalOptions, ""])}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold mt-2 transition-colors"
                >
                  + Add Option
                </button>
              </div>

              <button
                onClick={createProposal}
                disabled={creating}
                className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 mt-2 ${
                  creating
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md"
                }`}
              >
                {creating ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  "📝 Submit Proposal"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DAODashboard;
