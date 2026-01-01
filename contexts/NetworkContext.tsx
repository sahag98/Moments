import * as Network from "expo-network";
import React, { createContext, useContext, useEffect, useState } from "react";

interface NetworkContextType {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  checkNetwork: () => Promise<void>;
  isChecking: boolean;
}

const NetworkContext = createContext<NetworkContextType>({
  isConnected: null,
  isInternetReachable: null,
  checkNetwork: async () => {},
  isChecking: false,
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkNetwork = async () => {
    setIsChecking(true);
    try {
      const networkState = await Network.getNetworkStateAsync();
      setIsConnected(networkState.isConnected ?? false);
      setIsInternetReachable(networkState.isInternetReachable ?? false);
    } catch (error) {
      console.error("Error checking network state:", error);
      setIsConnected(false);
      setIsInternetReachable(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    // Check immediately
    checkNetwork();

    // Poll for network changes every 2 seconds
    intervalId = setInterval(() => {
      if (isMounted) {
        checkNetwork();
      }
    }, 2000);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isConnected, isInternetReachable, checkNetwork, isChecking }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}

