import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, lightTheme, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { config } from './wagmi.js';
import { ThemeProvider, useTheme } from './utils/ThemeContext';

import { ToastProvider } from './context/ToastContext';

const queryClient = new QueryClient();

function RainbowKitWrapper() {
  const { isDark } = useTheme();
  return (
    <RainbowKitProvider theme={isDark ? darkTheme() : lightTheme()}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </RainbowKitProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RainbowKitWrapper />
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);

