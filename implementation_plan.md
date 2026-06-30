# Backend Loose Ends Fix Plan

This plan details the steps required to resolve the vulnerabilities, scaling bottlenecks, and edge cases identified in today's backend work for Kushagra.

## Proposed Changes

### Verification Controller (`verificationController.js`)
This controller handles CSV uploads and Merkle proof generation. We will apply several critical fixes:

#### [MODIFY] [verificationController.js](file:///d:/BlockBoom/BlockBloom/backend/src/api/controllers/verificationController.js)
1. **Resource Leak (Storage)**: Wrap the CSV parsing logic inside a `try...finally` block. In the `finally` block, we will check if the file still exists in the temp directory and `fs.unlinkSync` it, guaranteeing that failed requests don't bloat the server's disk space.
2. **Missing Organization Scope Authorization**: Add a check to verify that `req.user.orgId === election.orgId`. If the user is an admin but for a different organization, we will throw a `403 Forbidden` error. (Superadmins bypass this).
3. **Mid-Election Whitelist Tampering**: Before processing the CSV, we will check if the election has any existing proposals (`election.proposalCount > 0`). If it does, we will reject the CSV upload to prevent tampering with the voter whitelist after the election has effectively started.
4. **Memory/Scaling Bottlenecks**: Refactor the CSV parsing logic to process records more efficiently. Instead of waiting until all addresses are parsed to run `insertMany()`, we will batch-insert `StudentVerification` documents into MongoDB in chunks of `1000`. This will prevent V8 Out-Of-Memory (OOM) errors for very large university datasets.
5. **Smart Contract Transaction Reliability**: Wrap the `contract.setMerkleRoot(root)` call in a `try...catch`. If it fails (e.g., gas issues), we will immediately throw a 500 error and prevent the MongoDB documents from being committed, maintaining atomic synchronization between the DB and Blockchain.

### Election Controller (`electionController.js`)
This controller fetches elections for the frontend.

#### [MODIFY] [electionController.js](file:///d:/BlockBoom/BlockBloom/backend/src/api/controllers/electionController.js)
1. **Lack of Pagination**: Introduce `page` and `limit` query parameters in `getElections` and `getElectionProposals`. Calculate the `skip` value and use it with `.skip(skip).limit(limit)`. This prevents fetching thousands of elections at once, which could degrade MongoDB performance.

### Event Indexer (`eventIndexer.js`)
This synchronizes blockchain events with MongoDB.

#### [MODIFY] [eventIndexer.js](file:///d:/BlockBoom/BlockBloom/backend/src/events/eventIndexer.js)
1. **Smart Contract Event Discrepancies**: The `handleProposalCreated` function assumes `target` and `value` are passed as arguments. In the `Election.sol` contract (Phase 3), the proposal payload might be simpler. We will add fallback defaults so the indexer doesn't crash if `ev.args` doesn't contain financial properties.

## Verification Plan
1. Send a POST request to `/api/verifications/:address/upload` using an admin token from a different organization to ensure it returns 403.
2. Send a POST request to an election with `proposalCount > 0` to verify it blocks whitelist changes.
3. Test a CSV upload with valid data to verify batch-insertion works without crashing.
4. Make a GET request to `/api/elections?page=2&limit=5` to verify pagination functions correctly.
