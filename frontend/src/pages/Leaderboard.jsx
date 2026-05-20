import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const API_BASE = "http://localhost:5000/api";

function Leaderboard() {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadData();
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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-2 text-sm text-gray-400 mb-4">
          <Link to="/" className="hover:text-indigo-600 transition-colors">
            DAOs
          </Link>
          <span>→</span>
          <span className="text-gray-700 font-medium">Leaderboard</span>
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
          🏆 Voter Leaderboard
        </h1>
        <p className="text-gray-500">
          Top governance participants across all BlockBloom DAOs.
        </p>
      </div>

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
        <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
            🗳️
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">
            No votes yet
          </h3>
          <p className="text-gray-500 mb-6">
            Be the first to cast a vote and claim the top spot!
          </p>
          <Link
            to="/"
            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Browse DAOs
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-1 text-center">Rank</div>
            <div className="col-span-5">Wallet Address</div>
            <div className="col-span-3 text-center">Votes Cast</div>
            <div className="col-span-3 text-center">DAOs Active</div>
          </div>

          {/* Rows */}
          {leaders.map((leader, idx) => (
            <Link
              key={leader.voter}
              to={`/profile/${leader.voter}`}
              className={`grid grid-cols-12 gap-4 px-6 py-5 items-center border-b border-gray-100 last:border-b-0 hover:bg-indigo-50/40 transition-colors cursor-pointer ${
                idx < 3 ? "bg-gradient-to-r from-yellow-50/40 to-transparent" : ""
              }`}
            >
              {/* Rank */}
              <div className="col-span-1 text-center">
                {idx < 3 ? (
                  <span className="text-2xl">{medals[idx]}</span>
                ) : (
                  <span className="text-sm font-bold text-gray-400">
                    #{idx + 1}
                  </span>
                )}
              </div>

              {/* Address */}
              <div className="col-span-5">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm ${
                      idx === 0
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
                    <p className="text-sm font-semibold text-gray-900 font-mono">
                      {formatAddr(leader.voter)}
                    </p>
                    <p className="text-xs text-gray-400">View profile →</p>
                  </div>
                </div>
              </div>

              {/* Votes */}
              <div className="col-span-3 text-center">
                <span className="text-lg font-bold text-gray-900">
                  {leader.totalVotes}
                </span>
              </div>

              {/* DAOs */}
              <div className="col-span-3 text-center">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {leader.daosParticipated} DAO{leader.daosParticipated !== 1 && "s"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Leaderboard;
