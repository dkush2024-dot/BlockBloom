# BlockBloom DAO — Team Roadmap & Onboarding Guide

Welcome to the BlockBloom team! Nikhil has already set up the foundational frontend and basic blockchain connection. 
To scale this into a production-grade DAO platform, here is the structured roadmap for the Backend and Smart Contract leads.

---

## 🛠️ Kushagra: Backend Architecture Lead

**Primary Goal:** Build a robust, scalable backend to index blockchain data, cache proposals, and serve real-time updates to the frontend.

### Phase 1: Foundation & Setup [✅ COMPLETED]
- [x] **Framework Setup:** Initialize a Node.js/Express backend.
- [x] **Database Architecture:** Set up MongoDB. Design schemas for User Profiles, Proposals, and DAO metadata.
- [x] **API Development:** Create basic REST endpoints.

### Phase 2: Indexing & APIs [✅ COMPLETED]
- [x] **Blockchain Syncing:** Listen to Smart Contract events (`DAOCreated`, `VoteCast`, `ProposalCreated`) and sync to MongoDB.
- [x] **Advanced APIs:** Built `GET /api/votes/leaderboard`, `POST /api/proposals/close-expired`, `GET /api/votes/voter/:address`, and `GET /api/daos/stats`.

### Phase 3: Real-time Systems
- [x] **WebSockets (Socket.IO):** Integrate WebSockets to instantly push blockchain updates to the frontend.
- [ ] **Security:** Implement wallet-based authentication (e.g., SIWE - Sign In With Ethereum) for off-chain actions like drafting proposals.

---

## 🔗 Chinmay: Smart Contract & Blockchain Lead

**Primary Goal:** Evolve the current `SimpleVoting` contract into a highly secure, proposal-based decentralized governance system.

### Phase 1: Local Environment & Testing Mastery
- **Hardhat Onboarding:** Clone the repo and get comfortable with `npx hardhat node` and the `Lock.sol` contract.
- **Test-Driven Development:** Write comprehensive unit tests in the `hardhat/test/` folder using Chai and Ethers.js to test every possible edge case (e.g., trying to vote twice, testing tie-breakers).

### Phase 2: Proposal-Based Governance
- **Contract Restructure:** Move away from the current single-election "Candidate" model. Create a new `Governance.sol` contract where any community member can submit a new **Proposal** with a start time, end time, and specific options.
- **Factory Pattern (Multi-DAO):** Research and implement a Factory Contract (`DAOFactory.sol`) that allows users to deploy their own independent voting contracts with a single click.

### Phase 3: Advanced Tokenomics
- **ERC-20 Governance Tokens:** Implement a standard ERC-20 token (e.g., `$BLOOM`) using OpenZeppelin.
- **Weighted Voting:** Upgrade the voting logic so that 1 Token = 1 Vote, rather than 1 Wallet = 1 Vote.
- **Delegation:** Build a delegation system allowing users to delegate their voting power to a representative if they are too busy to vote themselves.
- **Testnet Deployment:** Handle the deployment scripts and verification for testnets like Ethereum Sepolia or Polygon Amoy.

---

## 🚀 Collaborative Workflow (Git)

To ensure the team doesn't overwrite each other's code, follow this Git workflow:

1. **Clone the Repo:** `git clone https://github.com/Nikhil10510/BlockBloom.git`
2. **Never work on `main`.** Always create a branch for your feature:
   - Kushagra: `git checkout -b backend/api-setup`
   - Chinmay: `git checkout -b contracts/proposal-logic`
3. **Commit & Push:** Once your feature works locally, push your branch and create a Pull Request on GitHub.
4. **Review:** Nikhil will review the frontend integration, and you will review each other's code before merging it into `main`.
