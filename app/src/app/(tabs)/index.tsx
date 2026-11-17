import { router } from 'expo-router';
import PlansHubScreen from '@/features/plans/PlansHubScreen';

// Home tab. Until the Home screen from Figma 2.1 (28:3386) is built (TEC-113), it shows the Plans hub, with a link
// to Your groups, which Figma also puts on Home.
export default function HomeTab() {
  return <PlansHubScreen onGroups={() => router.push('/groups')} />;
}
