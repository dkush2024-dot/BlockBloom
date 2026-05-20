import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { formatEther } from "ethers";

const API_BASE = "http://localhost:5000/api";

function Profile() {
  const { walletAddress } = useParams();
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadVoterHistory(1);
  }, [walletAddress]);

  const loadVoterHistory = async (pg) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/votes/voter/${walletAddress}?page=${pg}&limit=20`
      );
      const result = await res.json();
      if (result.success) {
        setVotes(result.data || []);
        setPagination(result.pagination || null);
        setPage(pg);
      }
    } catch (err) {
      console.error("Failed to load voter history:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatAddr = (a) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  // Group votes by DAO
  const votesByDao = votes.reduce((acc, v) => {
    const key = v.daoAddress;
    if (!acc[key]) acc[key] = [];
    acc[key].push(v);
    return acc;
  }, {});

  const uniqueDAOs = Object.keys(votesByDao).length;
  const totalVotes = votes.length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-gray-400 mb-6">
        <Link to="/" className="hover:text-indigo-600 transition-colors">
          DAOs
        </Link>
        <span>→</span>
        <Link
          to="/leaderboard"
          className="hover:text-indigo-600 transition-colors"
        >
          Leaderboard
        </Link>
        <span>→</span>
        <span className="text-gray-700 font-medium">Profile</span>
      </div>

      {/* Profile Header */}
      <div className="bg-white rounded-3xl border border-gray-200 p-8 mb-8 shadow-sm">
        <div className="flex items-center space-x-5 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
            {walletAddress.slice(2, 4).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Voter Profile
            </h1>
            <p className="text-sm font-mono text-gray-500 mt-1">
              {walletAddress}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">
              Total Votes
            </p>
            <p className="text-2xl font-bold text-indigo-600">
              {pagination ? pagination.total : totalVotes}
            </p>
          </div>
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">
              DAOs Participated
            </p>
            <p className="text-2xl font-bold text-purple-600">{uniqueDAOs}</p>
          </div>
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">
              Status
            </p>
            <p className="text-lg font-bold text-green-600 flex items-center">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
              Active Voter
            </p>
          </div>
        </div>
      </div>

      {/* Voting History */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Voting History</h2>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : votes.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
            📭
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">
            No votes found
          </h3>
          <p className="text-gray-500">
            This wallet hasn't cast any governance votes yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {votes.map((vote, idx) => {
            const weight = vote.weight
              ? parseFloat(formatEther(vote.weight)).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })
              : "—";

            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 font-bold text-sm border border-indigo-50">
                      #{vote.proposalId}
                    </div>
                    <div>
                      <Link
                        to={`/dao/${vote.daoAddress}`}
                        className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                      >
                        DAO {formatAddr(vote.daoAddress)}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Proposal #{vote.proposalId} · Option{" "}
                        {vote.optionIndex + 1}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">
                      {weight} votes
                    </p>
                    <p className="text-xs text-gray-400">
                      Block #{vote.blockNumber}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center space-x-3 pt-4">
              <button
                onClick={() => loadVoterHistory(page - 1)}
                disabled={!pagination.hasPrevPage}
                className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => loadVoterHistory(page + 1)}
                disabled={!pagination.hasNextPage}
                className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Profile;
