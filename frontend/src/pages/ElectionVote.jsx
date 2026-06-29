import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ethers } from 'ethers';
import ElectionABI from '../../../backend/src/blockchain/abis/Election.json';

export default function ElectionVote() {
  const { address, proposalId } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [proof, setProof] = useState([]);
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [options, setOptions] = useState(['Option 1', 'Option 2']); // Mock options
  const [selectedOption, setSelectedOption] = useState(null);

  useEffect(() => {
    const fetchProof = async () => {
      try {
        const res = await fetch(`/api/verifications/${address}/proof`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setProof(data.proof);
          setIsWhitelisted(data.isWhitelisted);
        }
      } catch (err) {
        console.error('Failed to fetch proof', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProof();
  }, [address, token]);

  const handleVote = async () => {
    if (selectedOption === null) return;
    setStatus('Casting vote on blockchain...');
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(address, ElectionABI, signer);

      const tx = await contract.vote(proposalId, selectedOption, proof);
      setStatus('Waiting for confirmation...');
      await tx.wait();
      setStatus('Vote cast successfully!');
      setTimeout(() => navigate(`/elections/${address}`), 2000);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    }
  };

  if (loading) return <div className="p-8 text-center">Checking whitelist status...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Cast Your Vote</h1>
      
      {!isWhitelisted ? (
        <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-200">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p>You are not whitelisted to vote in this election. Only verified students imported by an admin can vote.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h2 className="text-xl font-bold mb-4">Select an Option</h2>
          <div className="space-y-3 mb-6">
            {options.map((opt, index) => (
              <label key={index} className={`flex items-center p-4 border rounded-lg cursor-pointer ${selectedOption === index ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}>
                <input 
                  type="radio" 
                  name="voteOption" 
                  className="mr-3" 
                  onChange={() => setSelectedOption(index)} 
                  checked={selectedOption === index} 
                />
                <span className="font-semibold">{opt}</span>
              </label>
            ))}
          </div>
          
          <button 
            onClick={handleVote} 
            disabled={selectedOption === null}
            className="w-full px-4 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            Submit Vote securely with Merkle Proof
          </button>
          {status && <p className="mt-4 text-center font-semibold text-indigo-600">{status}</p>}
        </div>
      )}
    </div>
  );
}
