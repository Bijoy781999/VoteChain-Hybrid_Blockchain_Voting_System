import React, { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const hasMetaMask =
    typeof window !== "undefined" &&
    Boolean(window.ethereum && typeof window.ethereum.request === "function");

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum && typeof window.ethereum.on === "function") {
      const handleAccountsChanged = (accounts) => {
        if (accounts && accounts.length > 0) {
          setAccount(accounts[0]);
          reconnectSigner();
        } else {
          disconnectWallet();
        }
      };

      const handleChainChanged = (newChainId) => {
        if (newChainId) {
          setChainId(parseInt(newChainId, 16));
        }
      };

      try {
        window.ethereum.on("accountsChanged", handleAccountsChanged);
        window.ethereum.on("chainChanged", handleChainChanged);
      } catch (err) {
        console.warn("Could not bind ethereum events:", err);
      }

      return () => {
        try {
          if (window.ethereum?.removeListener) {
            window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
            window.ethereum.removeListener("chainChanged", handleChainChanged);
          }
        } catch (e) {}
      };
    }
  }, []);

  const reconnectSigner = async () => {
    if (!hasMetaMask) return;
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const currentSigner = await browserProvider.getSigner();
      const network = await browserProvider.getNetwork();
      setProvider(browserProvider);
      setSigner(currentSigner);
      setChainId(Number(network.chainId));
    } catch (err) {
      console.warn("Could not reconnect signer:", err.message);
    }
  };

  const connectWallet = async () => {
    if (!hasMetaMask) {
      setError("MetaMask or Web3 wallet extension is not installed.");
      return null;
    }

    try {
      setIsConnecting(true);
      setError(null);
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      const currentSigner = await browserProvider.getSigner();
      const network = await browserProvider.getNetwork();

      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        setSigner(currentSigner);
        setProvider(browserProvider);
        setChainId(Number(network.chainId));
        return accounts[0];
      }
      return null;
    } catch (err) {
      setError(err.message || "Failed to connect wallet");
      return null;
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setSigner(null);
    setProvider(null);
    setChainId(null);
  };

  const value = {
    account,
    signer,
    provider,
    chainId,
    isConnecting,
    isConnected: !!account,
    hasMetaMask,
    error,
    connectWallet,
    disconnectWallet,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
