import type { Region } from 'react-native-maps';

type Coordinate = { lat: number | null; lng: number | null };

/** Inclusive visible-map filter. Coordinates without a map position cannot be in the viewport. */
export function isInRegion(item: Coordinate, region: Region): boolean {
  if (item.lat === null || item.lng === null) return false;
  const halfLatitude = Math.abs(region.latitudeDelta) / 2;
  const halfLongitude = Math.abs(region.longitudeDelta) / 2;
  return item.lat >= region.latitude - halfLatitude
    && item.lat <= region.latitude + halfLatitude
    && item.lng >= region.longitude - halfLongitude
    && item.lng <= region.longitude + halfLongitude;
}

export function filterToRegion<T extends Coordinate>(items: T[], region?: Region): T[] {
  return region ? items.filter(item => isInRegion(item, region)) : items;
}

export type AreaSearchState = { applied?: Region; candidate?: Region; userMoved: boolean };
// A touch on the map marks the next settled region as the person's move. react-native-maps on iOS
// (Apple Maps) only fires onPanDrag with scrolling turned off and reports isGesture on Google Maps only,
// so touches are the signal. App moves (Locate me) send 'app-move' so they never prompt.
export type AreaSearchAction =
  | { type: 'user-touch' }
  | { type: 'app-move' }
  | { type: 'region-complete'; region: Region }
  | { type: 'apply' }
  | { type: 'clear' };

export const INITIAL_AREA_SEARCH: AreaSearchState = { userMoved: false };

export function updateAreaSearch(state: AreaSearchState, action: AreaSearchAction): AreaSearchState {
  if (action.type === 'user-touch') return { ...state, userMoved: true };
  if (action.type === 'app-move') return { ...state, userMoved: false };
  if (action.type === 'region-complete') return state.userMoved
    ? { ...state, candidate: action.region, userMoved: false }
    : state;
  if (action.type === 'apply') return state.candidate
    ? { applied: state.candidate, userMoved: false }
    : state;
  return { userMoved: false };
}
