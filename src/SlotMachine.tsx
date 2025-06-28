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

  const [stoppedReels, setStoppedReels] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  
  // ✅ Store blockchain result for THIS specific spin
  const [currentSpinResult, setCurrentSpinResult] = useState<any>(null);
  const [blockchainProcessing, setBlockchainProcessing] = useState(false);

  // ✅ Handle phase changes
  useEffect(() => {
    devLog('PHASE: ' + phase);
    if (phase === 'idle' && !isSpinning) {
      // Only update coins if we don't have a blockchain result
      if (!currentSpinResult) {
        updateCoins(endgame(fruit0, fruit1, fruit2));
      }
    }
  }, [phase, fruit0, fruit1, fruit2, updateCoins, currentSpinResult, isSpinning]);

  // ✅ SIMPLIFIED: Main spin function
  const spinSlotMachine = async () => {
    if (!authenticated) {
      devLog('❌ Not authenticated');
      return;
    }

    if (isSpinning) {
      devLog('❌ Already spinning');
      return;
    }

    console.log('🚀 Starting spin: blockchain + UI simultaneously');
    
    // ✅ 1. Lock spinning immediately
    setIsSpinning(true);
    setBlockchainProcessing(true);
    
    // ✅ 2. Clear any previous result
    setCurrentSpinResult(null);
    
    // ✅ 3. Start UI animation immediately
    start();
    setStoppedReels(0);
    addSpin();

    // ✅ 4. Start blockchain processing in background
    blockchainSpin().then((result) => {
      if (result) {
        console.log('🎯 Blockchain result received:', result);
        setCurrentSpinResult(result);
        setBlockchainProcessing(false);
      } else {
        console.log('❌ No blockchain result received');
        setBlockchainProcessing(false);
      }
    }).catch((error) => {
      console.error('❌ Blockchain processing failed:', error);
      setBlockchainProcessing(false);
    });

    // ✅ 5. Configure reel animation
    const min = 20;
    const max = 30;
    const getRandomStopSegment = () =>
      Math.floor(Math.random() * (max - min + 1)) + min;

    setFruit0('');
    setFruit1('');
    setFruit2('');

    // Start reel animations
    for (let i = 0; i < 3; i++) {
      const reel = reelRefs[i].current;
      if (reel) {
        reel.rotation.x = 0;
        reel.reelSegment = 0;
        reel.reelSpinUntil = getRandomStopSegment();
        reel.reelStopSegment = 0;
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isSpinning && authenticated) {
        event.preventDefault();
        spinSlotMachine();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSpinning, authenticated]);

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
        
        if (currentSpinResult && currentSpinResult.combination) {
          // ✅ Use blockchain result if available
          const blockchainFruit = currentSpinResult.combination[i];
          fruit = blockchainFruit?.toUpperCase();
          console.log(`🎯 Reel ${i + 1} using blockchain result: ${fruit}`);
        } else {
          // ✅ Use random result (fallback)
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
          if (newStopped === 3) {
            console.log('🎰 All reels stopped, ending phase');
            setTimeout(() => {
              end();
              
              // ✅ Show popup if we have blockchain result
              if (currentSpinResult) {
                setTimeout(() => {
                  console.log('🎰 Showing popup with result:', currentSpinResult);
                  setOutcomePopup(currentSpinResult);
                  setCurrentSpinResult(null); // Clear after showing
                }, 1000);
              }
              
              // ✅ Unlock spinning
              setIsSpinning(false);
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

  // ✅ Simple button state
  const canSpin = authenticated && !isSpinning;

  // ✅ FIXED: Simple button text - no "processing"
  const getButtonText = () => {
    if (!authenticated) return 'CONNECT WALLET';
    if (isSpinning) return 'SPINNING...';
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