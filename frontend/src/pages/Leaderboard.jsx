import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { io } from "socket.io-client";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";

function Leaderboard() {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const { address: account } = useAccount();
  const { openConnectModal } = useConnectModal();

  useEffect(() => {
    loadData();

    // Setup Socket.IO for real-time leaderboard updates
    const socket = io(API_BASE.replace("/api", ""));
    socket.on("vote:cast", (voteInfo) => {
      console.log("Real-time event: Vote Cast!", voteInfo);
      loadData();
    });
    socket.on("dao:created", () => {
      loadData();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [leaderRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/votes/leaderboard`).then((r) => r.json()),
        fetch(`${API_BASE}/daos/stats`).then((r) => r.json()),
      ]);
      if (leaderRes.success) setLeaders(leaderRes.data || []);
      if (statsRes.success) setStats(statsRes.data || null);
    } catch (err) {
      console.error("Failed to load leaderboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatAddr = (a) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  const medals = ["🥇", "🥈", "🥉"];

  // Find user's rank if connected
  const userRankIdx = account
    ? leaders.findIndex((l) => l.voter.toLowerCase() === account.toLowerCase())
    : -1;
  const userRecord = userRankIdx !== -1 ? leaders[userRankIdx] : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-2 text-sm text-gray-400 mb-4">
          <Link to="/" className="hover:text-indigo-600 transition-colors">
            DAOs
          </Link>
          <span>→</span>
          <span className="text-gray-700 dark:text-slate-300 font-medium">Leaderboard</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-2">
              🏆 Voter Leaderboard
            </h1>
            <p className="text-gray-500 dark:text-slate-400">
              Top governance participants across all BlockBloom DAOs.
            </p>
          </div>
          
          {/* Active Wallet Status */}
          <div className="bg-white dark:bg-[#151b2c] border border-gray-200 dark:border-slate-800 px-4 py-3 rounded-2xl flex items-center gap-3 shadow-sm self-start md:self-auto transition-colors duration-300">
            <div className={`w-2.5 h-2.5 rounded-full ${account ? 'bg-green-500 animate-pulse' : 'bg-gray-300 dark:bg-slate-700'}`}></div>
            {account ? (
              <div className="text-xs">
                <p className="font-semibold text-gray-400 uppercase tracking-wider text-[10px]">Active Wallet</p>
                <p className="font-mono font-bold text-gray-800 dark:text-slate-200">{formatAddr(account)}</p>
              </div>
            ) : (
              <button 
                onClick={openConnectModal}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>

      {/* User Personalized Rank Alert */}
      {account && !loading && (
        <div className="mb-8">
          {userRecord ? (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xl font-bold shadow-md">
                  #{userRankIdx + 1}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Your Leaderboard Standing</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    You've cast <span className="font-bold text-indigo-600 dark:text-indigo-400">{userRecord.totalVotes} votes</span> across <span className="font-bold text-indigo-600 dark:text-indigo-400">{userRecord.daosParticipated} DAO{userRecord.daosParticipated !== 1 && "s"}</span>.
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-105 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/40">
                Active Participator
              </span>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-[#151b2c]/50 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm transition-colors duration-300">
              <div>
                <h3 className="text-sm font-bold text-gray-700 dark:text-slate-200">Not Ranked Yet</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  You haven't cast any governance votes with this wallet address yet.
                </p>
              </div>
              <Link
                to="/"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2 px-4 rounded-xl shadow-sm transition-colors"
              >
                Browse DAOs & Vote
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Platform Stats Banner */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80 mb-1">
              Total DAOs
            </p>
            <p className="text-3xl font-bold">{stats.totalDAOs}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80 mb-1">
              Total Proposals
            </p>
            <p className="text-3xl font-bold">{stats.totalProposals}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80 mb-1">
              Total Votes Cast
            </p>
            <p className="text-3xl font-bold">{stats.totalVotes}</p>
          </div>
        </div>
      )}

      {/* Leaderboard Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : leaders.length === 0 ? (
        <div className="bg-white dark:bg-[#151b2c] rounded-3xl border border-gray-200 dark:border-slate-800 p-12 text-center shadow-sm transition-colors duration-300">
          <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
            🗳️
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
            No votes yet
          </h3>
          <p className="text-gray-500 dark:text-slate-400 mb-6">
            Be the first to cast a vote and claim the top spot!
          </p>
          <Link
            to="/"
            className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Browse DAOs
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#151b2c] rounded-3xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-sm transition-colors duration-300">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-gray-50 dark:bg-slate-800/40 border-b border-gray-200 dark:border-slate-800 text-xs font-semibold text-gray-500 dark:text-slate-450 uppercase tracking-wider transition-colors duration-300">
            <div className="col-span-1 text-center">Rank</div>
            <div className="col-span-5">Wallet Address</div>
            <div className="col-span-3 text-center">Votes Cast</div>
            <div className="col-span-3 text-center">DAOs Active</div>
          </div>

          {/* Rows */}
          {leaders.map((leader, idx) => {
            const isCurrentUser = account && leader.voter.toLowerCase() === account.toLowerCase();
            return (
              <Link
                key={leader.voter}
                to={`/profile/${leader.voter}`}
                className={`grid grid-cols-12 gap-4 px-6 py-5 items-center border-b border-gray-100 dark:border-slate-800 last:border-b-0 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors cursor-pointer ${
                  isCurrentUser
                    ? "bg-indigo-50/30 dark:bg-indigo-950/10 font-bold border-l-4 border-l-indigo-600"
                    : idx < 3
                    ? "bg-gradient-to-r from-yellow-50/40 dark:from-yellow-950/5 to-transparent"
                    : ""
                }`}
              >
                {/* Rank */}
                <div className="col-span-1 text-center">
                  {idx < 3 ? (
                    <span className="text-2xl">{medals[idx]}</span>
                  ) : (
                    <span className="text-sm font-bold text-gray-400 dark:text-slate-500">
                      #{idx + 1}
                    </span>
                  )}
                </div>

                {/* Address */}
                <div className="col-span-5">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm ${
                        isCurrentUser
                          ? "bg-gradient-to-br from-indigo-600 to-indigo-700"
                          : idx === 0
                          ? "bg-gradient-to-br from-yellow-400 to-amber-500"
                          : idx === 1
                          ? "bg-gradient-to-br from-gray-300 to-gray-400"
                          : idx === 2
                          ? "bg-gradient-to-br from-orange-300 to-orange-400"
                          : "bg-gradient-to-br from-indigo-400 to-purple-500"
                      }`}
                    >
                      {leader.voter.slice(2, 4).toUpperCase()}
                    </div>
                    <div>
                      <p className={`text-sm font-mono ${isCurrentUser ? "text-indigo-600 dark:text-indigo-450 font-extrabold" : "text-gray-900 dark:text-white"}`}>
                        {formatAddr(leader.voter)}
                        {isCurrentUser && <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 ml-1.5">(You)</span>}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-slate-500">View profile →</p>
                    </div>
                  </div>
                </div>

                {/* Votes */}
                <div className="col-span-3 text-center">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {leader.totalVotes}
                  </span>
                </div>

                {/* DAOs */}
                <div className="col-span-3 text-center">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${
                    isCurrentUser 
                      ? 'bg-indigo-600 text-white border-indigo-700' 
                      : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/40'
                  }`}>
                    {leader.daosParticipated} DAO{leader.daosParticipated !== 1 && "s"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Leaderboard;
