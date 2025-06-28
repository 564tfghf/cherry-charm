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

import { useEffect } from 'react';
import useGame from '../../stores/store';
import { MONAD_TESTNET } from '../../hooks/useBlockchainGame';
import './style.css';

interface OutcomePopupProps {
  combination: string[];
  monReward: string;
  extraSpins: number;
  nftMinted: boolean;
  txHash: string;
}

const OutcomePopup = ({ combination, monReward, extraSpins, nftMinted, txHash }: OutcomePopupProps) => {
  const { setOutcomePopup } = useGame();

  const explorerUrl = `${MONAD_TESTNET.blockExplorers.default.url}/tx/${txHash}`;

  // ✅ Prevent background scrolling when popup is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // ✅ Handle ESC key to close popup
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOutcomePopup(null);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [setOutcomePopup]);

  const getFruitImage = (fruit: string) => {
    const fruitMap: { [key: string]: string } = {
      'cherry': './images/cherry.png',
      'apple': './images/apple.png',
      'banana': './images/banana.png',
      'lemon': './images/lemon.png'
    };
    return fruitMap[fruit.toLowerCase()] || './images/cherry.png';
  };

  const getRewardText = () => {
    const rewards = [];
    
    if (nftMinted) {
      rewards.push('🎉 LEGENDARY NFT WON! 🍒🍒🍒');
    }
    
    if (parseFloat(monReward) > 0) {
      rewards.push(`💰 Won: ${monReward} MON`);
    }
    
    if (extraSpins > 0) {
      rewards.push(`🎁 Won: ${extraSpins} Free Spins`);
    }
    
    if (rewards.length === 0) {
      rewards.push('😔 No reward this time');
    }
    
    return rewards;
  };

  const closePopup = () => {
    console.log('🎰 Closing popup manually');
    setOutcomePopup(null);
  };

  return (
    <div className="outcome-popup" onClick={closePopup}>
      <div className="outcome-popup-box" onClick={(e) => e.stopPropagation()}>
        <div className="outcome-popup-main">
          {/* Close button */}
          <button 
            className="outcome-close-btn" 
            onClick={closePopup}
          >
            ✕
          </button>
          
          {/* Title */}
          <div className="outcome-title">🎰 Spin Result</div>
          
          {/* Fruit combination - EXACT match with reel display */}
          <div className="outcome-fruits">
            {combination.map((fruit, index) => (
              <img 
                key={index}
                className="outcome-fruit-image" 
                src={getFruitImage(fruit)} 
                alt={fruit}
                title={`Reel ${index + 1}: ${fruit.toUpperCase()}`}
              />
            ))}
          </div>
          
          {/* Combination text for verification */}
          <div className="outcome-combination-text">
            {combination.map(fruit => fruit.toUpperCase()).join(' | ')}
          </div>
          
          {/* Rewards */}
          <div className="outcome-rewards">
            {getRewardText().map((reward, index) => (
              <div 
                key={index} 
                className={`outcome-reward ${
                  reward.includes('LEGENDARY') ? 'legendary' :
                  reward.includes('Won:') && reward.includes('MON') ? 'mon-reward' :
                  reward.includes('Free Spins') ? 'free-spins' :
                  'no-reward'
                }`}
              >
                {reward}
              </div>
            ))}
          </div>
          
          {/* Explorer link */}
          <div className="outcome-explorer">
            <a 
              href={explorerUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="outcome-explorer-link"
            >
              🔗 View Transaction on Monad Explorer
            </a>
          </div>
          
          {/* Instructions */}
          <div className="outcome-instructions">
            Click anywhere outside or press ESC to close and continue spinning
          </div>
        </div>
      </div>
    </div>
  );
};

export default OutcomePopup;