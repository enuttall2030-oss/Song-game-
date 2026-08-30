import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import type { GameAction } from '../game/actions';
import { createInitialState, gameReducer } from '../game/reducer';
import type { GameState } from '../game/types';
import { loadPersistedState, savePersistedState } from './statePersistence';

interface AppStateContextValue {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

function initialState(): GameState {
  return loadPersistedState() ?? createInitialState();
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, undefined, initialState);

  // Mirrored to sessionStorage on every transition so the Spotify OAuth redirect (a full page
  // navigation, twice per match) resumes exactly where it left off.
  useEffect(() => {
    savePersistedState(state);
  }, [state]);

  return <AppStateContext.Provider value={{ state, dispatch }}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within an AppStateProvider');
  return ctx;
}
