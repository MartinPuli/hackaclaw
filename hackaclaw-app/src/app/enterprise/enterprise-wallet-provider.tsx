"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { publicChain } from "@/lib/public-chain";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

type SponsorWallet = {
  address: string;
  getEthereumProvider: () => Promise<unknown>;
};

type EnterpriseWalletContextValue = {
  walletFeatureAvailable: boolean;
  ready: boolean;
  authenticated: boolean;
  connectedWallet: SponsorWallet | null;
  openWalletModal: () => void;
};

const fallbackValue: EnterpriseWalletContextValue = {
  walletFeatureAvailable: false,
  ready: false,
  authenticated: false,
  connectedWallet: null,
  openWalletModal: () => {},
};

const EnterpriseWalletContext = createContext<EnterpriseWalletContextValue>(fallbackValue);

function PrivyWalletBridge({ children }: { children: ReactNode }) {
  const { ready: privyReady, authenticated, login, linkWallet } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const connectedWallet = (wallets[0] ?? null) as SponsorWallet | null;

  const value = useMemo<EnterpriseWalletContextValue>(() => ({
    walletFeatureAvailable: true,
    ready: privyReady && walletsReady,
    authenticated,
    connectedWallet,
    openWalletModal: () => {
      if (connectedWallet) return;
      if (authenticated) {
        linkWallet({ walletChainType: "ethereum-only" });
        return;
      }
      login();
    },
  }), [authenticated, connectedWallet, linkWallet, login, privyReady, walletsReady]);

  return <EnterpriseWalletContext.Provider value={value}>{children}</EnterpriseWalletContext.Provider>;
}

export function EnterpriseWalletProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    return <EnterpriseWalletContext.Provider value={fallbackValue}>{children}</EnterpriseWalletContext.Provider>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        supportedChains: [publicChain],
        defaultChain: publicChain,
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <PrivyWalletBridge>{children}</PrivyWalletBridge>
    </PrivyProvider>
  );
}

export function useEnterpriseWallet() {
  return useContext(EnterpriseWalletContext);
}
