"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";

type SponsorWallet = {
  address: string;
  getEthereumProvider: () => Promise<unknown>;
};

type WalletContextValue = {
  login: () => void;
  authenticated: boolean;
  ready: boolean;
  walletFeatureAvailable: boolean;
  connectedWallet: SponsorWallet | null;
  openWalletModal: () => void;
};

const defaultValue: WalletContextValue = {
  login: () => {},
  authenticated: false,
  ready: false,
  walletFeatureAvailable: false,
  connectedWallet: null,
  openWalletModal: () => {},
};

const WalletContext = createContext<WalletContextValue>(defaultValue);

export function useEnterpriseWallet() {
  return useContext(WalletContext);
}

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

function WalletBridge({ children }: { children: ReactNode }) {
  const { login, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const [connectedWallet, setConnectedWallet] = useState<SponsorWallet | null>(null);

  useEffect(() => {
    if (authenticated && wallets.length > 0) {
      const w = wallets[0];
      setConnectedWallet({
        address: w.address,
        getEthereumProvider: () => w.getEthereumProvider(),
      });
    } else {
      setConnectedWallet(null);
    }
  }, [authenticated, wallets]);

  return (
    <WalletContext.Provider
      value={{
        login,
        authenticated,
        ready,
        walletFeatureAvailable: true,
        connectedWallet,
        openWalletModal: login,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function EnterpriseWalletProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    return (
      <WalletContext.Provider value={defaultValue}>
        {children}
      </WalletContext.Provider>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: { theme: "dark" },
      }}
    >
      <WalletBridge>{children}</WalletBridge>
    </PrivyProvider>
  );
}
