import type { Category } from '@/types/database';

/** The seven activity categories of the spec (P0-05), in display order. */
export const CATEGORIES: { id: Category; label: string; tint: string }[] = [
  { id: 'art_walks', label: 'Art and walks', tint: '#B45309' },
  { id: 'make', label: 'Make something', tint: '#7C3AED' },
  { id: 'outdoors', label: 'Outdoors', tint: '#15803D' },
  { id: 'food_drink', label: 'Food and drink', tint: '#C2410C' },
  { id: 'games_trivia', label: 'Games and trivia', tint: '#1D4ED8' },
  { id: 'music_film', label: 'Music and film', tint: '#BE185D' },
  { id: 'active', label: 'Active', tint: '#0E7490' },
];

export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? c;
export const categoryTint = (c: Category) => CATEGORIES.find((x) => x.id === c)?.tint ?? '#475569';
