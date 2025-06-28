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

import {
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useState,
} from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import useGame from './stores/store';
import { useBlockchainGame } from './hooks/useBlockchainGame';
import devLog from './utils/functions/devLog';
import segmentToFruit from './utils/functions/segmentToFruit';
import endgame from './utils/functions/endgame';
import { WHEEL_SEGMENT } from './utils/constants';
import Reel from './Reel';
import Button from './Button';

interface ReelGroup extends THREE.Group {
  reelSegment?: number;
  reelPosition?: number;
  reelSpinUntil?: number;
  reelStopSegment?: number;
}

interface SlotMachineProps {
  value: (0 | 1 | 2 | 3 | 4 | 5 | 6 | 7)[];
}

const SlotMachine = forwardRef(({ value }: SlotMachineProps, ref) => {
  const fruit0 = useGame((state) => state.fruit0);
  const fruit1 = useGame((state) => state.fruit1);
  const fruit2 = useGame((state) => state.fruit2);
  const setFruit0 = useGame((state) => state.setFruit0);
  const setFruit1 = useGame((state) => state.setFruit1);
  const setFruit2 = useGame((state) => state.setFruit2);
  const phase = useGame((state) => state.phase);
  const start = useGame((state) => state.start);
  const end = useGame((state) => state.end);
  const addSpin = useGame((state) => state.addSpin);
  const updateCoins = useGame((state) => state.updateCoins);

  // Blockchain integration
  const { 
    spin: blockchainSpin, 
    authenticated, 
    getSpinCost,
    onReelAnimationComplete,
    isProcessingBlockchain,
    hasPendingResult,
    blockchainOutcome
  } = useBlockchainGame();

  const reelRefs = [
    useRef<ReelGroup>(null),
    useRef<ReelGroup>(null),
    useRef<ReelGroup>(null),
  ];

  const [stoppedReels, setStoppedReels] = useState(0);
  
  // ✅ NEW: State to control when reels should stop with blockchain result
  const [shouldUseBlockchainResult, setShouldUseBlockchainResult] = useState(false);
  const [isSpinLocked, setIsSpinLocked] = useState(false);

  // ✅ Handle phase changes and popup display
  useEffect(() => {
    devLog('PHASE: ' + phase);
    if (phase === 'idle') {
      // Update local coins for display purposes (only if no blockchain result)
      if (!shouldUseBlockchainResult) {
        updateCoins(endgame(fruit0, fruit1, fruit2));
      }
      
      // ✅ Check if blockchain result is ready and show popup
      if (hasPendingResult && shouldUseBlockchainResult) {
        console.log('🎰 Reels finished with blockchain result, showing popup in 1 second');
        setTimeout(() => {
          onReelAnimationComplete();
          setShouldUseBlockchainResult(false);
          setIsSpinLocked(false);
        }, 1000); // 1 second delay for dramatic effect
      } else {
        // Reset lock if no blockchain result
        setIsSpinLocked(false);
      }
    }
  }, [phase, fruit0, fruit1, fruit2, updateCoins, hasPendingResult, shouldUseBlockchainResult, onReelAnimationComplete]);

  // ✅ Monitor blockchain result and prepare to use it
  useEffect(() => {
    if (blockchainOutcome && phase === 'spinning') {
      console.log('🎯 Blockchain result received while reels spinning:', blockchainOutcome);
      setShouldUseBlockchainResult(true);
      // Don't stop reels immediately - let them continue spinning until natural stop
    }
  }, [blockchainOutcome, phase]);

  // ✅ Main spin function - coordinates blockchain and UI
  const spinSlotMachine = async () => {
    if (!authenticated) {
      devLog('Not authenticated');
      return;
    }

    if (isSpinLocked || isProcessingBlockchain) {
      devLog('Spin is locked or already processing');
      return;
    }

    // ✅ 1. Lock the spin button immediately
    setIsSpinLocked(true);
    console.log('🔒 Spin button locked - starting blockchain + UI');
    
    // ✅ 2. Start blockchain processing immediately (non-blocking)
    const blockchainPromise = blockchainSpin();
    
    // ✅ 3. Start UI animation immediately (don't wait for blockchain)
    start();
    setStoppedReels(0);
    addSpin();
    setShouldUseBlockchainResult(false);

    // ✅ 4. Configure reel animation - LONGER to give blockchain time
    const min = 25; // Longer minimum spin time
    const max = 40; // Longer maximum spin time
    const getRandomStopSegment = () =>
      Math.floor(Math.random() * (max - min + 1)) + min;

    setFruit0('');
    setFruit1('');
    setFruit2('');

    // Start reel animations immediately
    for (let i = 0; i < 3; i++) {
      const reel = reelRefs[i].current;
      if (reel) {
        reel.rotation.x = 0;
        reel.reelSegment = 0;
        reel.reelSpinUntil = getRandomStopSegment();
        reel.reelStopSegment = 0;
      }
    }

    // ✅ 5. Handle blockchain result in background (don't block UI)
    try {
      const success = await blockchainPromise;
      if (success) {
        devLog('✅ Blockchain processing completed successfully');
      } else {
        devLog('❌ Blockchain processing failed');
        // If blockchain fails, unlock spin after animation
        setTimeout(() => {
          setIsSpinLocked(false);
        }, 5000);
      }
    } catch (error) {
      devLog('❌ Blockchain spin error: ' + error);
      // If blockchain fails, unlock spin after animation
      setTimeout(() => {
        setIsSpinLocked(false);
      }, 5000);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isSpinLocked && authenticated) {
        event.preventDefault();
        spinSlotMachine();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSpinLocked, authenticated]);

  // ✅ IMPROVED: Reel animation with blockchain result integration
  useFrame(() => {
    for (let i = 0; i < reelRefs.length; i++) {
      const reel = reelRefs[i].current;
      if (!reel || reel.reelSpinUntil === undefined) continue;

      reel.reelSegment = reel.reelSegment ?? 0;

      const targetRotationX =
        (reel.reelSpinUntil - reel.reelSegment) * WHEEL_SEGMENT;
      const rotationSpeed = 0.1;

      if (reel.rotation.x < targetRotationX) {
        reel.rotation.x += rotationSpeed;
        reel.reelSegment = Math.floor(reel.rotation.x / WHEEL_SEGMENT);
      } else {
        // ✅ Reel has reached its target - determine what fruit to show
        let fruit;
        
        if (shouldUseBlockchainResult && blockchainOutcome) {
          // ✅ Use blockchain result
          const blockchainFruit = blockchainOutcome.combination[i];
          fruit = blockchainFruit?.toUpperCase();
          console.log(`🎯 Reel ${i + 1} using blockchain result: ${fruit}`);
        } else {
          // ✅ Use random result (fallback or no blockchain result yet)
          fruit = segmentToFruit(i, reel.reelSegment);
        }
        
        if (fruit) {
          if (i === 0) setFruit0(fruit);
          if (i === 1) setFruit1(fruit);
          if (i === 2) setFruit2(fruit);
        }

        devLog(`Reel ${i + 1} stopped at segment ${reel.reelSegment} ${fruit}`);

        reel.reelSpinUntil = undefined;

        setStoppedReels((prev) => {
          const newStopped = prev + 1;
          // ✅ When all reels stop, end the phase
          if (newStopped === 3) {
            setTimeout(() => {
              console.log('🎰 All reels stopped, ending phase');
              end(); // This will trigger popup display if blockchain result is ready
            }, 300);
          }
          return newStopped;
        });
      }
    }
  });

  useImperativeHandle(ref, () => ({
    reelRefs,
  }));

  const [buttonZ, setButtonZ] = useState(0);
  const [buttonY, setButtonY] = useState(-13);
  const [textZ, setTextZ] = useState(1.6);
  const [textY, setTextY] = useState(-14);

  // ✅ Button is disabled when spin is locked OR processing
  const canSpin = authenticated && !isSpinLocked && !isProcessingBlockchain;

  // ✅ Dynamic button text based on state
  const getButtonText = () => {
    if (!authenticated) return 'CONNECT WALLET';
    if (isSpinLocked) return 'SPINNING...';
    if (isProcessingBlockchain) return 'PROCESSING...';
    return `SPIN (${getSpinCost()})`;
  };

  return (
    <>
      <Reel
        ref={reelRefs[0]}
        value={value[0]}
        map={0}
        position={[-7, 0, 0]}
        rotation={[0, 0, 0]}
        scale={[10, 10, 10]}
        reelSegment={0}
      />
      <Reel
        ref={reelRefs[1]}
        value={value[1]}
        map={1}
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        scale={[10, 10, 10]}
        reelSegment={0}
      />
      <Reel
        ref={reelRefs[2]}
        value={value[2]}
        map={2}
        position={[7, 0, 0]}
        rotation={[0, 0, 0]}
        scale={[10, 10, 10]}
        reelSegment={0}
      />
      <Button
        scale={[0.055, 0.045, 0.045]}
        position={[0, buttonY, buttonZ]}
        rotation={[-Math.PI / 8, 0, 0]}
        onClick={() => {
          if (canSpin) {
            spinSlotMachine();
          }
        }}
        onPointerDown={() => {
          if (canSpin) {
            setButtonZ(-1);
            setButtonY(-13.5);
          }
        }}
        onPointerUp={() => {
          setButtonZ(0);
          setButtonY(-13);
        }}
      />
      <Text
        color={canSpin ? "white" : "#888"}
        anchorX="center"
        anchorY="middle"
        position={[0, textY, textZ]}
        rotation={[-Math.PI / 8, 0, 0]}
        fontSize={3}
        font="./fonts/nickname.otf"
        onPointerDown={() => {
          if (canSpin) {
            setTextZ(1.3);
            setTextY(-14.1);
          }
        }}
        onPointerUp={() => {
          setTextZ(1.6);
          setTextY(-14);
        }}
      >
        {getButtonText()}
      </Text>
    </>
  );
});

export default SlotMachine;