import { BrowserProvider, JsonRpcProvider } from 'ethers';
import { getConnectorClient, getClient } from '@wagmi/core';
import { config } from '../wagmi';

export async function getEthersSigner() {
  try {
    const client = await getConnectorClient(config);
    if (client) {
      const { account, chain, transport } = client;
      const provider = new BrowserProvider(transport, {
        chainId: chain.id,
        name: chain.name,
      });
      return provider.getSigner(account.address);
    }
  } catch (e) {
    // Quietly fallback to window.ethereum due to a compatibility bug with RainbowKit/Wagmi connectors
  }

  // Fallback to window.ethereum
  try {
    if (window.ethereum) {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      return signer;
    }
  } catch (err) {
    console.error("Failed to get Ethers Signer from window.ethereum:", err);
  }
  return null;
}

export function getEthersProvider() {
  try {
    const client = getClient(config);
    if (!client) return null;
    const { chain, transport } = client;
    
    // Extract provider URL from transport
    let url = transport.url;
    if (!url && transport.transports) {
      url = transport.transports[0]?.value?.url;
    }
    
    if (!url) {
      if (window.ethereum) {
        return new BrowserProvider(window.ethereum);
      }
      return null;
    }
    
    const network = {
      chainId: chain?.id || 31337,
      name: chain?.name || 'hardhat',
    };
    return new JsonRpcProvider(url, network);
  } catch (e) {
    console.error("Failed to get Ethers Provider from Wagmi", e);
    if (window.ethereum) {
      return new BrowserProvider(window.ethereum);
    }
    return null;
  }
}
