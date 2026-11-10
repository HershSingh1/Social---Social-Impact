import type { PickExperience } from '@/types/database';
import { builderReducer, deadlineError, INITIAL_BUILDER, resolveDeadline, type BuilderItem } from './builderState';

const ex = (id: string): PickExperience => ({ id, name: id, category: 'outdoors', area: 'Zilker', price_kind: 'free', price_min: 0, price_max: 0, booking_required: false, timing_kind: 'flexible', meeting_point: 'Gate' });
const item = (id: string): BuilderItem => ({ experience: ex(id), proposedStart: null });
const add = (s = INITIAL_BUILDER, id = 'a') => builderReducer(s, { type: 'add', item: item(id) });

describe('pick builder', () => {
  it('collects up to 5 options', () => {
    let s = INITIAL_BUILDER;
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) s = add(s, id);
    expect(s.items.map((i) => i.experience.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('allows the same experience twice (different times)', () => {
    expect(add(add(INITIAL_BUILDER, 'a'), 'a').items).toHaveLength(2);
  });
  it('keeps the star on the right option when others are removed', () => {
    let s = ['a', 'b', 'c'].reduce((acc, id) => add(acc, id), INITIAL_BUILDER);
    s = builderReducer(s, { type: 'setStar', index: 2 });
    s = builderReducer(s, { type: 'remove', index: 0 });
    expect(s.starred).toBe(1);
    expect(s.items[s.starred!].experience.id).toBe('c');
    s = builderReducer(s, { type: 'remove', index: 1 });
    expect(s.starred).toBeNull();
  });
  it('tapping the star again clears it', () => {
    let s = add();
    s = builderReducer(s, { type: 'setStar', index: 0 });
    expect(s.starred).toBe(0);
    expect(builderReducer(s, { type: 'setStar', index: 0 }).starred).toBeNull();
  });
  it('switching group starts over; setting the same group keeps the list', () => {
    let s = builderReducer(INITIAL_BUILDER, { type: 'setGroup', groupId: 'g1' });
    s = add(s);
    expect(builderReducer(s, { type: 'setGroup', groupId: 'g1' }).items).toHaveLength(1);
    expect(builderReducer(s, { type: 'setGroup', groupId: 'g2' })).toEqual({ ...INITIAL_BUILDER, groupId: 'g2' });
  });
  it('sets a proposed time per option and resets', () => {
    let s = add(add(INITIAL_BUILDER, 'a'), 'b');
    s = builderReducer(s, { type: 'setTime', index: 1, iso: '2026-11-14T20:00:00.000Z' });
    expect(s.items.map((i) => i.proposedStart)).toEqual([null, '2026-11-14T20:00:00.000Z']);
    expect(builderReducer(s, { type: 'reset' })).toEqual(INITIAL_BUILDER);
  });
});

describe('deadline (P0-08: 6, 12, 24 (default), 48 hours or custom 1 hour to 7 days)', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  it('defaults to 24 hours', () => {
    expect(INITIAL_BUILDER.deadline).toEqual({ kind: 'hours', hours: 24 });
    expect(resolveDeadline(INITIAL_BUILDER.deadline, now).toISOString()).toBe('2026-11-15T12:00:00.000Z');
  });
  it('validates a custom deadline', () => {
    expect(deadlineError({ kind: 'custom', iso: '2026-11-14T12:30:00Z' }, now)).toMatch(/at least 1 hour/);
    expect(deadlineError({ kind: 'custom', iso: '2026-11-14T13:00:00Z' }, now)).toBeNull();
    expect(deadlineError({ kind: 'custom', iso: '2026-11-21T12:00:00Z' }, now)).toBeNull();
    expect(deadlineError({ kind: 'custom', iso: '2026-11-22T12:00:00Z' }, now)).toMatch(/at most 7 days/);
    expect(deadlineError({ kind: 'hours', hours: 6 }, now)).toBeNull();
  });
});
