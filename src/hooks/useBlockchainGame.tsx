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

import { useEffect, useState, useCallback, useRef } from 'react';
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

interface BlockchainResult {
  combination: string[];
  monReward: string;
  extraSpins: number;
  nftMinted: boolean;
  txHash: string;
}

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
  const [networkError, setNetworkError] = useState<boolean>(false);

  // ✅ NEW: Background processing state
  const [isProcessingBlockchain, setIsProcessingBlockchain] = useState<boolean>(false);
  const [blockchainResult, setBlockchainResult] = useState<BlockchainResult | null>(null);
  
  // ✅ NEW: Expose blockchain outcome for reels to use
  const [blockchainOutcome, setBlockchainOutcome] = useState<BlockchainResult | null>(null);

  // ✅ NEW: Dynamic gas pricing function with even higher values
  const getDynamicGasSettings = useCallback(async (provider: ethers.BrowserProvider) => {
    try {
      // Get current gas price from network
      const feeData = await provider.getFeeData();
      
      // ✅ Use VERY high multipliers for Monad testnet to avoid congestion
      const baseGasPrice = feeData.gasPrice || ethers.parseUnits('100', 'gwei');
      const maxFeePerGas = feeData.maxFeePerGas || baseGasPrice;
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('10', 'gwei');
      
      // ✅ Apply VERY aggressive multipliers for testnet congestion
      const adjustedMaxFeePerGas = maxFeePerGas * BigInt(5); // 5x current fee
      const adjustedPriorityFeePerGas = maxPriorityFeePerGas * BigInt(3); // 3x priority fee
      
      console.log('🔧 Dynamic gas settings:', {
        maxFeePerGas: ethers.formatUnits(adjustedMaxFeePerGas, 'gwei') + ' gwei',
        maxPriorityFeePerGas: ethers.formatUnits(adjustedPriorityFeePerGas, 'gwei') + ' gwei'
      });
      
      return {
        gasLimit: 500000, // Even higher gas limit
        maxFeePerGas: adjustedMaxFeePerGas,
        maxPriorityFeePerGas: adjustedPriorityFeePerGas
      };
    } catch (error) {
      console.warn('⚠️ Failed to get dynamic gas, using very high fallback:', error);
      
      // ✅ Fallback to EXTREMELY high static values for testnet
      return {
        gasLimit: 500000,
        maxFeePerGas: ethers.parseUnits('500', 'gwei'), // VERY high for testnet
        maxPriorityFeePerGas: ethers.parseUnits('100', 'gwei') // VERY high priority
      };
    }
  }, []);

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
          toast.error('Failed to connect to Monad Testnet. Please check your connection.');
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

  // ✅ IMPROVED: Background blockchain processing with faster execution
  const processBlockchainSpin = useCallback(async () => {
    if (!contract || !signer || !provider || isProcessingBlockchain) return false;
    
    if (networkError) {
      toast.error('❌ Network connection issues. Please try again later.');
      return false;
    }
    
    setIsProcessingBlockchain(true);
    
    // ✅ Retry logic for network congestion - but faster
    const maxRetries = 2; // Reduced retries for speed
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        // Determine spin cost quickly
        let cost = ethers.parseEther('0.1'); // Default spin cost
        if (freeSpins > 0) {
          cost = ethers.parseEther('0');
        } else if (hasDiscount && discountedSpins > 0) {
          cost = ethers.parseEther('0.01'); // Discounted spin cost
        }
        
        console.log(`🎰 Starting blockchain spin (attempt ${retryCount + 1}/${maxRetries}) with cost:`, ethers.formatEther(cost), 'MON');
        
        // ✅ Get dynamic gas settings based on current network conditions
        const gasSettings = await getDynamicGasSettings(provider);
        
        const txParams = {
          value: cost,
          ...gasSettings
        };
        
        console.log('📊 Using gas settings:', {
          gasLimit: txParams.gasLimit.toString(),
          maxFeePerGas: ethers.formatUnits(txParams.maxFeePerGas, 'gwei') + ' gwei',
          maxPriorityFeePerGas: ethers.formatUnits(txParams.maxPriorityFeePerGas, 'gwei') + ' gwei'
        });
        
        // ✅ Send transaction with optimized settings
        const tx = await contract.spin(txParams);
        
        console.log('📤 Transaction sent:', tx.hash);
        toast.info('🔄 Processing...', { autoClose: 1000 });
        
        // ✅ Wait for confirmation in background
        const receipt = await tx.wait();
        console.log('✅ Transaction confirmed:', receipt.hash);
        
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
          
          // ✅ Parse combination into fruit array
          const fruits = combination.split('|');
          const rewardAmount = ethers.formatEther(monReward);
          
          console.log('🎯 Blockchain result ready:', { 
            fruits, 
            rewardAmount, 
            extraSpins: Number(extraSpins), 
            nftMinted 
          });
          
          // ✅ Store result immediately for reels to use
          const result: BlockchainResult = {
            combination: fruits,
            monReward: rewardAmount,
            extraSpins: Number(extraSpins),
            nftMinted,
            txHash: receipt.hash
          };
          
          setBlockchainResult(result);
          setBlockchainOutcome(result); // ✅ NEW: Expose to reels
          
          // Refresh state in background
          fetchState();
          
          toast.success('✅ Result ready!', { autoClose: 800 });
          
          setIsProcessingBlockchain(false);
          return true;
        }
        
        setIsProcessingBlockchain(false);
        return false;
        
      } catch (error: any) {
        console.error(`Blockchain spin failed (attempt ${retryCount + 1}):`, error);
        
        // ✅ Check if it's a gas-related error that we can retry
        const isGasError = error.message && (
          error.message.includes('maxFeePerGas too low') ||
          error.message.includes('insufficient funds for gas') ||
          error.message.includes('gas required exceeds allowance') ||
          error.code === 'INSUFFICIENT_FUNDS'
        );
        
        if (isGasError && retryCount < maxRetries - 1) {
          retryCount++;
          console.log(`⚠️ Gas error detected, retrying with higher gas (${retryCount}/${maxRetries})...`);
          toast.warning(`⚠️ Retrying... (${retryCount}/${maxRetries})`, { autoClose: 1000 });
          
          // Shorter wait before retrying
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        
        // ✅ Final error handling
        setIsProcessingBlockchain(false);
        
        if (error.code === 'INSUFFICIENT_FUNDS') {
          toast.error('❌ Insufficient MON balance');
        } else if (error.code === 'USER_REJECTED') {
          toast.error('❌ Transaction cancelled');
        } else if (error.message && error.message.includes('maxFeePerGas too low')) {
          toast.error('❌ Network congested. Try again.');
        } else {
          toast.error('❌ Spin failed. Try again.');
        }
        
        return false;
      }
    }
    
    // If we get here, all retries failed
    setIsProcessingBlockchain(false);
    toast.error('❌ Network heavily congested.');
    return false;
    
  }, [contract, signer, provider, freeSpins, hasDiscount, discountedSpins, isProcessingBlockchain, networkError, fetchState, getDynamicGasSettings]);

  // ✅ NEW: Function called when reel animation completes
  const onReelAnimationComplete = useCallback(() => {
    if (blockchainResult) {
      console.log('🎰 Reels stopped, showing popup with blockchain result');
      
      // Show popup immediately
      setOutcomePopup(blockchainResult);
      
      // Reset states
      setBlockchainResult(null);
      setBlockchainOutcome(null);
      
      // Show final success toast
      setTimeout(() => {
        toast.success('🎉 Spin complete!', { autoClose: 1500 });
      }, 200);
    }
  }, [blockchainResult, setOutcomePopup]);

  // ✅ NEW: Main spin function that coordinates both blockchain and UI
  const spin = useCallback(async () => {
    if (isProcessingBlockchain) return false;
    
    // ✅ Start blockchain processing immediately in background
    const blockchainPromise = processBlockchainSpin();
    
    // ✅ Return immediately so UI can start spinning
    return blockchainPromise;
  }, [processBlockchainSpin, isProcessingBlockchain]);

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
    onReelAnimationComplete,
    // ✅ NEW: Status indicators
    isProcessingBlockchain,
    hasPendingResult: !!blockchainResult,
    blockchainOutcome, // ✅ NEW: Expose blockchain outcome for reels
  };
}