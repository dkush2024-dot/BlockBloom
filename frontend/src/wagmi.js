import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia, hardhat } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'BlockBloom DAO',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'a5e8c1b3f9d51e7a5c531de5b5c9b6f8', // Fallback developer project ID
  chains: [sepolia, hardhat],
  ssr: false,
});
