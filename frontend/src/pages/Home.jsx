import { useState, useEffect } from "react";
import { Contract } from "ethers";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import contracts from "../contracts.json";
import { getEthersProvider, getEthersSigner } from "../utils/adapters";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";

import { useToast } from "../context/ToastContext";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";
const EXPECTED_CHAIN_ID = import.meta.env.VITE_REQUIRED_CHAIN_ID || "31337";

function Home() {
  const { showToast } = useToast();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [daos, setDaos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [platformStats, setPlatformStats] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  // Deploy form state
  const [daoName, setDaoName] = useState("");
  const [threshold, setThreshold] = useState("1");
  const [timelockDelay, setTimelockDelay] = useState("60");
  const [quorumPercentage, setQuorumPercentage] = useState("10");

  useEffect(() => {
    fetchDAOs();
    fetchPlatformStats();

    // Connect to WebSocket server on Port 5000
    const socket = io(API_BASE.replace('/api', ''));
    socket.on("dao:created", (newDao) => {
      console.log("Real-time event: DAO Deployed!", newDao);
      fetchDAOs();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchDAOs = async () => {
    try {
      setErrorMessage("");
      setLoading(true);

      // 1. Try to fetch from fast MongoDB backend REST API first
      try {
        const response = await fetch(`${API_BASE}/daos`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            const mapped = result.data.map(dao => ({
              address: dao.contractAddress,
              name: dao.name,
              proposals: dao.proposalCount
            }));
            setDaos(mapped);
            return;
          }
        }
      } catch (backendError) {
        console.warn("Backend down, falling back to on-chain querying:", backendError);
      }

      // 2. On-chain Fallback
      if (!getEthersProvider()) return;
      const provider = await getProvider();
      const factoryAddress = contracts.ElectionFactory?.address;
      const factoryABI = contracts.ElectionFactory?.abi;
      if (!factoryAddress) return;

      await ensureContractDeployed(provider, factoryAddress, "ElectionFactory");

      const factory = new Contract(
        factoryAddress,
        factoryABI,
        provider
      );

      const deployedElections = await factory.getAllElections();

      const details = await Promise.all(
        deployedElections.map(async (address) => {
          const elect = new Contract(address, contracts.Election.abi, provider);
          const name = await elect.name();
          const proposalCount = await elect.proposalCount();
          return { address, name, proposals: Number(proposalCount) };
        })
      );

      setDaos(details);
    } catch (err) {
      const message = err?.message || "Failed to fetch DAOs.";
      setErrorMessage(message);
      console.error("Failed to fetch DAOs:", err);
    } finally {
      setLoading(false);
    }
  };

  const getProvider = async () => {
    const provider = getEthersProvider();
    if (!provider) {
      throw new Error("No Web3 provider found. Please connect your wallet.");
    }
    const network = await provider.getNetwork();
    if (String(network.chainId) !== EXPECTED_CHAIN_ID) {
      throw new Error(
        `Please switch your wallet to the correct network (chainId ${EXPECTED_CHAIN_ID}). Current chainId: ${network.chainId}.`
      );
    }
    return provider;
  };

  const ensureContractDeployed = async (provider, address, name) => {
    const code = await provider.getCode(address);
    if (!code || code === "0x" || code === "0x0") {
      throw new Error(
        `${name} contract is not deployed at ${address} on the current network.`
      );
    }
  };

  const deployDAO = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!daoName.trim()) {
      showToast("Please enter a DAO name.", "warning");
      return;
    }

    setErrorMessage("");
    setDeploying(true);
    try {
      const provider = await getProvider();
      await ensureContractDeployed(provider, contracts.ElectionFactory.address, "ElectionFactory");
      const signer = await getEthersSigner();
      if (!signer) {
        throw new Error("Wallet not connected. Please connect via RainbowKit.");
      }

      const factory = new Contract(
        contracts.ElectionFactory.address,
        contracts.ElectionFactory.abi,
        signer
      );

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

      const tx = await factory.createElection(
        "default_org",
        daoName.trim(),
        BigInt(timelockDelay),
        BigInt(quorumPercentage), // passed as absolute quorum votes count
        adminAddress
      );
      await tx.wait();

      showToast(`"${daoName}" DAO deployed successfully! 🎉`, "success");
      setShowModal(false);
      setDaoName("");
      setThreshold("1");
      setTimelockDelay("60");
      setQuorumPercentage("10");
      await fetchDAOs();
      await fetchPlatformStats();
    } catch (err) {
      const message = err?.message || "Failed to deploy DAO. Check console for details.";
      setErrorMessage(message);
      console.error("Deploy failed:", err);
      showToast(message, "error");
    } finally {
      setDeploying(false);
    }
  };

  const fetchPlatformStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/daos/stats`);
      const result = await res.json();
      if (result.success) setPlatformStats(result.data);
    } catch (err) {
      console.warn("Could not load platform stats:", err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-2">
            Explore DAOs
          </h1>
          <p className="text-gray-500 dark:text-slate-400">
            Discover and participate in decentralized communities deployed on
            BlockBloom.
          </p>
        </div>
        <button
          onClick={() => navigate("/organizations")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-xl shadow-sm transition-all duration-200"
        >
          Manage Organizations
        </button>
      </div>

      {errorMessage && (
        <div className="mb-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Platform Stats Banner */}
      {platformStats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80 mb-1">Total DAOs</p>
            <p className="text-3xl font-bold">{platformStats.totalDAOs}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80 mb-1">Total Proposals</p>
            <p className="text-3xl font-bold">{platformStats.totalProposals}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80 mb-1">Total Votes Cast</p>
            <p className="text-3xl font-bold">{platformStats.totalVotes}</p>
          </div>
        </div>
      )}

      {/* DAO List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : daos.length === 0 ? (
        <div className="bg-white dark:bg-[#151b2c] rounded-3xl border border-gray-200 dark:border-slate-800 p-12 text-center shadow-sm transition-colors">
          <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
            🌱
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
            No DAOs found
          </h3>
          <p className="text-gray-500 dark:text-slate-400 mb-6">
            Be the first to create a community governance protocol.
          </p>
          <button
            onClick={() => navigate("/organizations")}
            className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Go to Organizations
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {daos.map((dao, idx) => (
            <div
              key={idx}
              onClick={() => navigate(`/elections/${dao.address}`)}
              className="bg-white dark:bg-[#151b2c] rounded-3xl border border-gray-200 dark:border-slate-800 p-6 hover:shadow-lg transition-all duration-300 group cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-900/50 flex flex-col h-full relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>

              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-950/40 dark:to-purple-950/40 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-lg border border-indigo-50 dark:border-indigo-950/30 shadow-sm">
                  {dao.name.charAt(0)}
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-900/40">
                  Active
                </span>
              </div>

              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {dao.name}
              </h3>
              <p className="text-gray-500 dark:text-slate-400 mb-6 flex-1 font-mono text-xs">
                {dao.address.substring(0, 6)}...{dao.address.substring(38)}
              </p>

              <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-slate-800">
                <div>
                  <p className="text-xs text-gray-400 dark:text-slate-500 font-medium uppercase tracking-wider mb-1">
                    Proposals
                  </p>
                  <p className="font-semibold text-gray-900 dark:text-white">{dao.proposals}</p>
                </div>
                <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-1 transition-transform flex items-center">
                  View <span className="ml-1">→</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Deploy DAO M      {/* ─── Deploy DAO Modal ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !deploying && setShowModal(false)}
          ></div>
          <div className="relative bg-white dark:bg-[#151b2c] rounded-3xl border border-gray-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-8 mx-4 max-h-[90vh] overflow-y-auto animate-in transition-colors duration-300">
            <button
              onClick={() => !deploying && setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-5 shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-1">
              Deploy New DAO
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center mb-6">
              Create a decentralized governance community on the blockchain.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
                  DAO Name
                </label>
                <input
                  type="text"
                  value={daoName}
                  onChange={(e) => setDaoName(e.target.value)}
                  placeholder="e.g. BlockBloom Governance"
                  className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
                  Governance Token
                </label>
                <div className="flex items-center border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 bg-gray-50 dark:bg-slate-800/40">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center mr-2">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">B</span>
                  </div>
                  <span className="text-sm text-gray-700 dark:text-slate-200 font-medium">$BLOOM Token</span>
                  <span className="ml-auto text-xs font-mono text-gray-400 dark:text-slate-550">
                    {contracts.BloomToken.address.substring(0, 6)}...{contracts.BloomToken.address.substring(38)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Auto-linked to the deployed BloomToken contract.</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
                    Threshold
                  </label>
                  <input
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    min="1"
                    className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">Min tokens</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
                    Timelock (s)
                  </label>
                  <input
                    type="number"
                    value={timelockDelay}
                    onChange={(e) => setTimelockDelay(e.target.value)}
                    min="1"
                    className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">Financial delay</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
                    Quorum %
                  </label>
                  <input
                    type="number"
                    value={quorumPercentage}
                    onChange={(e) => setQuorumPercentage(e.target.value)}
                    min="1"
                    max="100"
                    className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">Min vote %</p>
                </div>
              </div>

              <button
                onClick={deployDAO}
                disabled={deploying}
                className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 mt-2 ${
                  deploying
                    ? "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-650 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md"
                }`}
              >
                {deploying ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deploying to Blockchain...
                  </span>
                ) : (
                  "🚀 Deploy DAO"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
