import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { getEngineMode, setEngineMode, isNativeAvailable, type EngineMode } from './index';

interface EngineModeValue {
  mode: EngineMode;
  nativeAvailable: boolean;
  /** Bumps on every mode change; use as a remount key to force screens to refetch. */
  epoch: number;
  setMode: (m: EngineMode) => void;
}

const EngineModeContext = createContext<EngineModeValue | null>(null);

export function EngineModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<EngineMode>(getEngineMode());
  const [epoch, setEpoch] = useState(0);

  const setMode = useCallback((m: EngineMode) => {
    setEngineMode(m);
    setModeState(m);
    setEpoch(e => e + 1);
  }, []);

  const value = useMemo<EngineModeValue>(
    () => ({ mode, nativeAvailable: isNativeAvailable(), epoch, setMode }),
    [mode, epoch, setMode],
  );

  return <EngineModeContext.Provider value={value}>{children}</EngineModeContext.Provider>;
}

export function useEngineMode(): EngineModeValue {
  const ctx = useContext(EngineModeContext);
  if (!ctx) throw new Error('useEngineMode must be used within EngineModeProvider');
  return ctx;
}
