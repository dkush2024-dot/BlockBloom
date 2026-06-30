import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Home from "./pages/Home";
import DAODashboard from "./pages/DAODashboard";
import Profile from "./pages/Profile";
import Leaderboard from "./pages/Leaderboard";
import ElectionDashboard from "./pages/ElectionDashboard";
import ElectionVote from "./pages/ElectionVote";
import { useTheme } from "./utils/ThemeContext";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

// Placeholder for Organizations page
const Organizations = () => <div className="p-8"><h1 className="text-2xl font-bold">Organizations</h1></div>;

function App() {
  const { isDark, toggleTheme } = useTheme();
  const { user } = useAuth();

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0f19] text-gray-900 dark:text-slate-100 font-sans selection:bg-indigo-100 selection:text-indigo-900 flex flex-col transition-colors duration-300">
        
        {/* Global Navigation Bar */}
        <nav className="bg-white dark:bg-[#0b0f19]/80 dark:backdrop-blur-md border-b border-gray-200 dark:border-slate-800 sticky top-0 z-50 shadow-sm transition-colors duration-300">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-inner">
                B
              </div>
              <Link to="/" className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                BlockBloom <span className="text-indigo-600">DAO</span>
              </Link>
            </div>
            
            <div className="flex space-x-6 items-center">
              <Link to="/organizations" className="text-sm font-semibold text-gray-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Organizations</Link>
              <Link to="/" className="text-sm font-semibold text-gray-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">DAOs</Link>
              <Link to="/leaderboard" className="text-sm font-semibold text-gray-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Leaderboard</Link>
              
              {/* Theme Toggle Button */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-amber-400 transition-all duration-200 hover:scale-105"
                title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {isDark ? (
                  // Sun icon
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                  </svg>
                ) : (
                  // Moon icon
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              
              <ConnectButton />
              
              {user && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                  {user.role.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </nav>

        {/* Page Content */}
        <main className="flex-1 w-full relative">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dao/:address" element={<DAODashboard />} />
            <Route path="/elections/:address" element={<ElectionDashboard />} />
            <Route path="/elections/:address/proposals/:proposalId/vote" element={<ElectionVote />} />
            <Route path="/organizations" element={<ProtectedRoute requiredRoles={['superadmin', 'admin']}><Organizations /></ProtectedRoute>} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/profile/:walletAddress" element={<Profile />} />
            <Route path="*" element={<div className="text-center py-20 text-gray-500 dark:text-slate-400">Page not found</div>} />
          </Routes>
        </main>
        
        <footer className="py-6 text-center text-gray-400 dark:text-slate-500 text-sm border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-[#0b0f19] transition-colors duration-300">
          <p>BlockBloom DAO • Decentralized Governance Platform</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
