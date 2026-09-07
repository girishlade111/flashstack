import Dexie, { type EntityTable } from 'dexie';

/**
 * FlashStack local database (IndexedDB, via Dexie).
 *
 * Everything lives in the browser — there is no server and no network call
 * anywhere in this module. Decks, cards and review history never leave the
 * device.
 *
 * Astro note: this module is safe to import from a React island, but the CRUD
 * helpers below talk to IndexedDB and therefore only run in the browser. Use
 * `client:only="react"` (or an equivalent mount guard) on islands that call
 * them, otherwise the SSR pass will throw.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Epoch milliseconds. Numbers keep indexed range comparisons unambiguous. */
export type Timestamp = number;

/** SM-2 recall rating: 0 = total blackout … 5 = perfect response. */
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

/** SM-2 starting ease factor. Grows/shrinks per review; floors at 1.3. */
export const DEFAULT_EASE_FACTOR = 2.5;

// ---------------------------------------------------------------------------
// Table interfaces
// ---------------------------------------------------------------------------

export interface Deck {
  id: number;
  name: string;
  description: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Denormalised card tally so the deck list renders without counting rows. */
  cardCount: number;
}

export interface Card {
  id: number;
  deckId: number;
  front: string;
  back: string;
  createdAt: Timestamp;

  // --- SM-2 scheduling state ---
  /** Current interval in days. 0 until the card's first successful review. */
  interval: number;
  /** Consecutive successful reviews. Resets to 0 on a lapse. */
  repetitions: number;
  /** SM-2 "E-Factor". Multiplier applied to the interval. Starts at 2.5. */
  easeFactor: number;
  /** When the card becomes reviewable. Indexed for the due query. */
  dueDate: Timestamp;
  /** Null until the card is reviewed for the first time. */
  lastReviewed: Timestamp | null;
}

export interface ReviewLog {
  id: number;
  cardId: number;
  reviewedAt: Timestamp;
  quality: ReviewQuality;
  /** Interval in days before this review. */
  intervalBefore: number;
  /** Interval in days after this review. */
  intervalAfter: number;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

class FlashStackDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  reviewLogs!: EntityTable<ReviewLog, 'id'>;

  constructor() {
    super('FlashStack');

    // v1 — indexes are chosen for the two hot queries:
    //   • cards of a deck due on/before a date  -> [deckId+dueDate]
    //   • review history for a card             -> reviewLogs.cardId
    this.version(1).stores({
      decks: '++id, name, createdAt, updatedAt',
      cards: '++id, deckId, dueDate, [deckId+dueDate]',
      reviewLogs: '++id, cardId, reviewedAt',
    });
  }
}

export const db = new FlashStackDB();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isBrowser = typeof indexedDB !== 'undefined';

/**
 * Fail loudly (and usefully) when a CRUD helper is reached during SSR/build.
 * Without this, Dexie throws an opaque "IndexedDB API missing".
 */
function ensureClient(op: string): void {
  if (!isBrowser) {
    throw new Error(
      `db.${op}() requires a browser — IndexedDB is unavailable during SSR. ` +
        `Render this island with client:only="react".`,
    );
  }
}

/** 23:59:59.999 on the day containing `now`, in epoch ms. */
export function endOfToday(now: Timestamp = Date.now()): Timestamp {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

/** Create a deck. Returns the new deck id. */
export async function createDeck(input: {
  name: string;
  description?: string;
}): Promise<number> {
  ensureClient('createDeck');

  const now = Date.now();
  return db.decks.add({
    name: input.name,
    description: input.description ?? '',
    createdAt: now,
    updatedAt: now,
    cardCount: 0,
  });
}

/** All decks, oldest first. */
export async function getAllDecks(): Promise<Deck[]> {
  ensureClient('getAllDecks');
  return db.decks.orderBy('createdAt').toArray();
}

/**
 * Delete a deck and everything under it.
 *
 * Cascades to the deck's cards *and* their review logs — dropping the cards
 * alone would leave orphaned logs that skew the retention stats.
 */
export async function deleteDeck(deckId: number): Promise<void> {
  ensureClient('deleteDeck');

  await db.transaction('rw', db.decks, db.cards, db.reviewLogs, async () => {
    const cardIds = await db.cards.where('deckId').equals(deckId).primaryKeys();

    await db.reviewLogs.where('cardId').anyOf(cardIds).delete();
    await db.cards.where('deckId').equals(deckId).delete();
    await db.decks.delete(deckId);
  });
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/**
 * Add a card to a deck. Returns the new card id.
 *
 * New cards start with `interval: 0`, `repetitions: 0` and the default ease
 * factor, and are `dueDate: now` so they are immediately reviewable.
 * The parent deck's `cardCount` is bumped in the same transaction.
 */
export async function createCard(input: {
  deckId: number;
  front: string;
  back: string;
}): Promise<number> {
  ensureClient('createCard');

  const now = Date.now();
  return db.transaction('rw', db.cards, db.decks, async () => {
    const id = await db.cards.add({
      deckId: input.deckId,
      front: input.front,
      back: input.back,
      createdAt: now,
      interval: 0,
      repetitions: 0,
      easeFactor: DEFAULT_EASE_FACTOR,
      dueDate: now,
      lastReviewed: null,
    });

    await db.decks.update(input.deckId, (deck) => {
      deck.cardCount += 1;
      deck.updatedAt = now;
    });

    return id;
  });
}

/**
 * Patch a card. Hand this the SM-2 fields after a review — e.g.
 * `updateCard(id, { interval, repetitions, easeFactor, dueDate, lastReviewed })`.
 */
export async function updateCard(
  cardId: number,
  changes: Partial<Omit<Card, 'id'>>,
): Promise<void> {
  ensureClient('updateCard');
  await db.cards.update(cardId, changes);
}

/** Delete a card, its review history, and decrement the parent deck's tally. */
export async function deleteCard(cardId: number): Promise<void> {
  ensureClient('deleteCard');

  await db.transaction('rw', db.cards, db.decks, db.reviewLogs, async () => {
    const card = await db.cards.get(cardId);
    if (!card) return;

    await db.cards.delete(cardId);
    await db.reviewLogs.where('cardId').equals(cardId).delete();

    await db.decks.update(card.deckId, (deck) => {
      deck.cardCount = Math.max(0, deck.cardCount - 1);
      deck.updatedAt = Date.now();
    });
  });
}

/**
 * Cards in `deckId` due on or before the end of today, soonest first.
 *
 * Includes overdue cards — that is what reviewers expect from "due today".
 * Uses the `[deckId+dueDate]` compound index.
 *
 * @param now Injectable clock, for tests.
 */
export async function getCardsDueToday(
  deckId: number,
  now: Timestamp = Date.now(),
): Promise<Card[]> {
  ensureClient('getCardsDueToday');

  const cutoff = endOfToday(now);
  return db.cards
    .where('[deckId+dueDate]')
    .between([deckId, 0], [deckId, cutoff], true, true)
    .sortBy('dueDate');
}
