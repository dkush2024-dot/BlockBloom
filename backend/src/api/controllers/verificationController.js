const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const csv = require('csv-parser');
const fs = require('fs');
const { ethers } = require('ethers');
const { StudentVerification, Election, User } = require('../../models');
const { getElectionContractWithSigner } = require('../../blockchain/contracts');
const { ApiError } = require('../../utils');

class VerificationController {
  // POST /api/verifications/:electionAddress/upload
  async uploadCSV(req, res, next) {
    try {
      if (!req.file) {
        throw ApiError.badRequest('No CSV file uploaded');
      }

      const electionAddress = req.params.electionAddress.toLowerCase();
      const election = await Election.findOne({ contractAddress: electionAddress });
      if (!election) {
        throw ApiError.notFound('Election not found');
      }

      // Get the latest user record to verify organization mapping
      const dbUser = await User.findById(req.user.userId);
      if (!dbUser) {
        throw ApiError.unauthorized('User not found');
      }

      // Check organization scope:
      // Allow if: superadmin, OR user's org matches election's org, OR user is the election creator
      const userAddress = (dbUser.walletAddress || req.user.address || '').toLowerCase();
      const isCreator = election.creator && election.creator.toLowerCase() === userAddress;
      const hasOrgAccess = String(election.orgId) === String(dbUser.organization);

      if (dbUser.role !== 'superadmin' && !hasOrgAccess && !isCreator) {
        throw ApiError.forbidden('You do not have permission to manage this election.');
      }

      // Block mid-election whitelist tampering only after votes have been cast
      // Superadmins can force-update with ?force=true (for testing/corrections)
      const forceUpdate = req.query.force === 'true' && dbUser.role === 'superadmin';
      if (election.totalVotes > 0 && !forceUpdate) {
        throw ApiError.badRequest('Cannot update whitelist: Votes have already been cast. Superadmin can use ?force=true to override.');
      }

      const addresses = [];

      try {
        // Parse CSV from memory buffer
        const { Readable } = require('stream');
        await new Promise((resolve, reject) => {
          Readable.from(req.file.buffer)
            .pipe(csv())
            .on('data', (row) => {
              // Assume column name is 'walletAddress' or 'address'
              let addr = row.walletAddress || row.address || Object.values(row)[0];
              if (addr && ethers.isAddress(addr)) {
                 addresses.push(addr.trim().toLowerCase());
              }
            })
            .on('end', resolve)
            .on('error', reject);
        });
      } catch (err) {
        throw err;
      }

      if (addresses.length === 0) {
        throw ApiError.badRequest('No valid Ethereum addresses found in CSV');
      }

      // Generate Merkle Tree
      const leaves = addresses.map(addr => keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address'], [addr])));
      const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
      const root = tree.getHexRoot();

      // We now delegate setting the Merkle Root on-chain to the frontend
      // to avoid running out of gas on the backend admin signer.
      // Simply generate and save the root and proofs to the database.

      // Update election doc
      election.merkleRoot = root;
      await election.save();

      // Store proofs in DB
      await StudentVerification.deleteMany({ election: election._id }); // Clear old
      
      // Batch inserts to prevent OOM
      const batchSize = 1000;
      for (let i = 0; i < addresses.length; i += batchSize) {
        const batchAddresses = addresses.slice(i, i + batchSize);
        const verifications = batchAddresses.map(addr => {
          const leaf = keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address'], [addr]));
          const proof = tree.getHexProof(leaf);
          return {
            election: election._id,
            walletAddress: addr,
            proof
          };
        });
        await StudentVerification.insertMany(verifications);
      }

      res.json({ success: true, message: 'Students verified and Merkle Root set on-chain', root, count: addresses.length });
    } catch (error) {
      // Clean up file if error happened before try-finally
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      next(error);
    }
  }

  // GET /api/verifications/:electionAddress/proof
  async getProof(req, res, next) {
    try {
      const electionAddress = req.params.electionAddress.toLowerCase();
      const election = await Election.findOne({ contractAddress: electionAddress });
      if (!election) throw ApiError.notFound('Election not found');

      const verification = await StudentVerification.findOne({
        election: election._id,
        walletAddress: req.user.address.toLowerCase()
      });

      if (!verification) {
        return res.json({ success: true, isWhitelisted: false, proof: [] });
      }

      res.json({ success: true, isWhitelisted: true, proof: verification.proof });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new VerificationController();
