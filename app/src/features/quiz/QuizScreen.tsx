// Figma 4145:25136 (file MkYNxuYFuktTR0yGExJnK7): A intro, B a card, C the last card saving and failing.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, ErrorState, Label, Loading, Screen } from '../../ui';
import { color, radius, space, type } from '../../ui/theme';
import { fetchInterests, interestsKey, QUIZ_CARDS, SAVE_FAILED, saveQuiz, swipeAnswer, type Answer, type Answers } from './quiz';

type Props = { userId: string; onClose: () => void; onDone: () => void };

const CHOICES: { answer: Answer; label: string }[] = [{ answer: 'no', label: 'No' }, { answer: 'maybe', label: 'Maybe' }, { answer: 'yes', label: 'Yes' }];

export function QuizScreen({ userId, onClose, onDone }: Props) {
  const queryClient = useQueryClient();
  const old = useQuery({ queryKey: interestsKey(userId), queryFn: fetchInterests });
  const [index, setIndex] = useState(-1); // -1 is the intro
  const [chosen, setChosen] = useState<Answers>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const total = QUIZ_CARDS.length;

  if (old.isPending) return <Screen><Loading label="Loading the quiz…" /></Screen>;
  if (!old.data) return <Screen>
    <ErrorState message="Couldn’t load the quiz. Check your connection and try again." onRetry={async () => { await old.refetch(); }} />
    <Button label="Skip for now" variant="text" onPress={onClose} />
  </Screen>;
  const before = old.data;
  const retaking = Object.keys(before).length > 0;
  // Each card starts on the person's old answer when they retake.
  const current = (id: string): Answer | undefined => chosen[id] ?? before[id];

  async function finish(answers: Answers) {
    setSaving(true); setFailed(false);
    try {
      const merged = await saveQuiz(before, answers);
      queryClient.setQueryData(interestsKey(userId), merged);
      onDone();
    } catch { setFailed(true); } finally { setSaving(false); }
  }
  function answer(id: string, value: Answer | undefined) {
    const next = value ? { ...chosen, [id]: value } : chosen;
    setChosen(next);
    if (index === total - 1) void finish({ ...next });
    else setIndex(index + 1);
  }

  if (index === -1) return <Screen footer={<>
    <Button label="Start the quiz" onPress={() => setIndex(0)} />
    <Button label="Skip for now" variant="text" onPress={onClose} />
  </>}>
    <View style={styles.hero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
    <Label accessibilityRole="header" style={type.title1}>What are you into?</Label>
    <Label>About {total} quick cards. Tap Yes, Maybe or No for each kind of activity. Explore then lists matches first.</Label>
    {retaking && <Label style={type.bodyStrong}>Your new answers replace your old ones.</Label>}
    <Card><Label><Label style={type.bodyStrong}>Only you see your answers.</Label> Nothing is shared with your groups.</Label></Card>
  </Screen>;

  const card = QUIZ_CARDS[index];
  return <Screen>
    <View style={styles.nav}>
      <Button label="Back" accessibilityLabel="Previous card" variant="text" size="small" disabled={saving}
        onPress={() => { setFailed(false); setIndex(index === 0 ? -1 : index - 1); }} />
      <Label accessibilityLiveRegion="polite" style={type.bodyStrong}>Card {index + 1} of {total}</Label>
      {index < total - 1
        ? <Button label="Skip" accessibilityLabel={`Skip ${card.title}`} variant="text" size="small" onPress={() => answer(card.id, undefined)} />
        : <View style={styles.navSpacer} />}
    </View>
    <View accessible accessibilityRole="progressbar" accessibilityLabel={`Card ${index + 1} of ${total}`} style={styles.track}>
      <View style={[styles.fill, { width: `${((index + 1) / total) * 100}%` }]} />
    </View>
    <SwipeCard key={card.id} title={card.title} description={card.description} group={card.group} disabled={saving}
      onSwipe={value => answer(card.id, value)} />
    <View style={styles.choices}>
      {CHOICES.map(c => <View key={c.answer} style={styles.choice}>
        <Button label={c.label} accessibilityLabel={`${c.label} to ${card.title}`}
          variant={current(card.id) === c.answer ? 'primary' : 'secondary'}
          loading={saving && index === total - 1 && c.answer === 'yes'} disabled={saving} onPress={() => answer(card.id, c.answer)} />
      </View>)}
    </View>
    {failed && <>
      <Label accessibilityRole="alert" style={styles.warn}>Couldn’t save your answers. {SAVE_FAILED(total)}</Label>
      <Button label="Try again" variant="secondary" onPress={() => finish({ ...chosen })} />
    </>}
    <Label style={styles.caption}>You can change your answers any time from Settings.</Label>
  </Screen>;
}

// The card answers a swipe: right is Yes, left is No. The three buttons are the same answers for everyone else.
function SwipeCard({ title, description, group, disabled, onSwipe }: {
  title: string; description: string; group: string; disabled: boolean; onSwipe: (answer: Answer) => void;
}) {
  const start = useRef({ x: 0, y: 0 });
  return <View onTouchStart={e => { start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; }}
    onTouchEnd={e => {
      const value = swipeAnswer(e.nativeEvent.pageX - start.current.x, e.nativeEvent.pageY - start.current.y);
      if (value && !disabled) onSwipe(value);
    }} accessible accessibilityLabel={`${title}. ${description}`}
    accessibilityHint="Swipe right for Yes, left for No, or use the buttons below" style={styles.card}>
    <View style={styles.photo}><Label style={styles.group}>{group}</Label></View>
    <View style={styles.cardText}>
      <Label accessibilityRole="header" style={type.title2}>{title}</Label>
      <Label style={styles.caption}>{description}</Label>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  hero: { height: 220, borderRadius: radius.lg, backgroundColor: color.orangeSoft },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  navSpacer: { width: 64 },
  track: { height: 8, borderRadius: 4, backgroundColor: color.muted, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: color.primary },
  card: { borderRadius: radius.lg, backgroundColor: color.bg, borderWidth: 1, borderColor: color.line, overflow: 'hidden' },
  photo: { height: 220, backgroundColor: color.orangeSoft, justifyContent: 'flex-end', padding: space.md },
  group: { ...type.overline, color: color.orangeInk },
  cardText: { padding: space.md, gap: space.xs },
  choices: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  choice: { flexGrow: 1, flexBasis: 90 },
  caption: { ...type.caption, color: color.textSecondary },
  warn: { ...type.bodyStrong, color: color.orangeInk, backgroundColor: color.orangeSoft, padding: space.md, borderRadius: radius.sm },
});
