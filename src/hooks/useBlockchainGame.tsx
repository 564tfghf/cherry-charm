/*
 *  Copyright (c) Michael Kolesidis <michael.kolesidis@gmail.com>
 *  GNU Affero General Public License v3.0
 *
 *  ATTENTION! FREE SOFTWARE
 *  This website is free software (free as in freedom).
 *  If you use any part of this code, you must make your entire project's source code
 *  publicly available under the same license. This applies whether you modify the code
 *  or use it as it is in your own project. This ensures that all modifications and
 *  derivative works remain free software, so that everyone can benefit.
 *  If you are not willing to comply with these terms, you must refrain from using any part of this code.
 *
 *  For full license terms and conditions, you can read the AGPL-3.0 here:
 *  https://www.gnu.org/licenses/agpl-3.0.html
 */

import { useEffect, useState, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { toast } from 'react-toastify';
import useGame from '../stores/store';

const SLOT_MACHINE_ABI = [
  {"inputs":[],"name":"fundContract","outputs":[],"stateMutability":"payable","type":"function"},
  {"inputs":[],"name":"spin","outputs":[],"stateMutability":"payable","type":"function"},
  {"inputs":[{"internalType":"address","name":"_nftContract","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newBalance","type":"uint256"}],"name":"RewardPoolUpdated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"string","name":"combination","type":"string"},{"indexed":false,"internalType":"uint256","name":"monReward","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"extraSpins","type":"uint256"},{"indexed":false,"internalType":"bool","name":"discountApplied","type":"bool"},{"indexed":false,"internalType":"bool","name":"newDiscountGranted","type":"bool"},{"indexed":false,"internalType":"bool","name":"nftMinted","type":"bool"}],"name":"SpinResult","type":"event"},
  {"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"DISCOUNTED_SPIN_COST","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"discountedSpins","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"freeSpins","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getRewardPool","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"hasDiscount","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"nftContract","outputs":[{"internalType":"contract CherryCharmNFT","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"RARE_NFT_PROBABILITY","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"rewardPool","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"SPIN_COST","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
];

const SLOT_MACHINE_ADDRESS = '0xc66f746F6Bbef6533c6cd9AE73B290237c228cE5';

// Monad Testnet configuration - Chain ID 10143
export const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.monad.xyz'],
    },
    public: {
      http: ['https://testnet-rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
};

// Retry utility function
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, i);
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
};

export function useBlockchainGame() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { setOutcomePopup } = useGame();

  // Only use the Privy embedded wallet
  const privyWallet = wallets.find(w => w.walletClientType === 'privy');
  
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);

  // Blockchain state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [monBalance, setMonBalance] = useState<string>('0');
  const [freeSpins, setFreeSpins] = useState<number>(0);
  const [discountedSpins, setDiscountedSpins] = useState<number>(0);
  const [hasDiscount, setHasDiscount] = useState<boolean>(false);
  const [rewardPool, setRewardPool] = useState<string>('0');
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [networkError, setNetworkError] = useState<boolean>(false);

  // Initialize provider, signer, and contract when Privy wallet is ready
  useEffect(() => {
    async function setup() {
      if (ready && authenticated && privyWallet) {
        try {
          console.log('Setting up Privy wallet...');
          const ethProvider = await privyWallet.getEthereumProvider();
          
          // Configure provider for Monad Testnet
          const ethersProvider = new ethers.BrowserProvider(ethProvider);
          
          // Switch to Monad Testnet if needed
          try {
            await ethProvider.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${MONAD_TESTNET.id.toString(16)}` }],
            });
          } catch (switchError: any) {
            // If the chain doesn't exist, add it
            if (switchError.code === 4902) {
              await ethProvider.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${MONAD_TESTNET.id.toString(16)}`,
                  chainName: MONAD_TESTNET.name,
                  nativeCurrency: MONAD_TESTNET.nativeCurrency,
                  rpcUrls: MONAD_TESTNET.rpcUrls.default.http,
                  blockExplorerUrls: [MONAD_TESTNET.blockExplorers.default.url],
                }],
              });
            }
          }
          
          setProvider(ethersProvider);
          
          const ethersSigner = await ethersProvider.getSigner();
          setSigner(ethersSigner);
          
          const address = await ethersSigner.getAddress();
          setWalletAddress(address);
          console.log('Wallet address:', address);
          
          const slotContract = new ethers.Contract(SLOT_MACHINE_ADDRESS, SLOT_MACHINE_ABI, ethersSigner);
          setContract(slotContract);
          console.log('Contract initialized');
          
          setNetworkError(false);
        } catch (error) {
          console.error('Error setting up wallet:', error);
          setNetworkError(true);
          toast.error('Failed to connect to Monad Testnet. Please check your connection.');
        }
      }
    }
    setup();
  }, [ready, authenticated, privyWallet]);

  // Fetch blockchain state with improved error handling
  const fetchState = useCallback(async () => {
    if (contract && walletAddress && provider) {
      try {
        console.log('Fetching blockchain state...');
        
        // Fetch balance with retry and fallback
        try {
          const balance = await retryWithBackoff(async () => {
            return await provider.getBalance(walletAddress);
          });
          setMonBalance(ethers.formatEther(balance));
          console.log('MON Balance:', ethers.formatEther(balance));
          setNetworkError(false);
        } catch (balanceError) {
          console.error('Error fetching balance:', balanceError);
          setNetworkError(true);
          // Keep previous balance if fetch fails
        }
        
        // Fetch contract state with error handling and fallbacks
        const contractCalls = [
          {
            name: 'freeSpins',
            call: () => contract.freeSpins(walletAddress),
            setter: (value: any) => setFreeSpins(Number(value)),
            fallback: 0
          },
          {
            name: 'discountedSpins',
            call: () => contract.discountedSpins(walletAddress),
            setter: (value: any) => setDiscountedSpins(Number(value)),
            fallback: 0
          },
          {
            name: 'hasDiscount',
            call: () => contract.hasDiscount(walletAddress),
            setter: (value: any) => setHasDiscount(Boolean(value)),
            fallback: false
          },
          {
            name: 'rewardPool',
            call: () => contract.getRewardPool(),
            setter: (value: any) => setRewardPool(ethers.formatEther(value)),
            fallback: '0'
          }
        ];

        for (const { name, call, setter, fallback } of contractCalls) {
          try {
            const result = await retryWithBackoff(call, 2, 500);
            setter(result);
            console.log(`${name}:`, result);
          } catch (error: any) {
            console.error(`Error fetching ${name}:`, error);
            
            // Check if it's a contract-related error
            if (error.code === 'CALL_EXCEPTION' || error.code === 'BAD_DATA') {
              console.warn(`Contract call failed for ${name}, using fallback value`);
              setter(fallback);
              setNetworkError(true);
            }
          }
        }
        
        console.log('State fetched successfully');
      } catch (error) {
        console.error('Error fetching state:', error);
        setNetworkError(true);
      }
    }
  }, [contract, walletAddress, provider]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Show detailed spin result popup
  const showSpinResultPopup = (combination: string, monReward: bigint, extraSpins: bigint, nftMinted: boolean, txHash: string) => {
    const fruits = combination.split('|');
    const rewardAmount = ethers.formatEther(monReward);
    
    // Set the outcome popup data
    setOutcomePopup({
      combination: fruits,
      monReward: rewardAmount,
      extraSpins: Number(extraSpins),
      nftMinted,
      txHash
    });
  };

  // Spin function with improved error handling
  const spin = useCallback(async () => {
    if (!contract || !signer || isSpinning) return;
    
    if (networkError) {
      toast.error('❌ Network connection issues. Please try again later.');
      return;
    }
    
    setIsSpinning(true);
    
    try {
      // Determine spin cost
      let cost = ethers.parseEther('0.1'); // Default spin cost
      if (freeSpins > 0) {
        cost = ethers.parseEther('0');
      } else if (hasDiscount && discountedSpins > 0) {
        cost = ethers.parseEther('0.01'); // Discounted spin cost
      }
      
      console.log('Spinning with cost:', ethers.formatEther(cost), 'MON');
      
      // Call spin on contract with retry
      const tx = await retryWithBackoff(async () => {
        return await contract.spin({ value: cost });
      });
      
      console.log('Transaction sent:', tx.hash);
      
      // Show pending toast
      toast.info('🎰 Spinning... Transaction pending', { autoClose: 3000 });
      
      // Wait for confirmation with timeout
      const receipt = await Promise.race([
        tx.wait(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 60000)
        )
      ]);
      
      console.log('Transaction confirmed:', receipt.hash);
      
      // Parse SpinResult event
      const spinResultEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed?.name === 'SpinResult';
        } catch {
          return false;
        }
      });
      
      if (spinResultEvent) {
        const parsed = contract.interface.parseLog(spinResultEvent);
        const { combination, monReward, extraSpins, nftMinted } = parsed.args;
        
        console.log('Spin result:', { 
          combination, 
          monReward: ethers.formatEther(monReward), 
          extraSpins: Number(extraSpins), 
          nftMinted 
        });
        
        // Show detailed result popup
        showSpinResultPopup(combination, monReward, extraSpins, nftMinted, receipt.hash);
      } else {
        toast.success('🎰 Spin completed! Check your balance.');
      }
      
      // Refresh state after spin
      setTimeout(() => {
        fetchState();
      }, 1000);
      
    } catch (error: any) {
      console.error('Spin failed:', error);
      
      // Show specific error messages
      if (error.code === 'INSUFFICIENT_FUNDS') {
        toast.error('❌ Insufficient MON balance for spin');
      } else if (error.code === 'USER_REJECTED') {
        toast.error('❌ Transaction cancelled by user');
      } else if (error.code === 'CALL_EXCEPTION') {
        toast.error('❌ Contract call failed. The contract may not be deployed or network issues.');
      } else if (error.message?.includes('timeout')) {
        toast.error('❌ Transaction timeout. Please try again.');
      } else if (error.code === 'NETWORK_ERROR' || error.code === 'SERVER_ERROR') {
        toast.error('❌ Network error. Please check your connection and try again.');
        setNetworkError(true);
      } else {
        toast.error('❌ Spin failed. Please try again.');
      }
    } finally {
      setIsSpinning(false);
    }
  }, [contract, signer, freeSpins, hasDiscount, discountedSpins, isSpinning, networkError, fetchState, setOutcomePopup]);

  const getSpinCost = useCallback(() => {
    if (freeSpins > 0) return 'Free';
    if (hasDiscount && discountedSpins > 0) return '0.01 MON';
    return '0.1 MON';
  }, [freeSpins, hasDiscount, discountedSpins]);

  return {
    ready,
    authenticated,
    walletAddress,
    monBalance,
    freeSpins,
    discountedSpins,
    hasDiscount,
    rewardPool,
    isSpinning,
    networkError,
    spin,
    getSpinCost,
    refreshState: fetchState,
  };
}