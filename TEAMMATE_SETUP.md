# 📋 BlockBloom — Teammate Setup Guide
### For Chinmay & Kushagra — Run on Your Localhost

---

## ✅ Prerequisites (Install Once)

- [Node.js v18+](https://nodejs.org/) — check with `node --version`
- [MetaMask](https://metamask.io/) browser extension installed
- Git installed

---

## 🔁 Step 0 — Pull Latest Code

```bash
git pull origin nikhil/dev
```

---

## 📦 Step 0.5 — Install Dependencies (First Time Only)

Run these one by one from the `FinalTask` folder:

```bash
cd hardhat  && npm install
cd ..
cd backend  && npm install
cd ..
cd frontend && npm install
cd ..
```

---

## 🚀 Starting the Project (4 Terminals)

> Open 4 separate terminal windows. Run each in order and wait for the confirmation message before moving to the next.

---

### Terminal 1 — Start the Blockchain Node

```bash
cd e:\Blockboom\BlockBloom_GDG_Project-main\BlockBloom_GDG_Project-main\FinalTask\hardhat
npx hardhat node
```

⏳ **Wait until you see:**
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
```
🔴 Keep this terminal open and running the whole time.

---

### Terminal 2 — Deploy Contracts + Auto-Configure Everything

```bash
cd e:\Blockboom\BlockBloom_GDG_Project-main\BlockBloom_GDG_Project-main\FinalTask\hardhat
npm run setup
```

⏳ **Wait until you see:**
```
✅ LOCAL DEPLOYMENT COMPLETE
📝 Updated frontend/src/contracts.json with new addresses
📝 Created backend/.env from .env.example with new addresses
```

> ✨ This does everything automatically:
> - Deploys `BloomToken` + `DAOFactory` to your local node
> - Updates `frontend/src/contracts.json` with YOUR addresses
> - Creates `backend/.env` with YOUR addresses
> - **You never need to manually copy-paste any address**

---

### Terminal 3 — Start the Backend

```bash
cd e:\Blockboom\BlockBloom_GDG_Project-main\BlockBloom_GDG_Project-main\FinalTask\backend
npm run dev
```

⏳ **Wait until you see:**
```
MongoDB     : Connected ✅
Socket.IO   : Ready ✅
Indexer     : Running ✅
```

---

### Terminal 4 — Start the Frontend

```bash
cd e:\Blockboom\BlockBloom_GDG_Project-main\BlockBloom_GDG_Project-main\FinalTask\frontend
npm run dev
```

⏳ **Wait until you see:**
```
Local:   http://localhost:5173/
```

---

## 🦊 Step — Configure MetaMask

1. Open MetaMask → click the **network dropdown** at top
2. Click **"Add a custom network"**
3. Fill in:

| Field | Value |
|---|---|
| Network Name | `Hardhat Localhost` |
| New RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency Symbol | `ETH` |

4. **Import a test wallet** using a private key from Terminal 1 output:

```
Account #0:  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```
> In MetaMask → click account icon → Import Account → paste the private key

---

## 🌐 Open the App

Go to: **http://localhost:5173**

- Click **"+ Deploy New DAO"** to create your first DAO
- Create proposals, vote, check the leaderboard!

---

## 🔄 Every Day Workflow

When you come back the next day or restart your PC, run all 4 steps again in order:

```
Terminal 1:  cd hardhat   →  npx hardhat node
Terminal 2:  cd hardhat   →  npm run setup
Terminal 3:  cd backend   →  npm run dev
Terminal 4:  cd frontend  →  npm run dev
```

---

## ❓ Common Errors & Fixes

| Error Message | What It Means | Fix |
|---|---|---|
| `EADDRINUSE: port 5000` | Old backend still running in background | Run: `Get-Process node \| Stop-Process -Force` then restart backend |
| `ECONNREFUSED 127.0.0.1:8545` | Hardhat node isn't running | Start Terminal 1 first, then rerun setup |
| `"stale BloomToken address"` error on DAO page | Ran setup without restarting the node | Restart node → `npm run setup` → create new DAOs |
| `429 Too Many Requests` in browser console | Rate limit hit (shouldn't happen now) | Restart backend |
| MetaMask says "wrong network" | MetaMask on wrong chain | Switch to `Hardhat Localhost` (chainId 31337) |
| `npm run setup` fails instantly | Hardhat node not running | Start Terminal 1 first, wait for it to be ready |

---

## ⚠️ Important Rules

1. **Always start terminals in order: 1 → 2 → 3 → 4**
2. **Never manually edit** `frontend/src/contracts.json` addresses — `npm run setup` handles it
3. **Never manually edit** `backend/.env` addresses — `npm run setup` handles it
4. **Never commit** your `backend/.env` file — it's in `.gitignore` on purpose
5. Each person gets **different addresses** on their machine — that's normal and expected

---

*BlockBloom DAO · Phase 3 · May 2026*
