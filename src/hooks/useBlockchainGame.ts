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

// Monad Testnet configuration
const MONAD_TESTNET = {
  id: 41454,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://testnet1.monad.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet1.monad.xyz' },
  },
};

// Fruit emoji mapping
const FRUIT_EMOJIS: { [key: string]: string } = {
  'cherry': '🍒',
  'apple': '🍎',
  'banana': '🍌',
  'lemon': '🍋'
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
  const [isSpinning, setIsSpinning] = useState<boolean>(false);

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
        } catch (error) {
          console.error('Error setting up wallet:', error);
          toast.error('Failed to connect wallet. Please try again.');
        }
      }
    }
    setup();
  }, [ready, authenticated, privyWallet]);

  // Fetch blockchain state with retry mechanism
  const fetchState = useCallback(async () => {
    if (contract && walletAddress && provider) {
      try {
        console.log('Fetching blockchain state...');
        
        // Fetch balance with retry
        let balance;
        try {
          balance = await provider.getBalance(walletAddress);
          setMonBalance(ethers.formatEther(balance));
          console.log('MON Balance:', ethers.formatEther(balance));
        } catch (balanceError) {
          console.error('Error fetching balance:', balanceError);
          // Keep previous balance if fetch fails
        }
        
        // Fetch contract state with error handling
        try {
          const freeSpinsCount = await contract.freeSpins(walletAddress);
          setFreeSpins(Number(freeSpinsCount));
          console.log('Free spins:', Number(freeSpinsCount));
        } catch (error) {
          console.error('Error fetching free spins:', error);
        }
        
        try {
          const discountedSpinsCount = await contract.discountedSpins(walletAddress);
          setDiscountedSpins(Number(discountedSpinsCount));
          console.log('Discounted spins:', Number(discountedSpinsCount));
        } catch (error) {
          console.error('Error fetching discounted spins:', error);
        }
        
        try {
          const discount = await contract.hasDiscount(walletAddress);
          setHasDiscount(Boolean(discount));
          console.log('Has discount:', Boolean(discount));
        } catch (error) {
          console.error('Error fetching discount status:', error);
        }
        
        try {
          const pool = await contract.getRewardPool();
          setRewardPool(ethers.formatEther(pool));
          console.log('Reward pool:', ethers.formatEther(pool));
        } catch (error) {
          console.error('Error fetching reward pool:', error);
        }
        
        console.log('State fetched successfully');
      } catch (error) {
        console.error('Error fetching state:', error);
      }
    }
  }, [contract, walletAddress, provider]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Show detailed spin result popup
  const showSpinResultPopup = (combination: string, monReward: bigint, extraSpins: bigint, nftMinted: boolean, txHash: string) => {
    const fruits = combination.split('|');
    const fruitEmojis = fruits.map(fruit => FRUIT_EMOJIS[fruit] || fruit).join(' ');
    const rewardAmount = ethers.formatEther(monReward);
    const explorerUrl = `${MONAD_TESTNET.blockExplorers.default.url}/tx/${txHash}`;
    
    let message = `🎰 Spin Result: ${fruitEmojis}\n`;
    
    if (nftMinted) {
      message += `🎉 LEGENDARY NFT WON! 🍒🍒🍒\n`;
    } else if (monReward > 0) {
      message += `💰 Won: ${rewardAmount} MON\n`;
    } else if (extraSpins > 0) {
      message += `🎁 Won: ${extraSpins} Free Spins\n`;
    } else {
      message += `😔 No reward this time\n`;
    }
    
    message += `🔗 View on Explorer: ${explorerUrl}`;
    
    // Create custom toast with detailed info
    toast.success(
      <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
          🎰 Spin Result: {fruitEmojis}
        </div>
        {nftMinted && (
          <div style={{ color: '#ff6b35', fontWeight: 'bold' }}>
            🎉 LEGENDARY NFT WON! 🍒🍒🍒
          </div>
        )}
        {monReward > 0 && (
          <div style={{ color: '#28a745', fontWeight: 'bold' }}>
            💰 Won: {rewardAmount} MON
          </div>
        )}
        {extraSpins > 0 && (
          <div style={{ color: '#007bff', fontWeight: 'bold' }}>
            🎁 Won: {extraSpins} Free Spins
          </div>
        )}
        {monReward === 0n && extraSpins === 0n && !nftMinted && (
          <div style={{ color: '#6c757d' }}>
            😔 No reward this time
          </div>
        )}
        <div style={{ marginTop: '8px', fontSize: '12px' }}>
          <a 
            href={explorerUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ color: '#007bff', textDecoration: 'underline' }}
          >
            🔗 View on Monad Explorer
          </a>
        </div>
      </div>,
      {
        autoClose: 8000,
        hideProgressBar: false,
      }
    );
  };

  // Spin function with optimistic UI and detailed result popup
  const spin = useCallback(async () => {
    if (!contract || !signer || isSpinning) return;
    
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
      
      // Call spin on contract
      const tx = await contract.spin({ value: cost });
      console.log('Transaction sent:', tx.hash);
      
      // Show pending toast
      toast.info('🎰 Spinning... Transaction pending', { autoClose: 3000 });
      
      // Wait for confirmation
      const receipt = await tx.wait();
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
      } else {
        toast.error('❌ Spin failed. Please try again.');
      }
    } finally {
      setIsSpinning(false);
    }
  }, [contract, signer, freeSpins, hasDiscount, discountedSpins, isSpinning, fetchState]);

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
    spin,
    getSpinCost,
    refreshState: fetchState,
  };
}