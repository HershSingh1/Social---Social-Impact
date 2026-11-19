import AsyncStorage from '@react-native-async-storage/async-storage';

const offeredKey = (userId: string) => `sidequest.quizOffered.${userId}`;
/** True the first time it is called for this account, so the quiz is offered once after sign-up and never pushed again. */
export async function takeQuizOffer(userId: string): Promise<boolean> {
  if (await AsyncStorage.getItem(offeredKey(userId))) return false;
  await AsyncStorage.setItem(offeredKey(userId), '1');
  return true;
}
