import { useLiveQuery } from 'dexie-react-hooks';

import {
  getAllDecks,
  getCardsDueToday,
  db,
  type Card,
  type Deck,
} from './db';

/**
 * Reactive read hooks for React islands, backed by Dexie's liveQuery.
 *
 * Every hook returns `undefined` while the first query is in flight, so
 * islands can render a loading state. After that, any write made through
 * the helpers in `db.ts` re-runs the query and re-renders automatically —
 * no manual refetch, no global store.
 *
 * These are safe under SSR: useLiveQuery runs its querier inside an effect,
 * which never fires on the server. Islands that also *write* should still be
 * mounted with client:only="react" (see ensureClient in db.ts).
 */

/** All decks. Re-renders on deck create/update/delete. */
export function useDecks(): Deck[] | undefined {
  return useLiveQuery(() => getAllDecks(), []);
}

/** A single deck, or undefined while loading / if it was deleted. */
export function useDeck(deckId: number): Deck | undefined {
  return useLiveQuery(() => db.decks.get(deckId), [deckId]);
}

/**
 * Cards in a deck due on or before the end of today.
 *
 * Note this is a point-in-time snapshot: it re-runs when the data changes,
 * not when the clock crosses midnight. Remount (or a re-render with a new
 * `now`) to pick up tomorrow's queue.
 */
export function useCardsDueToday(deckId: number): Card[] | undefined {
  return useLiveQuery(() => getCardsDueToday(deckId), [deckId]);
}
