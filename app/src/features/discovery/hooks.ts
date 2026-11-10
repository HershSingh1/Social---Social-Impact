import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchExperience, fetchExperiences } from './api';

export function useExperiences() {
  const { userId } = useAuth();
  return useQuery({ queryKey: ['experiences'], queryFn: fetchExperiences, enabled: !!userId, staleTime: 5 * 60_000 });
}

export function useExperience(id: string) {
  const { userId } = useAuth();
  return useQuery({ queryKey: ['experience', id], queryFn: () => fetchExperience(id), enabled: !!userId });
}
