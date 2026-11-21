// "Get a heads-up?" is offered once, right after the person's first join or first send (rule 6: never at launch).
// The screens that join or send call `offerNotifications()`; the host mounted in the root layout shows the sheet.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onOffer(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Asks the host to offer notifications if the person has not been asked yet. Never throws, never waits. */
export function offerNotifications(): void {
  for (const listener of listeners) listener();
}
