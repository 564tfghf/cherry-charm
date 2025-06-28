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
  const setOutcomePopup = useGame((state) => state.setOutcomePopup);
  const outcomePopup = useGame((state) => state.outcomePopup);

  // Blockchain integration
  const { 
    spin: blockchainSpin, 
    authenticated, 
    getSpinCost
  } = useBlockchainGame();

  const reelRefs = [
    useRef<ReelGroup>(null),
    useRef<ReelGroup>(null),
    useRef<ReelGroup>(null),
  ];

  // ✅ SIMPLIFIED STATE MANAGEMENT
  const [gameState, setGameState] = useState<'idle' | 'spinning' | 'waiting-for-popup'>('idle');
  const [pendingBlockchainResult, setPendingBlockchainResult] = useState<any>(null);
  const [stoppedReels, setStoppedReels] = useState(0);

  // ✅ Handle phase changes for local coins only
  useEffect(() => {
    devLog('PHASE: ' + phase);
    if (phase === 'idle' && gameState === 'idle' && !pendingBlockchainResult) {
      // Only update local coins if no blockchain result
      updateCoins(endgame(fruit0, fruit1, fruit2));
    }
  }, [phase, gameState, pendingBlockchainResult]);

  // ✅ MAIN SPIN FUNCTION - Wait for blockchain OR timeout
  const spinSlotMachine = async () => {
    if (!authenticated) {
      devLog('❌ Not authenticated');
      return;
    }

    if (gameState !== 'idle') {
      console.log('❌ Cannot spin: Game state is', gameState);
      return;
    }

    console.log('🚀 STARTING NEW SPIN');
    
    // ✅ 1. LOCK EVERYTHING
    setGameState('spinning');
    setPendingBlockchainResult(null);
    
    // ✅ 2. START UI IMMEDIATELY
    start();
    setStoppedReels(0);
    addSpin();

    // ✅ 3. CLEAR PREVIOUS FRUITS
    setFruit0('');
    setFruit1('');
    setFruit2('');

    // ✅ 4. START BLOCKCHAIN SPIN WITH TIMEOUT
    let blockchainResult: any = null;
    let blockchainCompleted = false;

    // Start blockchain spin
    const blockchainPromise = blockchainSpin().then((result) => {
      blockchainCompleted = true;
      if (result) {
        console.log('🎯 BLOCKCHAIN RESULT READY:', result);
        blockchainResult = result;
        setPendingBlockchainResult(result);
      }
      return result;
    }).catch((error) => {
      blockchainCompleted = true;
      console.error('❌ Blockchain error:', error);
      return null;
    });

    // ✅ 5. CONFIGURE REEL ANIMATION - LONGER SPIN TIME
    const minSpinTime = 8000; // 8 seconds minimum
    const maxSpinTime = 12000; // 12 seconds maximum
    const spinDuration = Math.random() * (maxSpinTime - minSpinTime) + minSpinTime;
    
    console.log(`🎰 Reels will spin for ${spinDuration/1000} seconds`);

    // Start reel animations with longer duration
    for (let i = 0; i < 3; i++) {
      const reel = reelRefs[i].current;
      if (reel) {
        reel.rotation.x = 0;
        reel.reelSegment = 0;
        // Calculate segments needed for the spin duration
        const segmentsToSpin = Math.floor(spinDuration / 100); // ~10 segments per second
        reel.reelSpinUntil = segmentsToSpin + (i * 5); // Stagger reel stops
        reel.reelStopSegment = 0;
      }
    }

    // ✅ 6. WAIT FOR BLOCKCHAIN OR TIMEOUT
    setTimeout(async () => {
      if (!blockchainCompleted) {
        console.log('⏰ Blockchain taking too long, waiting a bit more...');
        // Wait another 5 seconds
        setTimeout(async () => {
          if (!blockchainCompleted) {
            console.log('⏰ Blockchain timeout - using random results');
          }
          // Blockchain result will be handled by the pending state
        }, 5000);
      }
    }, spinDuration);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && gameState === 'idle' && authenticated) {
        event.preventDefault();
        spinSlotMachine();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [gameState, authenticated]);

  // ✅ REEL ANIMATION - Use blockchain result when available
  useFrame(() => {
    if (gameState !== 'spinning') return;

    for (let i = 0; i < reelRefs.length; i++) {
      const reel = reelRefs[i].current;
      if (!reel || reel.reelSpinUntil === undefined) continue;

      reel.reelSegment = reel.reelSegment ?? 0;

      const targetRotationX =
        (reel.reelSpinUntil - reel.reelSegment) * WHEEL_SEGMENT;
      const rotationSpeed = 0.08; // Slightly slower for longer spins

      if (reel.rotation.x < targetRotationX) {
        reel.rotation.x += rotationSpeed;
        reel.reelSegment = Math.floor(reel.rotation.x / WHEEL_SEGMENT);
      } else {
        // ✅ REEL STOPPED - Determine fruit to show
        let fruit;
        
        if (pendingBlockchainResult && pendingBlockchainResult.combination) {
          // ✅ USE BLOCKCHAIN RESULT
          fruit = pendingBlockchainResult.combination[i]?.toUpperCase();
          console.log(`🎯 Reel ${i + 1} using BLOCKCHAIN result: ${fruit}`);
        } else {
          // ✅ USE RANDOM RESULT (fallback)
          fruit = segmentToFruit(i, reel.reelSegment);
          console.log(`🎲 Reel ${i + 1} using RANDOM result: ${fruit}`);
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
          if (newStopped === 3) {
            console.log('🎰 ALL REELS STOPPED');
            
            // ✅ END SPINNING PHASE
            setTimeout(() => {
              end();
              
              // ✅ ALWAYS SHOW POPUP IF WE HAVE BLOCKCHAIN RESULT
              if (pendingBlockchainResult) {
                console.log('🎯 SHOWING POPUP WITH BLOCKCHAIN RESULT');
                setGameState('waiting-for-popup');
                setTimeout(() => {
                  setOutcomePopup(pendingBlockchainResult);
                }, 1000);
              } else {
                console.log('🎲 NO BLOCKCHAIN RESULT - BACK TO IDLE');
                setGameState('idle');
              }
            }, 500);
          }
          return newStopped;
        });
      }
    }
  });

  // ✅ HANDLE POPUP DISMISSAL
  useEffect(() => {
    if (gameState === 'waiting-for-popup' && !outcomePopup) {
      console.log('🎰 POPUP DISMISSED - BACK TO IDLE');
      setGameState('idle');
      setPendingBlockchainResult(null);
    }
  }, [gameState, outcomePopup]);

  // ✅ HANDLE LATE BLOCKCHAIN RESULTS
  useEffect(() => {
    if (pendingBlockchainResult && gameState === 'idle' && phase === 'idle') {
      console.log('🎯 LATE BLOCKCHAIN RESULT - SHOWING POPUP NOW');
      setGameState('waiting-for-popup');
      setTimeout(() => {
        setOutcomePopup(pendingBlockchainResult);
      }, 500);
    }
  }, [pendingBlockchainResult, gameState, phase]);

  useImperativeHandle(ref, () => ({
    reelRefs,
  }));

  const [buttonZ, setButtonZ] = useState(0);
  const [buttonY, setButtonY] = useState(-13);
  const [textZ, setTextZ] = useState(1.6);
  const [textY, setTextY] = useState(-14);

  // ✅ Can only spin when idle
  const canSpin = authenticated && gameState === 'idle';

  // ✅ Button text based on game state
  const getButtonText = () => {
    if (!authenticated) return 'CONNECT WALLET';
    
    switch (gameState) {
      case 'spinning':
        return 'SPINNING...';
      case 'waiting-for-popup':
        return 'CLOSE POPUP TO CONTINUE';
      case 'idle':
      default:
        return `SPIN (${getSpinCost()})`;
    }
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