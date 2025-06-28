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
  const phase = useGame((state) => state.phase);
  const start = useGame((state) => state.start);
  const end = useGame((state) => state.end);
  const addSpin = useGame((state) => state.addSpin);
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

  // Game state management
  const [gameState, setGameState] = useState<'idle' | 'spinning' | 'waiting-for-popup'>('idle');
  const [stoppedReels, setStoppedReels] = useState(0);

  // Main spin function - shows popup immediately with blockchain results
  const spinSlotMachine = async () => {
    if (!authenticated) {
      console.log('❌ Not authenticated');
      return;
    }

    if (gameState !== 'idle') {
      console.log('❌ Cannot spin: Game state is', gameState);
      return;
    }

    console.log('🚀 Starting blockchain spin');
    
    // Lock the game state
    setGameState('spinning');
    
    // Start UI immediately
    start();
    setStoppedReels(0);
    addSpin();

    // Start blockchain spin and get result
    const blockchainResult = await blockchainSpin();
    
    if (blockchainResult) {
      console.log('🎯 Blockchain result received:', blockchainResult);
      
      // Show popup immediately with blockchain results
      setGameState('waiting-for-popup');
      setOutcomePopup(blockchainResult);
      
      // End the spinning phase
      end();
    } else {
      console.log('❌ No blockchain result - back to idle');
      setGameState('idle');
      end();
    }
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

  // Reel animation - just for visual effect, doesn't affect outcome
  useFrame(() => {
    if (gameState !== 'spinning') return;

    for (let i = 0; i < reelRefs.length; i++) {
      const reel = reelRefs[i].current;
      if (!reel) continue;

      // Simple continuous spinning animation
      reel.rotation.x += 0.3; // Fast spinning for visual effect
    }
  });

  // Handle popup dismissal
  useEffect(() => {
    if (gameState === 'waiting-for-popup' && !outcomePopup) {
      console.log('🎰 Popup dismissed - back to idle');
      setGameState('idle');
    }
  }, [gameState, outcomePopup]);

  useImperativeHandle(ref, () => ({
    reelRefs,
  }));

  const [buttonZ, setButtonZ] = useState(0);
  const [buttonY, setButtonY] = useState(-13);
  const [textZ, setTextZ] = useState(1.6);
  const [textY, setTextY] = useState(-14);

  // Can only spin when idle and authenticated
  const canSpin = authenticated && gameState === 'idle';

  // Button text based on game state
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