import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { draftReducer, type DraftAction, type PlanDraft } from './draft';

const STORAGE_KEY = 'sq.planDraft.v1';

type Store = {
  draft: PlanDraft | null;
  /** false until the saved draft has been read from the phone */
  loaded: boolean;
  /** Resume the saved draft with the same key, or start a new one (with a new request id). */
  begin: (init: Omit<PlanDraft, 'clientKey'>) => PlanDraft;
  dispatch: (a: DraftAction) => void;
  clear: () => void;
};
const Ctx = createContext<Store | null>(null);

/**
 * Drafts are saved on this phone as fields change (so leaving the screen, or the app, loses nothing) and are only
 * sent when the organizer taps "Send invitation". A draft's `clientKey` is made once and reused by every Retry.
 */
export function PlanDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<PlanDraft | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (alive && raw) { const d = JSON.parse(raw) as PlanDraft; ref.current = d; setDraft(d); } })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const save = useCallback((d: PlanDraft | null) => {
    ref.current = d;
    setDraft(d);
    (d ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d)) : AsyncStorage.removeItem(STORAGE_KEY)).catch(() => undefined);
  }, []);

  const begin = useCallback((init: Omit<PlanDraft, 'clientKey'>) => {
    const existing = ref.current;
    if (existing && existing.key === init.key) return existing;
    const fresh: PlanDraft = { ...init, clientKey: Crypto.randomUUID() };
    save(fresh);
    return fresh;
  }, [save]);

  const dispatch = useCallback((a: DraftAction) => {
    if (ref.current) save(draftReducer(ref.current, a));
  }, [save]);

  const clear = useCallback(() => save(null), [save]);

  const value = useMemo(() => ({ draft, loaded, begin, dispatch, clear }), [draft, loaded, begin, dispatch, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanDraft(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlanDraft must be used inside <PlanDraftProvider>');
  return v;
}
