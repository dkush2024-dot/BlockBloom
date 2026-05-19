import { useState, useEffect } from "react";
import { BrowserProvider, Contract } from "ethers";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import contracts from "../contracts.json";

function Home() {
  const [daos, setDaos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const navigate = useNavigate();

  // Deploy form state
  const [daoName, setDaoName] = useState("");
  const [threshold, setThreshold] = useState("1");
  const [timelockDelay, setTimelockDelay] = useState("60");

  useEffect(() => {
    fetchDAOs();

    // Connect to WebSocket server on Port 5000
    const socket = io("http://localhost:5000");
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
      setLoading(true);

      // 1. Try to fetch from fast MongoDB backend REST API first
      try {
        const response = await fetch("http://localhost:5000/api/daos");
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
      if (!window.ethereum) return;
      const provider = new BrowserProvider(window.ethereum);

      const factory = new Contract(
        contracts.DAOFactory.address,
        contracts.DAOFactory.abi,
        provider
      );

      const deployedDaos = await factory.getDeployedDAOs();

      const daoDetails = await Promise.all(
        deployedDaos.map(async (address) => {
          const gov = new Contract(address, contracts.Governance.abi, provider);
          const name = await gov.name();
          const proposalCount = await gov.proposalCount();
          return { address, name, proposals: Number(proposalCount) };
        })
      );

      setDaos(daoDetails);
    } catch (err) {
      console.error("Failed to fetch DAOs:", err);
    } finally {
      setLoading(false);
    }
  };

  const deployDAO = async () => {
    if (!daoName.trim()) {
      alert("Please enter a DAO name.");
      return;
    }
    setDeploying(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const factory = new Contract(
        contracts.DAOFactory.address,
        contracts.DAOFactory.abi,
        signer
      );

      const tx = await factory.createDAO(
        daoName.trim(),
        contracts.BloomToken.address,
        BigInt(threshold),
        BigInt(timelockDelay)
      );
      await tx.wait();

      alert(`"${daoName}" DAO deployed successfully! 🎉`);
      setShowModal(false);
      setDaoName("");
      setThreshold("1");
      setTimelockDelay("60");
      await fetchDAOs();
    } catch (err) {
      console.error("Deploy failed:", err);
      alert("Failed to deploy DAO. Check console for details.");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
            Explore DAOs
          </h1>
          <p className="text-gray-500">
            Discover and participate in decentralized communities deployed on
            BlockBloom.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-xl shadow-sm transition-all duration-200"
        >
          + Deploy New DAO
        </button>
      </div>

      {/* DAO List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : daos.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
            🌱
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">
            No DAOs found
          </h3>
          <p className="text-gray-500 mb-6">
            Be the first to create a community governance protocol.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Deploy New DAO
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {daos.map((dao, idx) => (
            <div
              key={idx}
              onClick={() => navigate(`/dao/${dao.address}`)}
              className="bg-white rounded-3xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-300 group cursor-pointer hover:border-indigo-200 flex flex-col h-full relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>

              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-700 font-bold text-lg border border-indigo-50 shadow-sm">
                  {dao.name.charAt(0)}
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                  Active
                </span>
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-indigo-600 transition-colors">
                {dao.name}
              </h3>
              <p className="text-gray-500 mb-6 flex-1 font-mono text-xs">
                {dao.address.substring(0, 6)}...{dao.address.substring(38)}
              </p>

              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">
                    Proposals
                  </p>
                  <p className="font-semibold text-gray-900">{dao.proposals}</p>
                </div>
                <span className="text-sm font-semibold text-indigo-600 group-hover:translate-x-1 transition-transform flex items-center">
                  View <span className="ml-1">→</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Deploy DAO Modal ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !deploying && setShowModal(false)}
          ></div>
          <div className="relative bg-white rounded-3xl border border-gray-200 shadow-2xl w-full max-w-md p-8 mx-4 animate-in">
            <button
              onClick={() => !deploying && setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
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

            <h2 className="text-xl font-bold text-gray-900 text-center mb-1">
              Deploy New DAO
            </h2>
            <p className="text-sm text-gray-500 text-center mb-6">
              Create a decentralized governance community on the blockchain.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  DAO Name
                </label>
                <input
                  type="text"
                  value={daoName}
                  onChange={(e) => setDaoName(e.target.value)}
                  placeholder="e.g. BlockBloom Governance"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Governance Token
                </label>
                <div className="flex items-center border border-gray-200 rounded-xl px-4 py-2.5 bg-gray-50">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center mr-2">
                    <span className="text-xs font-bold text-indigo-600">B</span>
                  </div>
                  <span className="text-sm text-gray-700 font-medium">$BLOOM Token</span>
                  <span className="ml-auto text-xs font-mono text-gray-400">
                    {contracts.BloomToken.address.substring(0, 6)}...{contracts.BloomToken.address.substring(38)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Auto-linked to the deployed BloomToken contract.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Proposal Threshold
                  </label>
                  <input
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    min="1"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">Min tokens to create proposals</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Timelock Delay (sec)
                  </label>
                  <input
                    type="number"
                    value={timelockDelay}
                    onChange={(e) => setTimelockDelay(e.target.value)}
                    min="1"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">Financial tx security delay</p>
                </div>
              </div>

              <button
                onClick={deployDAO}
                disabled={deploying}
                className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 mt-2 ${
                  deploying
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md"
                }`}
              >
                {deploying ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
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
