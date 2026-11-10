import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { builderReducer, INITIAL_BUILDER, type BuilderAction, type BuilderState } from './builderState';

type Value = { state: BuilderState; dispatch: (a: BuilderAction) => void };
const Ctx = createContext<Value | null>(null);

/**
 * The pick being assembled before "Open voting". It lives for the whole app session so a person can browse the map,
 * open a few experiences, and add each one; nothing is sent until create_pick.
 */
export function PickBuilderProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(builderReducer, INITIAL_BUILDER);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePickBuilder(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePickBuilder must be used inside <PickBuilderProvider>');
  return v;
}
