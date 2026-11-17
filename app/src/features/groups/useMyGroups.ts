import { useQuery } from '@tanstack/react-query';
import { fetchMyGroups, myGroupsKey } from './overview';

/** The viewer's groups. Same query as Your groups, so the Save sheet and Map chips share its cache. */
export function useMyGroups(userId: string | undefined) {
  return useQuery({ queryKey: [...myGroupsKey, userId], enabled: Boolean(userId), queryFn: () => fetchMyGroups(userId!), staleTime: 30_000 });
}
