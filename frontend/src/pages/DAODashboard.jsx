import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Contract, formatEther, parseEther } from "ethers";
import { io } from "socket.io-client";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import contracts from "../contracts.json";
import { getEthersProvider, getEthersSigner } from "../utils/adapters";

import { useToast } from "../context/ToastContext";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";
const EXPECTED_CHAIN_ID = import.meta.env.VITE_REQUIRED_CHAIN_ID || "31337";

function DAODashboard() {
  const { showToast } = useToast();
  const { address } = useParams();
  const { address: connectedAddress, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [daoName, setDaoName] = useState("");
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tokenBalance, setTokenBalance] = useState("0");
  const [errorMessage, setErrorMessage] = useState("");
  const [votingPower, setVotingPower] = useState("0");

  // Create proposal form
  const [proposalDesc, setProposalDesc] = useState("");
  const [proposalDuration, setProposalDuration] = useState("5");
  const [proposalOptions, setProposalOptions] = useState(["Yes", "No"]);
  const [isFinancial, setIsFinancial] = useState(false);
  const [targetAddress, setTargetAddress] = useState("");
  const [ethAmount, setEthAmount] = useState("");

  const [treasuryBalance, setTreasuryBalance] = useState("0");
  const [treasuryAddress, setTreasuryAddress] = useState("");

  // Vote state
  const [votingOn, setVotingOn] = useState(null);

  // AI Summary state
  const [aiSummaries, setAiSummaries] = useState({});
  const [summarizing, setSummarizing] = useState({});
  // (We no longer need client-side Gemini keys as summaries are fetched securely via the backend server)

  // AI Chatbot States
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`chat_history_${address}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSessionId, setChatSessionId] = useState(() => {
    return localStorage.getItem(`chat_session_${address}_${connectedAddress}`) || "";
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(`chat_history_${address}`, JSON.stringify(chatMessages));
    } catch (e) {
      console.warn("Failed to save chat history to sessionStorage", e);
    }
  }, [chatMessages, address]);

  useEffect(() => {
    connectAndLoad();

    // Connect to WebSocket server on Port 5000
    const socket = io(API_BASE.replace('/api', ''));

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

    socket.on("proposal:executed", () => connectAndLoad());
    socket.on("proposal:closed", () => connectAndLoad());

    return () => {
      socket.disconnect();
    };
  }, [address, connectedAddress]);

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
      throw new Error(`${name} contract is not deployed at ${address} on the current network.`);
    }
  };

  const connectAndLoad = async () => {
    try {
      setErrorMessage("");
      const provider = await getProvider();
      const signer = await getEthersSigner();
      
      if (signer) {
        const addressString = await signer.getAddress();
        setAccount(addressString);
        
        // Load user token details
        await ensureContractDeployed(provider, contracts.BloomToken.address, "BloomToken");
        const token = new Contract(contracts.BloomToken.address, contracts.BloomToken.abi, provider);
        const bal = await token.balanceOf(addressString);
        const votes = await token.getVotes(addressString);
        setTokenBalance(parseFloat(formatEther(bal)).toLocaleString(undefined, { maximumFractionDigits: 2 }));
        setVotingPower(parseFloat(formatEther(votes)).toLocaleString(undefined, { maximumFractionDigits: 2 }));
      } else {
        setAccount(null);
        setTokenBalance("0");
        setVotingPower("0");
      }

      await loadDAO(provider);
    } catch (err) {
      setErrorMessage(err?.message || "Unable to connect to the DAO.");
      console.error(err);
      
      // Try to load read-only provider
      try {
        const provider = getEthersProvider();
        if (provider) await loadDAO(provider);
      } catch (e) {
        console.warn("Read-only fallback failed", e);
      }
    }
  };

  const loadDAO = async (provider) => {
    try {
      setErrorMessage("");
      setLoading(true);

      // Fetch DAO details from blockchain for Name
      await ensureContractDeployed(provider, address, "Election");
      const gov = new Contract(address, contracts.Election.abi, provider);
      const name = await gov.name();
      setDaoName(name);

      try {
        const tAddr = await gov.treasury();
        setTreasuryAddress(tAddr);
        const tBal = await provider.getBalance(tAddr);
        setTreasuryBalance(parseFloat(formatEther(tBal)).toLocaleString(undefined, { maximumFractionDigits: 4 }));
      } catch(e) {
        console.warn("Could not load treasury", e);
      }

      const decorateWithQuorumAndFinalized = async (propsList) => {
        const tokenAddress = contracts.BloomToken.address;
        const token = new Contract(tokenAddress, contracts.BloomToken.abi, provider);
        const quorumVotes = Number(await gov.quorumVotes());
        
        let treasuryContract = null;
        try {
          const tAddr = await gov.treasury();
          treasuryContract = new Contract(tAddr, contracts.Treasury.abi, provider);
        } catch (e) {
          console.warn("Could not instantiate Treasury contract", e);
        }

        return Promise.all(propsList.map(async (p) => {
          let requiredQuorum = quorumVotes;
          let isFinalized = p.status === 'finalized';
          let timelockTxId = p.timelockTxId || null;
          let executeAfter = 0;

          // If it's a financial proposal and executed on-chain, and we don't know if it's finalized
          if (p.executed && p.target && p.target !== "0x0000000000000000000000000000000000000000" && !isFinalized && treasuryContract) {
            try {
              if (!timelockTxId) {
                const filter = gov.filters.ProposalQueued(p.id);
                const events = await gov.queryFilter(filter);
                if (events.length > 0) {
                  timelockTxId = events[0].args.timelockTxId;
                }
              }
              if (timelockTxId) {
                const txInfo = await treasuryContract.queuedTransactions(timelockTxId);
                isFinalized = txInfo.executed;
                executeAfter = Number(txInfo.executeAfter);
              }
            } catch (err) {
              console.warn(`Could not check finalization status for proposal #${p.id}:`, err);
            }
          }

          return {
            ...p,
            requiredQuorum,
            isFinalized,
            timelockTxId,
            executeAfter
          };
        }));
      };

      // 1. Try to fetch proposals from MongoDB fast REST API first
      try {
        const response = await fetch(`${API_BASE}/proposals?daoAddress=${address}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            const mapped = result.data.map(p => ({
              id: Number(p.proposalId),
              proposer: p.proposer,
              description: p.description,
              snapshotBlock: Number(p.snapshotBlock),
              endTime: Math.floor(new Date(p.endTime).getTime() / 1000),
              executed: p.executed,
              optionNames: p.options.map(o => o.name),
              optionVotes: p.options.map(o => parseFloat(formatEther(o.voteCount))),
              target: p.target,
              value: Number(p.value),
              status: p.status,
              timelockTxId: p.timelockTxId,
            }));
            const decorated = await decorateWithQuorumAndFinalized(mapped);
            setProposals(decorated);
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
          snapshotBlock: Number(p.snapshotBlock),
          endTime: Number(p.endTime),
          executed: p.executed,
          optionNames: [...p.optionNames],
          optionVotes: p.optionVotes.map((v) => parseFloat(formatEther(v))),
          target: p.target,
          value: Number(p.value),
        });
      }
      const decorated = await decorateWithQuorumAndFinalized(props);
      setProposals(decorated);
    } catch (err) {
      setErrorMessage(err?.message || "Error loading DAO.");
      console.error("Error loading DAO:", err);
    } finally {
      setLoading(false);
    }
  };

  const createProposal = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!proposalDesc.trim()) {
      showToast("Please enter a proposal description.", "warning");
      return;
    }
    if (proposalOptions.filter((o) => o.trim()).length < 2) {
      showToast("At least 2 voting options are required.", "warning");
      return;
    }
    setErrorMessage("");
    setCreating(true);
    try {
      const provider = await getProvider();
      await ensureContractDeployed(provider, address, "Election");
      const signer = await getEthersSigner();
      if (!signer) throw new Error("Wallet not connected. Please connect via RainbowKit.");
      const gov = new Contract(address, contracts.Election.abi, signer);
      const token = new Contract(contracts.BloomToken.address, contracts.BloomToken.abi, signer);
      const userAddress = await signer.getAddress();

      // Ensure the user has voting power; self-delegate if a token balance exists but no votes.
      let votes = await token.getVotes(userAddress);
      const balance = await token.balanceOf(userAddress);
      const threshold = await gov.proposalThreshold();

      if (votes === 0n && balance > 0n) {
        const delegateTx = await token.delegate(userAddress);
        await delegateTx.wait();
        votes = await token.getVotes(userAddress);
        setVotingPower(parseFloat(formatEther(votes)).toLocaleString(undefined, { maximumFractionDigits: 2 }));
      }

      if (votes < threshold) {
        throw new Error(
          `Your voting power is too low to create a proposal. Current votes: ${votes.toString()}, required: ${threshold.toString()}. Delegate your BLOOM tokens to yourself or acquire more voting power.`
        );
      }

      let tx;
      if (isFinancial) {
        if (!targetAddress || !ethAmount) throw new Error("Target address and ETH amount are required for financial proposals.");
        tx = await gov.createFinancialProposal(
          proposalDesc.trim(),
          BigInt(proposalDuration),
          proposalOptions.filter((o) => o.trim()),
          targetAddress,
          parseEther(ethAmount)
        );
      } else {
        tx = await gov.createProposal(
          proposalDesc.trim(),
          BigInt(proposalDuration),
          proposalOptions.filter((o) => o.trim())
        );
      }
      await tx.wait();

      showToast("Proposal created successfully! 🎉", "success");
      setShowCreateModal(false);
      setProposalDesc("");
      setProposalDuration("5");
      setProposalOptions(["Yes", "No"]);
      await loadDAO(provider);
    } catch (err) {
      const message =
        err?.reason ||
        err?.message ||
        "Failed to create proposal. You may not have enough $BLOOM tokens.";
      setErrorMessage(message);
      console.error("Create proposal failed:", err);
      showToast(message, "error");
    } finally {
      setCreating(false);
    }
  };

  const getProposalStatus = (proposal) => {
    if (proposal.isFinalized || proposal.status === 'finalized') return 'executed';
    if (proposal.executed) {
      if (proposal.target && proposal.target !== "0x0000000000000000000000000000000000000000") {
        return 'queued';
      }
      return 'executed';
    }
    
    const now = Date.now() / 1000;
    if (now <= proposal.endTime) return 'active';
    
    const totalVotes = proposal.optionVotes.reduce((a, b) => a + b, 0);
    const requiredQuorum = proposal.requiredQuorum || 0;
    
    if (totalVotes < requiredQuorum) return 'quorum_not_met';
    
    const maxVotes = Math.max(...proposal.optionVotes);
    const option0Won = proposal.optionVotes[0] === maxVotes && maxVotes > 0;
    
    if (option0Won) return 'passed';
    return 'failed';
  };

  const executeProposal = async (proposalId) => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    try {
      const provider = await getProvider();
      const signer = await getEthersSigner();
      if (!signer) throw new Error("Wallet not connected.");
      const gov = new Contract(address, contracts.Election.abi, signer);
      
      const tx = await gov.executeProposal(proposalId);
      await tx.wait();
      
      showToast("Proposal executed successfully! ✅", "success");
      await connectAndLoad();
    } catch (err) {
      showToast(`Failed to execute: ${err?.reason || err?.message}`, "error");
    }
  };

  const finalizeProposal = async (proposalId) => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    try {
      const provider = await getProvider();
      const signer = await getEthersSigner();
      if (!signer) throw new Error("Wallet not connected.");
      const gov = new Contract(address, contracts.Election.abi, signer);
      
      const tx = await gov.finalizeProposal(proposalId);
      await tx.wait();
      
      showToast("Financial proposal finalized! 💸", "success");
      await connectAndLoad();
    } catch (err) {
      showToast(`Failed to finalize: ${err?.reason || err?.message}`, "error");
    }
  };

  const cancelProposal = async (proposalId) => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!confirm("Are you sure you want to cancel this proposal? This will expire voting immediately.")) return;
    try {
      const provider = await getProvider();
      const signer = await getEthersSigner();
      if (!signer) throw new Error("Wallet not connected.");
      const gov = new Contract(address, contracts.Election.abi, signer);
      
      const tx = await gov.cancelProposal(proposalId);
      await tx.wait();
      
      showToast("Proposal cancelled successfully! 🚫", "success");
      await connectAndLoad();
    } catch (err) {
      showToast(`Failed to cancel: ${err?.reason || err?.message}`, "error");
    }
  };

  const fundTreasury = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    const amt = prompt("How much ETH do you want to send to the Treasury?");
    if (!amt) return;
    try {
      const provider = await getProvider();
      const signer = await getEthersSigner();
      if (!signer) throw new Error("Wallet not connected.");
      const tx = await signer.sendTransaction({
        to: treasuryAddress,
        value: parseEther(amt)
      });
      await tx.wait();
      showToast("Treasury funded successfully! ✅", "success");
      await connectAndLoad();
    } catch (err) {
      showToast(`Funding failed: ${err.message}`, "error");
    }
  };

  const castVote = async (proposalId, optionIndex) => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    setVotingOn(proposalId);
    try {
      setErrorMessage("");
      
      // 1. Fetch Merkle Proof from backend
      let proof = [];
      const jwtToken = localStorage.getItem("token");
      if (jwtToken) {
        const res = await fetch(`${API_BASE}/verifications/${address}/proof`, {
          headers: { Authorization: `Bearer ${jwtToken}` }
        });
        if (res.ok) {
          const resData = await res.json();
          if (resData.success) {
            if (!resData.isWhitelisted) {
              throw new Error("Your address is not on the voter whitelist for this election!");
            }
            proof = resData.proof;
          }
        }
      }
      
      const provider = await getProvider();
      const signer = await getEthersSigner();
      if (!signer) throw new Error("Wallet not connected.");
      const gov = new Contract(address, contracts.Election.abi, signer);
      
      // 2. Cast vote on-chain with the Merkle Proof
      const tx = await gov.vote(BigInt(proposalId), BigInt(optionIndex), proof);
      await tx.wait();
      showToast("Vote cast successfully! ✅", "success");
      await loadDAO(provider);
    } catch (err) {
      const message = err?.message || "Vote failed. You may have already voted or lack voting power.";
      setErrorMessage(message);
      console.error("Vote failed:", err);
      showToast(message, "error");
    } finally {
      setVotingOn(null);
    }
  };

  const getTimelockTimeRemaining = (executeAfter) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = executeAfter - now;
    if (diff <= 0) return null;
    const mins = Math.floor(diff / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
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

  const generateMockSummary = (description) => {
    if (!description || !description.trim()) {
      return "This governance proposal addresses standard DAO administration and community guidelines. It seeks to gauge member sentiment.";
    }

    const clean = description.trim().replace(/[?.]+$/, "");
    const desc = clean.toLowerCase();
    
    // Categorize proposal type
    let type = "governance initiative";
    let action = "gauge member sentiment and build consensus";
    
    if (desc.includes("eth") || desc.includes("usdt") || desc.includes("fund") || desc.includes("transfer") || desc.includes("allocate") || desc.includes("treasury") || desc.includes("spend") || desc.includes("grant")) {
      type = "financial proposal";
      action = "authorize the allocation and transfer of treasury resources";
    } else if (desc.includes("marketing") || desc.includes("community") || desc.includes("campaign") || desc.includes("social") || desc.includes("twitter") || desc.includes("telegram")) {
      type = "marketing & outreach initiative";
      action = "align on promotional strategies and growth campaigns";
    } else if (desc.includes("develop") || desc.includes("code") || desc.includes("smart contract") || desc.includes("bug") || desc.includes("security") || desc.includes("audit") || desc.includes("upgrade")) {
      type = "technical improvement proposal";
      action = "approve smart contract upgrades, bug fixes, or system security enhancements";
    } else if (desc.includes("win") || desc.includes("election") || desc.includes("vote") || desc.includes("poll") || desc.includes("candidate")) {
      type = "community voting poll";
      action = "track preferences and record votes on external options";
    }

    // Build sentence prefix based on description structure
    let leadSentence = "";
    const words = clean.split(/\s+/);
    const firstWord = words[0].toLowerCase();
    const helperVerbs = ["should", "can", "will", "would", "is", "are", "do", "does", "could", "shall"];
    
    if (helperVerbs.includes(firstWord)) {
      leadSentence = `This ${type} evaluates community sentiment regarding the question: "${clean}?".`;
    } else if (["allocate", "transfer", "spend", "send", "grant", "deploy", "create", "upgrade", "change", "modify", "setup", "fund", "mint", "burn"].includes(firstWord)) {
      leadSentence = `This ${type} seeks formal authorization to ${clean.charAt(0).toLowerCase() + clean.slice(1)}.`;
    } else {
      leadSentence = `This ${type} addresses the request: "${clean}".`;
    }

    return `${leadSentence} It aims to ${action} based on the collective decision of the DAO's voting members.`;
  };

  const summarizeProposal = async (proposalId, description) => {
    if (aiSummaries[proposalId] && aiSummaries[proposalId] !== "Could not generate summary.") return;
    
    setSummarizing((prev) => ({ ...prev, [proposalId]: true }));
    try {
      const res = await fetch(`${API_BASE}/ai/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal: {
            proposalId: proposalId.toString(),
            description,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to fetch summary from server");
      }

      const result = await res.json();
      if (!result.success || !result.data) {
        throw new Error(result.message || "Invalid response format from server");
      }

      const summary = result.data.summary || generateMockSummary(description);
      setAiSummaries((prev) => ({ ...prev, [proposalId]: summary }));
    } catch (err) {
      console.warn("AI summary failed, falling back to local summarizer:", err);
      const mockSummary = generateMockSummary(description);
      setAiSummaries((prev) => ({ ...prev, [proposalId]: mockSummary }));
    } finally {
      setSummarizing((prev) => ({ ...prev, [proposalId]: false }));
    }
  };

  const [dashboardTab, setDashboardTab] = useState("proposals");
  const [govDocs, setGovDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docType, setDocType] = useState("constitution");
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const fetchGovDocs = async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch(`${API_BASE}/ai/rag/documents?daoAddress=${address}`);
      const data = await res.json();
      if (data.success) {
        setGovDocs(data.data || []);
      }
    } catch (err) {
      console.warn("Failed to load governance documents:", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (dashboardTab === 'docs') {
      fetchGovDocs();
    }
  }, [dashboardTab, address]);

  const handleUploadDoc = async (e) => {
    e.preventDefault();
    if (!docTitle.trim() || !docContent.trim() || uploadingDoc) return;
    setUploadingDoc(true);
    try {
      const res = await fetch(`${API_BASE}/ai/rag/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: docTitle.trim(),
          content: docContent.trim(),
          type: docType,
          daoAddress: address,
          userAddress: connectedAddress || "0x0000000000000000000000000000000000000000"
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast("Governance document indexed successfully! ✨", "success");
        setShowUploadModal(false);
        setDocTitle("");
        setDocContent("");
        setDocType("constitution");
        fetchGovDocs();
      } else {
        showToast(data.message || "Failed to index document.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error uploading document.", "error");
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setChatLoading(true);

    try {
      const res = await fetch(`${API_BASE}/ai/copilot/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          sessionId: chatSessionId || undefined,
          daoAddress: address,
          userAddress: connectedAddress || "0x0000000000000000000000000000000000000000"
        })
      });

      const data = await res.json();
      if (data.success) {
        setChatMessages((prev) => [...prev, { sender: 'ai', text: data.data.reply, intent: data.data.intent }]);
        if (data.data.sessionId) {
          setChatSessionId(data.data.sessionId);
          localStorage.setItem(`chat_session_${address}_${connectedAddress}`, data.data.sessionId);
        }
      } else {
        throw new Error(data.message || "Failed to get AI reply");
      }
    } catch (err) {
      console.error("AI chat error:", err);
      setChatMessages((prev) => [...prev, { sender: 'ai', text: `⚠️ Error: ${err.message}. Please verify your backend server is running and configured with a GEMINI_API_KEY.` }]);
    } finally {
      setChatLoading(false);
      // Scroll to bottom
      setTimeout(() => {
        const container = document.getElementById("chat-messages-container");
        if (container) container.scrollTop = container.scrollHeight;
      }, 50);
    }
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
        <span className="text-gray-700 dark:text-slate-300 font-medium">{daoName}</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
              {daoName.charAt(0)}
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              {daoName}
            </h1>
          </div>
          <p className="text-gray-500 dark:text-slate-400 font-mono text-xs ml-[52px]">
            {address}
          </p>
        </div>
        <button
          onClick={() => {
            if (!isConnected) {
              openConnectModal?.();
            } else {
              setShowCreateModal(true);
            }
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-xl shadow-sm transition-all duration-200"
        >
          + New Proposal
        </button>
      </div>

      {errorMessage && (
        <div className="mb-6 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 p-4 text-red-700 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-800 p-5 transition-colors duration-300">
          <p className="text-xs text-gray-400 dark:text-slate-500 font-medium uppercase tracking-wider mb-1">Total Proposals</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{proposals.length}</p>
        </div>
        <div className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-800 p-5 transition-colors duration-300">
          <p className="text-xs text-gray-400 dark:text-slate-500 font-medium uppercase tracking-wider mb-1">Active Proposals</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {proposals.filter((p) => isActive(p.endTime)).length}
          </p>
        </div>
        <div className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-800 p-5 transition-colors duration-300">
          <p className="text-xs text-gray-400 dark:text-slate-500 font-medium uppercase tracking-wider mb-1">Your Balance</p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{tokenBalance} BLOOM</p>
        </div>
        <div className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-800 p-5 transition-colors duration-300">
          <p className="text-xs text-gray-400 dark:text-slate-500 font-medium uppercase tracking-wider mb-1">Voting Power</p>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{votingPower} Votes</p>
        </div>
        <div className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-800 p-5 relative overflow-hidden transition-colors duration-300">
          <div className="absolute top-0 right-0 p-3">
            <button onClick={fundTreasury} className="text-xs bg-emerald-100 dark:bg-emerald-950/30 hover:bg-emerald-200 dark:hover:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded font-bold transition-colors">
              + Fund
            </button>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex space-x-2 border-b border-gray-200 dark:border-slate-800 mb-8 max-w-md p-1 bg-gray-150 dark:bg-slate-900/60 rounded-2xl">
        <button
          onClick={() => setDashboardTab('proposals')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-200 ${
            dashboardTab === 'proposals'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          📋 Proposals
        </button>
        <button
          onClick={() => setDashboardTab('docs')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-200 ${
            dashboardTab === 'docs'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          📚 Governance Docs
        </button>
      </div>

      {dashboardTab === 'proposals' ? (
        <>
          {/* Proposals */}
          {proposals.length === 0 ? (
            <div className="bg-white dark:bg-[#151b2c] rounded-3xl border border-gray-200 dark:border-slate-800 p-12 text-center shadow-sm transition-colors duration-300">
              <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
                📋
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">No proposals yet</h3>
              <p className="text-gray-500 dark:text-slate-400 mb-6">
                Create the first governance proposal for this DAO.
              </p>
              <button
                onClick={() => {
                  if (!isConnected) {
                    openConnectModal?.();
                  } else {
                    setShowCreateModal(true);
                  }
                }}
                className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 font-semibold py-2 px-6 rounded-lg transition-colors"
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
                    className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden hover:shadow-md transition-all duration-300"
                  >
                    {/* Proposal Header */}
                    <div className="p-6 border-b border-gray-100 dark:border-slate-800">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          {getProposalStatus(p) === 'active' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-900/40">
                              <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-green-500"></span>Active
                            </span>
                          )}
                          {getProposalStatus(p) === 'passed' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400 border border-yellow-100 dark:border-yellow-900/40">
                              <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-yellow-500"></span>Passed
                            </span>
                          )}
                          {getProposalStatus(p) === 'failed' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/40">
                              <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-red-500"></span>Failed
                            </span>
                          )}
                          {getProposalStatus(p) === 'quorum_not_met' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border border-orange-100 dark:border-orange-900/40">
                              <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-orange-500"></span>Quorum Not Met
                            </span>
                          )}
                          {getProposalStatus(p) === 'queued' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40">
                              <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-blue-500"></span>Queued
                            </span>
                          )}
                          {getProposalStatus(p) === 'executed' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/40">
                              <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-emerald-500"></span>Executed
                            </span>
                          )}
                          
                          <span className="text-xs text-gray-400 dark:text-slate-500">
                            Proposal #{p.id}
                          </span>
                          {p.target && p.target !== "0x0000000000000000000000000000000000000000" && (
                            <span className="ml-2 px-2 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                              💰 {p.value} ETH → {p.target.substring(0,6)}...
                            </span>
                          )}
                        </div>
                        <div className="flex space-x-3 items-center">
                          {getProposalStatus(p) === 'active' && account && p.proposer.toLowerCase() === account.toLowerCase() && (
                            <button 
                              onClick={() => cancelProposal(p.id)}
                              className="bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 px-3 py-1 rounded-lg text-sm font-bold shadow-sm transition-colors"
                            >
                              🚫 Cancel
                            </button>
                          )}
                          {getProposalStatus(p) === 'passed' && (
                            <button 
                              onClick={() => executeProposal(p.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-sm font-bold shadow-sm transition-colors"
                            >
                              ⚡ Execute
                            </button>
                          )}
                          {getProposalStatus(p) === 'queued' && (() => {
                            const remaining = p.executeAfter ? getTimelockTimeRemaining(p.executeAfter) : null;
                            const disabled = remaining !== null;
                            return (
                              <button 
                                onClick={() => finalizeProposal(p.id)}
                                disabled={disabled}
                                className={`px-3 py-1 rounded-lg text-sm font-bold shadow-sm transition-colors ${
                                  disabled
                                    ? "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-550 cursor-not-allowed"
                                    : "bg-blue-600 hover:bg-blue-700 text-white"
                                }`}
                              >
                                {disabled ? `⏳ Locked (${remaining})` : "💸 Finalize"}
                              </button>
                            );
                          })()}
                          <span className="text-xs text-gray-400 dark:text-slate-500">
                            {active ? getTimeRemaining(p.endTime) : "Voting closed"}
                          </span>
                        </div>
                      </div>
                      <p className="text-gray-900 dark:text-white font-semibold text-base leading-relaxed">
                        {p.description}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
                        by {p.proposer.substring(0, 6)}...{p.proposer.substring(38)} · {totalVotes.toLocaleString()} total votes
                      </p>

                      {/* AI Summary */}
                      <div className="mt-3">
                        {aiSummaries[p.id] ? (
                          <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 rounded-xl px-4 py-3">
                            <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-1 flex items-center justify-between">
                              <span className="flex items-center"><span className="mr-1">✨</span> AI Summary</span>
                            </p>
                            <p className="text-sm text-purple-800 dark:text-purple-300 leading-relaxed">
                              {aiSummaries[p.id]}
                            </p>
                          </div>
                        ) : (
                          <button
                            onClick={() => summarizeProposal(p.id, p.description)}
                            disabled={summarizing[p.id]}
                            className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 bg-purple-50 dark:bg-purple-950/20 hover:bg-purple-100 dark:hover:bg-purple-950/40 border border-purple-100 dark:border-purple-900/30 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                          >
                            {summarizing[p.id] ? (
                              <span className="flex items-center">
                                <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Summarizing...
                              </span>
                            ) : (
                              "✨ Summarize with AI"
                            )}
                          </button>
                        )}
                      </div>
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
                                    ? "border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20"
                                    : "border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/20"
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
                                  <span className="text-sm font-medium text-gray-800 dark:text-slate-200">{opt}</span>
                                </div>
                                <div className="flex items-center space-x-3 z-10 relative">
                                  <span className="text-xs text-gray-500 dark:text-slate-400">{votes.toLocaleString()} votes</span>
                                  <span
                                    className={`text-sm font-bold ${
                                      isWinning && totalVotes > 0 ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-slate-500"
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
                                    isWinning ? "bg-indigo-400 dark:bg-indigo-500" : "bg-gray-300 dark:bg-slate-700"
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
        </>
      ) : (
        /* RAG Governance Docs Tab View */
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white dark:bg-[#151b2c] p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">DAO Knowledge Base (RAG)</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-xl">
                Upload constitutions, bylaws, or budgets. The AI Copilot uses these documents to ground its chat replies in your actual community policies.
              </p>
            </div>
            {(user?.role === 'admin' || user?.role === 'superadmin') && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg text-sm shadow-sm transition-colors shrink-0"
              >
                + Upload Document
              </button>
            )}
          </div>

          {loadingDocs ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : govDocs.length === 0 ? (
            <div className="bg-white dark:bg-[#151b2c] rounded-2xl border border-gray-200 dark:border-slate-800 p-12 text-center shadow-sm">
              <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
                📚
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">No governance documents indexed</h3>
              <p className="text-sm text-gray-550 dark:text-slate-400">
                AI Copilot will use standard baseline DAO context until documents are indexed.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {govDocs.map((doc) => (
                <div key={doc.documentId} className="bg-white dark:bg-[#151b2c] p-5 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-indigo-500"></div>
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                        {doc.type}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                        doc.indexStatus === 'indexed'
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-450'
                          : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-450'
                      }`}>
                        {doc.indexStatus === 'indexed' ? 'Indexed' : 'Processing'}
                      </span>
                    </div>
                    <h4 className="text-base font-bold text-gray-900 dark:text-white mb-2">{doc.title}</h4>
                    <p className="text-xs text-gray-405 dark:text-slate-500 font-semibold mb-3">
                      Indexed chunks: {doc.chunksIndexed || 0}
                    </p>
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">
                    Added: {new Date(doc.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>
    )}
      {/* ─── RAG Document Upload Modal ─── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !uploadingDoc && setShowUploadModal(false)}
          ></div>
          <div className="relative bg-white dark:bg-[#151b2c] rounded-3xl border border-gray-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-8 mx-4 max-h-[90vh] overflow-y-auto transition-colors duration-300">
            <button
              onClick={() => !uploadingDoc && setShowUploadModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-5 shadow-lg">
              <span className="text-white text-xl">📚</span>
            </div>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-1">
              Index Governance Document
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center mb-6">
              Index raw charter text or bylaws to the AI Copilot.
            </p>

            <form onSubmit={handleUploadDoc} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Document Title</label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={e => setDocTitle(e.target.value)}
                  placeholder="e.g. BlockBloom Community Charter v1.0"
                  className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Document Type</label>
                <select
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                  className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="constitution">📜 Constitution / Charter</option>
                  <option value="bylaws">📖 Bylaws / Operating Agreement</option>
                  <option value="budget">💰 Budget Proposal</option>
                  <option value="other">📝 Other document</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Document Content</label>
                <textarea
                  value={docContent}
                  onChange={e => setDocContent(e.target.value)}
                  placeholder="Paste the full plain text of the document here..."
                  rows={6}
                  className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={uploadingDoc || !docTitle.trim() || !docContent.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-sm hover:shadow-md disabled:opacity-50 mt-4"
              >
                {uploadingDoc ? "Indexing Document..." : "⚡ Index into AI Knowledge Base"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── Create Proposal Modal ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !creating && setShowCreateModal(false)}
          ></div>
          <div className="relative bg-white dark:bg-[#151b2c] rounded-3xl border border-gray-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-8 mx-4 max-h-[90vh] overflow-y-auto transition-colors duration-300">
            <button
              onClick={() => !creating && setShowCreateModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-5 shadow-lg">
              <span className="text-white text-xl">📋</span>
            </div>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-1">
              New Proposal
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center mb-6">
              Submit a governance proposal for the community to vote on.
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800/40 p-3 rounded-xl border border-gray-100 dark:border-slate-800 mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-slate-200">Financial Proposal?</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={isFinancial} onChange={() => setIsFinancial(!isFinancial)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {isFinancial && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Target Address</label>
                    <input type="text" value={targetAddress} onChange={e => setTargetAddress(e.target.value)} placeholder="0x..." className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">ETH Amount</label>
                    <input type="number" step="0.01" value={ethAmount} onChange={e => setEthAmount(e.target.value)} placeholder="0.5" className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
                  Description
                </label>
                <textarea
                  value={proposalDesc}
                  onChange={(e) => setProposalDesc(e.target.value)}
                  placeholder="e.g. Should we allocate 10 ETH to the marketing fund?"
                  rows={3}
                  className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-[#0b0f19] placeholder-gray-400 dark:placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  value={proposalDuration}
                  onChange={(e) => setProposalDuration(e.target.value)}
                  min="1"
                  className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-[#0b0f19] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">
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
                        className="flex-1 border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-[#0b0f19] placeholder-gray-400 dark:placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold mt-2 transition-colors"
                >
                  + Add Option
                </button>
              </div>

              <button
                onClick={createProposal}
                disabled={creating}
                className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 mt-2 ${
                  creating
                    ? "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-650 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md"
                }`}
              >
                {creating ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
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
      
      
      {/* ─── AI Copilot Floating Toggle ─── */}
      <button
        onClick={() => setShowChat(!showChat)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white p-4 rounded-full shadow-[0_8px_30px_rgb(79,70,229,0.4)] transition-all duration-300 hover:scale-110 z-50 flex items-center justify-center border border-indigo-400 group"
        id="ai-assistant-toggle"
      >
        {showChat ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 group-hover:rotate-12 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* ─── AI Copilot Floating Chat Widget ─── */}
      <div
        className={`fixed bottom-24 right-6 w-96 h-[calc(100vh-140px)] max-h-[460px] bg-white/95 dark:bg-[#151b2c]/95 backdrop-blur-xl border border-gray-200 dark:border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 rounded-2xl flex flex-col transition-all duration-300 origin-bottom-right transform ${
          showChat ? "scale-100 opacity-100 translate-y-0" : "scale-75 opacity-0 translate-y-8 pointer-events-none"
        }`}
        id="ai-copilot-sidebar"
      >
        {/* Header */}
        <div className="p-4 rounded-t-2xl flex items-center justify-between bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 text-white shadow-md">
          <div className="flex items-center space-x-3">
            <div className="relative bg-white/20 p-2 rounded-xl border border-white/10">
              <span className="text-xl block leading-none">🤖</span>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-indigo-600 animate-pulse"></span>
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight text-white">BlockBloom AI Copilot</h3>
              <p className="text-[10px] text-indigo-100 font-medium">Grounded in DAO context • online</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                if (window.confirm("Clear conversation history?")) {
                  setChatMessages([]);
                  sessionStorage.removeItem(`chat_history_${address}`);
                  localStorage.removeItem(`chat_session_${address}_${connectedAddress}`);
                  setChatSessionId("");
                }
              }}
              className="text-[10px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded-md transition-colors font-semibold"
              title="Clear History"
            >
              Clear
            </button>
            <button
              onClick={() => setShowChat(false)}
              className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Message History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-[#0b0f19]/60" id="chat-messages-container">
          {chatMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 dark:text-slate-500">
              <span className="text-3xl mb-2">👋</span>
              <p className="font-semibold text-gray-700 dark:text-slate-300 text-sm">Ask me anything about this DAO!</p>
              <p className="text-xs mt-1 max-w-[220px]">Get live answers about treasury balances, active proposals, or voting stats.</p>
            </div>
          ) : (
            chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 text-xs shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-white dark:bg-[#1b2336] text-gray-800 dark:text-slate-200 rounded-tl-none border border-gray-200/60 dark:border-slate-800'
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap font-medium">{msg.text}</p>
                  {msg.intent && msg.intent.intent !== 'chitchat' && (
                    <span className="block mt-2 text-[9px] text-gray-400 dark:text-slate-500 font-mono">
                      🔍 Intent: {msg.intent.intent.replace(/_/g, ' ')} ({Math.round(msg.intent.confidence * 100)}% match)
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-[#1b2336] border border-gray-200/60 dark:border-slate-800 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center space-x-1.5">
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSendChatMessage} className="p-3.5 border-t border-gray-200/80 dark:border-slate-800 bg-white dark:bg-[#151b2c] rounded-b-2xl">
          <div className="flex items-center space-x-2 bg-gray-50 dark:bg-[#0b0f19]/80 border border-gray-200/80 dark:border-slate-800 rounded-xl px-3 py-1.5 focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all duration-300">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask a question..."
              disabled={chatLoading}
              className="flex-1 text-xs bg-transparent text-gray-800 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none disabled:text-gray-400 dark:disabled:text-slate-600"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 dark:disabled:bg-slate-700 text-white disabled:text-gray-400 dark:disabled:text-slate-500 p-2 rounded-full transition-all duration-300 flex items-center justify-center hover:scale-105"
            >
              <svg className="w-3.5 h-3.5 transform rotate-45 -translate-y-[1px] translate-x-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DAODashboard;
