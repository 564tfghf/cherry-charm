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

  // ✅ Store blockchain result immediately when transaction confirms
  const [blockchainResult, setBlockchainResult] = useState<{
    combination: string;
    monReward: bigint;
    extraSpins: bigint;
    nftMinted: boolean;
    txHash: string;
  } | null>(null);

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

  // Fetch blockchain state with improved error handling
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

  // ✅ Function to be called when reel animation completes - shows popup immediately
  const onReelAnimationComplete = useCallback(() => {
    if (blockchainResult) {
      const { combination, monReward, extraSpins, nftMinted, txHash } = blockchainResult;
      
      // Parse combination into fruit array
      const fruits = combination.split('|');
      const rewardAmount = ethers.formatEther(monReward);
      
      // Show popup immediately
      setOutcomePopup({
        combination: fruits,
        monReward: rewardAmount,
        extraSpins: Number(extraSpins),
        nftMinted,
        txHash
      });
      
      // Clear the result
      setBlockchainResult(null);
      setIsSpinning(false); // ✅ Reset spinning state when popup shows
      
      // Show success toast after popup
      setTimeout(() => {
        toast.success('🎰 Spin complete! Check your rewards.', { autoClose: 2000 });
      }, 500);
    }
  }, [blockchainResult, setOutcomePopup]);

  // ✅ Optimized spin function with proper gas settings for Monad
  const spin = useCallback(async () => {
    if (!contract || !signer || isSpinning) return;
    
    if (networkError) {
      toast.error('❌ Network connection issues. Please try again later.');
      return;
    }
    
    setIsSpinning(true);
    
    try {
      // Determine spin cost quickly
      let cost = ethers.parseEther('0.1'); // Default spin cost
      if (freeSpins > 0) {
        cost = ethers.parseEther('0');
      } else if (hasDiscount && discountedSpins > 0) {
        cost = ethers.parseEther('0.01'); // Discounted spin cost
      }
      
      console.log('🎰 Starting blockchain spin with cost:', ethers.formatEther(cost), 'MON');
      
      // ✅ Get current gas price from network for accurate pricing
      const feeData = await provider!.getFeeData();
      
      // ✅ Use much higher gas settings for Monad testnet
      const gasSettings = {
        value: cost,
        gasLimit: 500000, // Higher gas limit
        // Use network gas price * 3 for faster inclusion
        maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 3n : ethers.parseUnits('100', 'gwei'),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? feeData.maxPriorityFeePerGas * 2n : ethers.parseUnits('10', 'gwei')
      };
      
      console.log('Gas settings:', {
        gasLimit: gasSettings.gasLimit,
        maxFeePerGas: ethers.formatUnits(gasSettings.maxFeePerGas, 'gwei') + ' gwei',
        maxPriorityFeePerGas: ethers.formatUnits(gasSettings.maxPriorityFeePerGas, 'gwei') + ' gwei'
      });
      
      // ✅ Send transaction with proper gas settings
      const tx = await contract.spin(gasSettings);
      
      console.log('📤 Transaction sent:', tx.hash);
      toast.info('🔄 Transaction pending...', { autoClose: 2000 });
      
      // ✅ Wait for confirmation and process result
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
        
        console.log('🎯 Blockchain result:', { 
          combination, 
          monReward: ethers.formatEther(monReward), 
          extraSpins: Number(extraSpins), 
          nftMinted 
        });
        
        // ✅ Store result immediately - popup will show when reels stop
        setBlockchainResult({
          combination,
          monReward,
          extraSpins,
          nftMinted,
          txHash: receipt.hash
        });
        
        // Refresh state in background
        fetchState();
        
        toast.success('✅ Transaction confirmed!', { autoClose: 2000 });
      }
      
      return true;
      
    } catch (error: any) {
      console.error('Spin failed:', error);
      setIsSpinning(false);
      
      // Show specific error messages
      if (error.code === 'INSUFFICIENT_FUNDS') {
        toast.error('❌ Insufficient MON balance for spin');
      } else if (error.code === 'USER_REJECTED') {
        toast.error('❌ Transaction cancelled by user');
      } else if (error.code === 'CALL_EXCEPTION') {
        toast.error('❌ Contract call failed. The contract may not be deployed or network issues.');
      } else if (error.code === 'NETWORK_ERROR' || error.code === 'SERVER_ERROR') {
        toast.error('❌ Network error. Please check your connection and try again.');
        setNetworkError(true);
      } else if (error.message && error.message.includes('maxFeePerGas too low')) {
        toast.error('❌ Gas fee too low. Retrying with higher gas...');
        // Could implement retry logic here
      } else {
        toast.error('❌ Spin failed. Please try again.');
      }
      
      return false;
    }
  }, [contract, signer, provider, freeSpins, hasDiscount, discountedSpins, isSpinning, networkError, fetchState]);

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
    // ✅ Export function to be called when reel animation completes
    onReelAnimationComplete,
    hasPendingResult: !!blockchainResult,
  };
}