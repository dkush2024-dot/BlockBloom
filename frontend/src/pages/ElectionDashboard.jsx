import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ElectionDashboard() {
  const { address } = useParams();
  const { user, token } = useAuth();
  const [election, setElection] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [csvFile, setCsvFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');

  useEffect(() => {
    const fetchElectionData = async () => {
      try {
        const electionRes = await fetch(`/api/elections/${address}`);
        const electionData = await electionRes.json();
        if (electionData.success) {
          setElection(electionData.election);
        }

        const proposalRes = await fetch(`/api/elections/${address}/proposals`);
        const proposalData = await proposalRes.json();
        if (proposalData.success) {
          setProposals(proposalData.proposals);
        }
      } catch (err) {
        console.error('Error fetching election data', err);
      }
    };
    
    fetchElectionData();
  }, [address, token]);

  const handleCsvUpload = async (e) => {
    e.preventDefault();
    if (!csvFile) return;
    
    setUploadStatus('Uploading...');
    const formData = new FormData();
    formData.append('file', csvFile);

    try {
      const res = await fetch(`/api/verifications/${address}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setUploadStatus('Success! Merkle Root updated.');
        // Refresh election to show new root
        const electionRes = await fetch(`/api/elections/${address}`);
        const electionData = await electionRes.json();
        setElection(electionData.election);
      } else {
        setUploadStatus(`Error: ${data.error || 'Failed to upload'}`);
      }
    } catch (err) {
      setUploadStatus('Upload failed');
    }
  };

  if (!election) return <div className="p-8 text-center">Loading Election...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">{election.name}</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Contract: {election.contractAddress}</p>
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Proposals</h2>
        {(user?.role === 'admin' || user?.role === 'superadmin') && (
          <Link to={`/elections/${address}/proposals/new`} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Create Proposal
          </Link>
        )}
      </div>

      {(user?.role === 'admin' || user?.role === 'superadmin') && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 mb-8">
          <h3 className="text-xl font-bold mb-4">Admin: Upload Voter CSV</h3>
          <form onSubmit={handleCsvUpload} className="flex items-center space-x-4">
            <input 
              type="file" 
              accept=".csv" 
              onChange={(e) => setCsvFile(e.target.files[0])}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-slate-700 dark:file:text-indigo-300"
            />
            <button type="submit" disabled={!csvFile} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              Upload & Generate Merkle Tree
            </button>
          </form>
          {uploadStatus && <p className="mt-2 text-sm font-semibold">{uploadStatus}</p>}
          {election.merkleRoot && <p className="mt-2 text-xs text-gray-500 truncate">Current Merkle Root: {election.merkleRoot}</p>}
        </div>
      )}

      <div className="space-y-4">
        {proposals.map(p => (
          <div key={p.proposalId} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
            <h3 className="text-xl font-bold mb-2">{p.description}</h3>
            <p className="text-sm text-gray-500 mb-4">Ends: {new Date(p.endTime).toLocaleString()}</p>
            <div className="flex space-x-2">
              <Link to={`/elections/${address}/proposals/${p.proposalId}/vote`} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                Vote
              </Link>
              <Link to={`/elections/${address}/proposals/${p.proposalId}/results`} className="px-4 py-2 bg-gray-200 dark:bg-slate-700 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600">
                View Results
              </Link>
            </div>
          </div>
        ))}
        
        {proposals.length === 0 && (
          <div className="text-center py-10 text-gray-500">No proposals found for this election.</div>
        )}
      </div>
    </div>
  );
}
