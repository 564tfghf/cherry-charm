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
    isSpinning, 
    getSpinCost,
    onReelAnimationComplete, // ✅ Function to call when animation completes
    hasPendingResult // ✅ Check if there's a pending result to show
  } = useBlockchainGame();

  const reelRefs = [
    useRef<ReelGroup>(null),
    useRef<ReelGroup>(null),
    useRef<ReelGroup>(null),
  ];

  const [stoppedReels, setStoppedReels] = useState(0);

  useEffect(() => {
    devLog('PHASE: ' + phase);
    if (phase === 'idle') {
      // Only update local coins for display purposes
      // Real rewards come from blockchain
      updateCoins(endgame(fruit0, fruit1, fruit2));
      
      // ✅ Check if we have a pending result to show after animation completes
      if (hasPendingResult) {
        setTimeout(() => {
          onReelAnimationComplete();
        }, 500); // Small delay to ensure animation is fully complete
      }
    }
  }, [phase, fruit0, fruit1, fruit2, updateCoins, hasPendingResult, onReelAnimationComplete]);

  const spinSlotMachine = async () => {
    if (!authenticated) {
      devLog('Not authenticated');
      return;
    }

    // Start optimistic UI immediately
    start();
    setStoppedReels(0);

    const min = 15;
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

    // Execute blockchain transaction in background
    try {
      await blockchainSpin();
      addSpin();
    } catch (error) {
      devLog('Blockchain spin failed: ' + error);
      // Revert optimistic UI if needed
      end();
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && phase !== 'spinning' && authenticated && !isSpinning) {
        event.preventDefault();
        spinSlotMachine();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [phase, authenticated, isSpinning]);

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
        const fruit = segmentToFruit(i, reel.reelSegment);
        if (fruit) {
          if (i === 0) setFruit0(fruit);
          if (i === 1) setFruit1(fruit);
          if (i === 2) setFruit2(fruit);
        }

        devLog(`Reel ${i + 1} stopped at segment ${reel.reelSegment} ${fruit}`);

        reel.reelSpinUntil = undefined;

        setStoppedReels((prev) => {
          const newStopped = prev + 1;
          // ✅ When all reels stop, end the phase after a delay
          if (newStopped === 3) {
            setTimeout(() => {
              end(); // This will trigger the popup display if there's a pending result
            }, 1000);
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

  const canSpin = authenticated && phase !== 'spinning' && !isSpinning;

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
        color="white"
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
        {!authenticated 
          ? 'CONNECT WALLET' 
          : isSpinning || phase === 'spinning' 
            ? 'SPINNING' 
            : `SPIN (${getSpinCost()})`
        }
      </Text>
    </>
  );
});

export default SlotMachine;