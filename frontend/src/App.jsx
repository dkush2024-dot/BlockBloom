import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import V1Demo from "./pages/V1Demo";
import Home from "./pages/Home";
import DAODashboard from "./pages/DAODashboard";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
        
        {/* Global Navigation Bar */}
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-inner">
                B
              </div>
              <Link to="/" className="text-xl font-bold text-gray-900 tracking-tight">BlockBloom <span className="text-indigo-600">DAO</span></Link>
            </div>
            
            <div className="flex space-x-6 items-center">
              <Link to="/" className="text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors">Factory (V2)</Link>
              <Link to="/v1" className="text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors">Demo (V1)</Link>
              <a href="https://github.com/Nikhil10510/BlockBloom" target="_blank" rel="noreferrer" className="text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors">GitHub</a>
            </div>
          </div>
        </nav>

        {/* Page Content */}
        <main className="flex-1 w-full relative">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dao/:address" element={<DAODashboard />} />
            <Route path="/v1" element={<V1Demo />} />
            <Route path="*" element={<div className="text-center py-20 text-gray-500">Page not found</div>} />
          </Routes>
        </main>
        
        <footer className="py-6 text-center text-gray-400 text-sm border-t border-gray-200 bg-white">
          <p>BlockBloom DAO • Decentralized Governance Platform</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
