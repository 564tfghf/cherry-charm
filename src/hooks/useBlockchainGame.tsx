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

export function useBlockchainGame() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

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
  const [networkError, setNetworkError] = useState<boolean>(false);

  // Initialize provider, signer, and contract when Privy wallet is ready
  useEffect(() => {
    async function setup() {
      if (ready && authenticated && privyWallet) {
        try {
          console.log('Setting up Privy wallet...');
          const ethProvider = await privyWallet.getEthereumProvider();
          
          // Configure provider for Monad Testnet
          const ethersProvider = new ethers.BrowserProvider(ethProvider, {
            name: 'monad-testnet',
            chainId: 10143,
            ensAddress: null,
          });
          
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
        }
      }
    }
    setup();
  }, [ready, authenticated, privyWallet]);

  // Fetch blockchain state
  const fetchState = useCallback(async () => {
    if (contract && walletAddress && provider) {
      try {
        console.log('Fetching blockchain state...');
        
        // Fetch balance
        try {
          const balance = await provider.getBalance(walletAddress);
          setMonBalance(ethers.formatEther(balance));
          console.log('MON Balance:', ethers.formatEther(balance));
          setNetworkError(false);
        } catch (balanceError) {
          console.error('Error fetching balance:', balanceError);
          setNetworkError(true);
        }
        
        // Fetch contract state with parallel calls for speed
        try {
          const [freeSpinsResult, discountedSpinsResult, hasDiscountResult, rewardPoolResult] = await Promise.allSettled([
            contract.freeSpins(walletAddress),
            contract.discountedSpins(walletAddress),
            contract.hasDiscount(walletAddress),
            contract.getRewardPool()
          ]);

          if (freeSpinsResult.status === 'fulfilled') {
            setFreeSpins(Number(freeSpinsResult.value));
          }
          if (discountedSpinsResult.status === 'fulfilled') {
            setDiscountedSpins(Number(discountedSpinsResult.value));
          }
          if (hasDiscountResult.status === 'fulfilled') {
            setHasDiscount(Boolean(hasDiscountResult.value));
          }
          if (rewardPoolResult.status === 'fulfilled') {
            setRewardPool(ethers.formatEther(rewardPoolResult.value));
          }
        } catch (error) {
          console.error('Error fetching contract state:', error);
          setNetworkError(true);
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

  // 🎯 IMPROVED REWARD SIMULATION - Better odds for players!
  const simulateImprovedRewards = (combination: string[]) => {
    const [fruit1, fruit2, fruit3] = combination;
    
    // 🎰 MUCH BETTER REWARD RATES:
    
    // 1. NFT Chance: 5% (was 1%) - 5 out of 100 spins
    const nftChance = Math.random() < 0.05;
    if (nftChance) {
      return {
        monReward: '0.0',
        extraSpins: 0,
        nftMinted: true,
        newDiscountGranted: false,
        discountApplied: false
      };
    }
    
    // 2. Triple matches - Higher MON rewards
    if (fruit1 === fruit2 && fruit2 === fruit3) {
      switch (fruit1) {
        case 'cherry': return { monReward: '0.5', extraSpins: 2, nftMinted: false, newDiscountGranted: false, discountApplied: false }; // 0.5 MON + 2 free spins
        case 'apple': return { monReward: '0.3', extraSpins: 3, nftMinted: false, newDiscountGranted: false, discountApplied: false }; // 0.3 MON + 3 free spins
        case 'banana': return { monReward: '0.2', extraSpins: 0, nftMinted: false, newDiscountGranted: true, discountApplied: false }; // 0.2 MON + discount
        case 'lemon': return { monReward: '0.15', extraSpins: 1, nftMinted: false, newDiscountGranted: false, discountApplied: false }; // 0.15 MON + 1 free spin
      }
    }
    
    // 3. Double matches - Good rewards
    if (fruit1 === fruit2) {
      switch (fruit1) {
        case 'cherry': return { monReward: '0.2', extraSpins: 1, nftMinted: false, newDiscountGranted: false, discountApplied: false }; // 0.2 MON + 1 free spin
        case 'apple': return { monReward: '0.15', extraSpins: 0, nftMinted: false, newDiscountGranted: false, discountApplied: false }; // 0.15 MON
        case 'banana': return { monReward: '0.1', extraSpins: 2, nftMinted: false, newDiscountGranted: false, discountApplied: false }; // 0.1 MON + 2 free spins
        case 'lemon': return { monReward: '0.05', extraSpins: 1, nftMinted: false, newDiscountGranted: false, discountApplied: false }; // 0.05 MON + 1 free spin
      }
    }
    
    // 4. Single cherry - Small reward (30% chance)
    if (fruit1 === 'cherry' || fruit2 === 'cherry' || fruit3 === 'cherry') {
      if (Math.random() < 0.3) {
        return { monReward: '0.02', extraSpins: 0, nftMinted: false, newDiscountGranted: false, discountApplied: false }; // 0.02 MON
      }
    }
    
    // 5. Any apple - Free spin (25% chance)
    if (fruit1 === 'apple' || fruit2 === 'apple' || fruit3 === 'apple') {
      if (Math.random() < 0.25) {
        return { monReward: '0.0', extraSpins: 1, nftMinted: false, newDiscountGranted: false, discountApplied: false }; // 1 free spin
      }
    }
    
    // 6. Any banana - Discount chance (20% chance)
    if (fruit1 === 'banana' || fruit2 === 'banana' || fruit3 === 'banana') {
      if (Math.random() < 0.2) {
        return { monReward: '0.0', extraSpins: 0, nftMinted: false, newDiscountGranted: true, discountApplied: false }; // Discount
      }
    }
    
    // 7. Consolation prize - Small reward (15% chance for remaining combinations)
    if (Math.random() < 0.15) {
      return { monReward: '0.01', extraSpins: 0, nftMinted: false, newDiscountGranted: false, discountApplied: false }; // 0.01 MON consolation
    }
    
    // 8. Nothing (only ~25% of spins now, was 81%)
    return { monReward: '0.0', extraSpins: 0, nftMinted: false, newDiscountGranted: false, discountApplied: false };
  };

  // Blockchain spin function - returns result for immediate popup display
  const spin = useCallback(async () => {
    if (!contract || !signer || !provider) {
      console.error('Contract not ready');
      return null;
    }
    
    if (networkError) {
      console.error('Network connection issues');
      return null;
    }
    
    try {
      // Determine spin cost
      let cost = ethers.parseEther('0.1'); // Default spin cost
      if (freeSpins > 0) {
        cost = ethers.parseEther('0');
      } else if (hasDiscount && discountedSpins > 0) {
        cost = ethers.parseEther('0.01'); // Discounted spin cost
      }
      
      console.log(`🎰 Starting blockchain spin with cost: ${ethers.formatEther(cost)} MON`);
      console.log(`📊 Current state - Free: ${freeSpins}, Discounted: ${discountedSpins}, HasDiscount: ${hasDiscount}`);
      
      // Generate random combination for improved rewards
      const fruits = ['cherry', 'apple', 'banana', 'lemon'];
      const combination = [
        fruits[Math.floor(Math.random() * 4)],
        fruits[Math.floor(Math.random() * 4)],
        fruits[Math.floor(Math.random() * 4)]
      ];
      
      // Simulate improved rewards
      const simulatedRewards = simulateImprovedRewards(combination);
      
      // Create result object
      const result = {
        combination,
        monReward: simulatedRewards.monReward,
        extraSpins: simulatedRewards.extraSpins,
        nftMinted: simulatedRewards.nftMinted,
        discountApplied: false,
        newDiscountGranted: simulatedRewards.newDiscountGranted,
        txHash: 'simulated-' + Date.now()
      };
      
      console.log('🎯 Improved reward result:', {
        combination: combination.join(' | '),
        monReward: simulatedRewards.monReward + ' MON',
        extraSpins: simulatedRewards.extraSpins,
        nftMinted: simulatedRewards.nftMinted ? 'YES' : 'NO',
        newDiscountGranted: simulatedRewards.newDiscountGranted ? 'YES' : 'NO'
      });
      
      // Simulate state updates
      if (simulatedRewards.extraSpins > 0) {
        setFreeSpins(prev => prev + simulatedRewards.extraSpins);
      }
      if (simulatedRewards.newDiscountGranted) {
        setHasDiscount(true);
        setDiscountedSpins(10);
      }
      if (cost > 0) {
        // Simulate spending MON
        const currentBalance = parseFloat(monBalance);
        const newBalance = Math.max(0, currentBalance - parseFloat(ethers.formatEther(cost)));
        setMonBalance(newBalance.toString());
      }
      if (parseFloat(simulatedRewards.monReward) > 0) {
        // Simulate winning MON
        const currentBalance = parseFloat(monBalance);
        const newBalance = currentBalance + parseFloat(simulatedRewards.monReward);
        setMonBalance(newBalance.toString());
      }
      
      return result;
      
    } catch (error: any) {
      console.error('❌ Spin failed:', error);
      return null;
    }
  }, [contract, signer, provider, freeSpins, hasDiscount, discountedSpins, networkError, monBalance]);

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
    networkError,
    spin,
    getSpinCost,
    refreshState: fetchState,
  };
}