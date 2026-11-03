import React, { useEffect, useRef, useState } from 'react';
import {
  GameEngine,
  GameStats,
  GameState,
  PowerUpUpgrades,
  ConsumableInventory,
} from './game/gameEngine';
import { CharacterType } from './game/models/characterBuilder';
import { UIOverlay } from './components/UIOverlay';
import { soundManager } from './audio/soundManager';
import { Adventure, loadAdventure, safeStorage, Quality, Outfit } from './game/adventure';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [adventure, setAdventure] = useState<Adventure>(loadAdventure);
  const [bootError, setBootError] = useState('');
  const [gameState, setGameState] = useState<GameState>('menu');
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterType>('bubu');
  const [isMuted, setIsMuted] = useState<boolean>(soundManager.getMuted());
  const [preRunHeadstart, setPreRunHeadstart] = useState<boolean>(false);
  const [preRunScoreBooster, setPreRunScoreBooster] = useState<boolean>(false);

  const [upgrades, setUpgrades] = useState<PowerUpUpgrades>({
    jetpack: 1,
    magnet: 1,
    sneakers: 1,
    multiplier2x: 1,
  });

  const [consumables, setConsumables] = useState<ConsumableInventory>({
    hoverboards: 3,
    headstarts: 2,
    scoreBoosters: 2,
    mysteryBoxes: 1,
  });

  const [stats, setStats] = useState<GameStats>({
    chaseTimeLeft: 0, togetherCharge: 30, district: 0, districtProgress: 0, districtChallenge: 0, districtChallengeDone: false, feedback: '',
    score: 0,
    distance: 0,
    coins: 0,
    walletCoins: parseInt(safeStorage.get('bubududu_wallet_coins') || '500', 10),
    speed: 19,
    bobaTimeLeft: 0,
    magnetTimeLeft: 0,
    jetpackTimeLeft: 0,
    sneakersTimeLeft: 0,
    multiplierTimeLeft: 0,
    hoverboardTimeLeft: 0,
    hoverboardActive: false,
    scoreMultiplier: 1,
    mysteryBoxesCount: 0,
    hoverboardsCount: 3,
    headstartsCount: 2,
    scoreBoostersCount: 2,
    highScore: parseInt(safeStorage.get('bubududu_high_score') || '0', 10),
    guardDistance: 3.8,
    comboCount: 0,
    feverCharge: 0,
    feverActive: false,
    feverTimeLeft: 0,
    loveCarTimeLeft: 0,
    loveCarActive: false,
    duoActive: false,
    duoTimeLeft: 0,
    mission: {
      id: 'coins_1',
      title: 'Collect 35 Coins',
      current: 0,
      target: 35,
      completed: false,
      rewardClaimed: false,
    },
  });

  useEffect(() => {
    if (!canvasMountRef.current) return;

    // Instantiate 3D Game Engine
    let engine: GameEngine;
    try { engine = new GameEngine(canvasMountRef.current, {
      onStateChange: setGameState,
      onCharacterChange: setSelectedCharacter,
      onStatsUpdate: (newStats) => {
        setStats(newStats);
        setUpgrades(engine.getUpgrades());
        setConsumables(engine.getConsumables());
      },
      onGameOver: (finalStats) => {
        setAdventure(engine.getAdventure());
        setGameState('gameover');
        setStats(finalStats);
        setUpgrades(engine.getUpgrades());
        setConsumables(engine.getConsumables());
      },
      onIntroComplete: () => {
        setGameState('playing');
      },
    });

    } catch (error) { setBootError('The 3D scene could not start. Enable hardware acceleration in your browser and reload.'); console.error(error); return; }
    engineRef.current = engine;
    setUpgrades(engine.getUpgrades());
    setConsumables(engine.getConsumables());
    (window as unknown as { __engine: typeof engine }).__engine = engine;

  return () => {
      engine.dispose();
      engineRef.current = null;
      delete (window as any).__engine;
    };
  }, []);

  const handleSelectCharacter = (char: CharacterType) => {
    setSelectedCharacter(char);
    engineRef.current?.setPlayerCharacter(char);
  };

  const handleStartGame = () => {
    if (engineRef.current) {
      engineRef.current.preRunHeadstart = preRunHeadstart;
      engineRef.current.preRunScoreBooster = preRunScoreBooster;
      setGameState('intro');
      engineRef.current.startIntro();
    }
  };

  const handleSwitchDuo = () => {
    if (!engineRef.current) return;
    const next = engineRef.current.switchDuoCharacter();
    setSelectedCharacter(next);
  };

  const handleActivateDuo = () => {
    engineRef.current?.activateDuoMode(15.0);
  };

  const handleSkipIntro = () => {
    engineRef.current?.skipIntro();
    setGameState('playing');
  };

  const handleTogglePause = () => {
    engineRef.current?.togglePause();
    if (engineRef.current) {
      setGameState(engineRef.current.gameState);
    }
  };

  const handleShiftLane = (dir: -1 | 1) => {
    engineRef.current?.shiftLane(dir);
  };

  const handleJump = () => {
    engineRef.current?.jump();
  };

  const handleSlide = () => {
    engineRef.current?.slide();
  };

  const handleToggleMute = () => {
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  };

  const handleBackToMenu = () => {
    if (engineRef.current) setAdventure(engineRef.current.getAdventure());
    setGameState('menu');
    engineRef.current?.resetToMenu();
  };

  const handleActivateHoverboard = () => {
    engineRef.current?.activateHoverboard();
  };

  const handleUpgradePowerUp = (key: keyof PowerUpUpgrades): boolean => {
    if (!engineRef.current) return false;
    const ok = engineRef.current.upgradePowerUp(key);
    if (ok) {
      setUpgrades(engineRef.current.getUpgrades());
      setStats((prev) => ({
        ...prev,
        walletCoins: engineRef.current!.getWalletCoins(),
      }));
    }
    return ok;
  };

  const handleBuyConsumable = (key: keyof ConsumableInventory): boolean => {
    if (!engineRef.current) return false;
    const ok = engineRef.current.buyConsumable(key);
    if (ok) {
      setConsumables(engineRef.current.getConsumables());
      setStats((prev) => ({
        ...prev,
        walletCoins: engineRef.current!.getWalletCoins(),
      }));
    }
    return ok;
  };

  const handleOpenMysteryBox = () => {
    if (!engineRef.current) return null;
    const res = engineRef.current.openMysteryBox();
    setUpgrades(engineRef.current.getUpgrades());
    setConsumables(engineRef.current.getConsumables());
    setStats((prev) => ({
      ...prev,
      walletCoins: engineRef.current!.getWalletCoins(),
      mysteryBoxesCount: engineRef.current!.getConsumables().mysteryBoxes,
    }));
    return res;
  };

  const handleTogglePreRunHeadstart = () => {
    setPreRunHeadstart((prev) => {
      const next = !prev;
      if (engineRef.current) engineRef.current.preRunHeadstart = next;
      return next;
    });
  };

  const handleTogglePreRunScoreBooster = () => {
    setPreRunScoreBooster((prev) => {
      const next = !prev;
      if (engineRef.current) engineRef.current.preRunScoreBooster = next;
      return next;
    });
  };

    const refreshAdventure = () => {
    if (!engineRef.current) return;
    setAdventure(engineRef.current.getAdventure());
    setStats(prev => ({ ...prev, walletCoins: engineRef.current!.getWalletCoins() }));
  };
  return (
    <main className="fixed inset-0 w-full h-full h-[100dvh] overflow-hidden bg-slate-900 select-none">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full overflow-hidden touch-none"
      />

      {bootError && <div className="boot-error" role="alert"><h1>Let’s get you running</h1><p>{bootError}</p><button onClick={() => location.reload()}>Try again</button></div>}
      {/* Adventure interface */}
      <UIOverlay
        adventure={adventure}
        onDecorate={(id) => { const ok = engineRef.current?.decorate(id) || false; refreshAdventure(); return ok; }}
        onOutfit={(outfit: Outfit) => { engineRef.current?.setOutfit(outfit); refreshAdventure(); }}
        onSettings={(quality: Quality, reduced: boolean) => { engineRef.current?.configure(quality, reduced); refreshAdventure(); }}
        onTutorialDone={() => { engineRef.current?.finishTutorial(); refreshAdventure(); }}
        onDistrict={(index) => { if (engineRef.current) engineRef.current.startDistrict = index; }}
        gameState={gameState}
        stats={stats}
        selectedCharacter={selectedCharacter}
        onSelectCharacter={handleSelectCharacter}
        onStartGame={handleStartGame}
        onTogglePause={handleTogglePause}
        onShiftLane={handleShiftLane}
        onJump={handleJump}
        onSlide={handleSlide}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onBackToMenu={handleBackToMenu}
        onSkipIntro={handleSkipIntro}
        onActivateHoverboard={handleActivateHoverboard}
        onUpgradePowerUp={handleUpgradePowerUp}
        onBuyConsumable={handleBuyConsumable}
        onOpenMysteryBox={handleOpenMysteryBox}
        upgrades={upgrades}
        consumables={consumables}
        preRunHeadstart={preRunHeadstart}
        onTogglePreRunHeadstart={handleTogglePreRunHeadstart}
        preRunScoreBooster={preRunScoreBooster}
        onTogglePreRunScoreBooster={handleTogglePreRunScoreBooster}
        onSwitchDuo={handleSwitchDuo}
        onActivateDuo={handleActivateDuo}
      />
    </main>
  );
}
