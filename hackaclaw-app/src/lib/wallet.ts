// Mock wallet utilities — simulates wallet connection without real blockchain
import { v4 as uuid } from "uuid";

export function generateWalletAddress(): string {
  const chars = "0123456789abcdef";
  let addr = "0x";
  for (let i = 0; i < 40; i++) {
    addr += chars[Math.floor(Math.random() * chars.length)];
  }
  return addr;
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function generateMockSignature(): string {
  return `0x${uuid().replace(/-/g, "")}${uuid().replace(/-/g, "")}`;
}

export const WALLET_STORAGE_KEY = "hackaclaw_wallet";

export function getStoredWallet(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(WALLET_STORAGE_KEY);
}

export function storeWallet(address: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WALLET_STORAGE_KEY, address);
}

export function clearStoredWallet(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WALLET_STORAGE_KEY);
}
