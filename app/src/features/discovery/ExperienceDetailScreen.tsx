import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { AsyncView, Button, EmptyState, Notice, Screen, SkeletonList, Tag, Text, radius, space, useColors } from '@/shared/ui';
import { href } from '@/shared/lib/nav';
import { formatDateOnly } from '@/shared/lib/time';
import type { Experience } from '@/types/database';
import { AddToPickSection } from '@/features/picks/AddToPickSection';
import { categoryLabel } from './categories';
import { CategoryArt } from './CategoryArt';
import { BOOKING_NOTICE, durationLabel, priceKindWord, priceLabel, providerName } from './format';
import { useExperience } from './hooks';

/** P0-06: every fact about an experience, with no empty labels. Actions: Add to group pick (M4); Start a plan arrives in M5. */
export function ExperienceDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const query = useExperience(id);

  return (
    <Screen edges={[]}>
      <AsyncView
        query={query}
        errorMessage="Couldn't load this experience."
        skeleton={<SkeletonList rows={5} rowHeight={72} />}
        isEmpty={(e) => e === null || e.status === 'removed'}
        empty={
          <EmptyState
            title="This listing was removed"
            body="Plans you already made keep their details."
            actionLabel="Back to map"
            onAction={() => router.replace(href('/'))}
          />
        }
      >
        {(e) => <Detail e={e!} />}
      </AsyncView>
    </Screen>
  );
}

function Fact({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  const c = useColors();
  return (
    <View style={[styles.fact, { borderColor: c.border }]} accessible>
      <Text variant="small" muted style={{ fontWeight: '600' }}>{label}</Text>
      {typeof children === 'string' ? <Text>{children}</Text> : children}
      {note ? <Text variant="small" muted>{note}</Text> : null}
    </View>
  );
}

function Detail({ e }: { e: Experience }) {
  const c = useColors();
  const [linkError, setLinkError] = useState<string | null>(null);
  const provider = providerName(e.booking_url);

  async function openProvider() {
    setLinkError(null);
    try { await Linking.openURL(e.booking_url as string); }
    catch { setLinkError("Couldn't open the booking page. Check the link in the source and try again."); }
  }

  return (
    <>
      <Stack.Screen options={{ title: e.name }} />
      <CategoryArt category={e.category} height={170} width={undefined} rounded={radius.lg} showLabel />
      <View style={{ gap: space.sm }}>
        <Tag label={categoryLabel(e.category)} tone="info" />
        <Text variant="title" accessibilityRole="header">{e.name}</Text>
        <Text>{e.description}</Text>
      </View>

      <View style={{ gap: space.sm }}>
        <Fact label="Duration">{durationLabel(e.duration_min)}</Fact>
        <Fact label="Location" note={`Meet at: ${e.meeting_point}`}>{e.area}</Fact>
        <Fact
          label={`Price, ${priceKindWord(e).toLowerCase()}`}
          note={e.price_kind === 'estimated' ? 'Estimated. Actual cost may differ.' : e.price_kind === 'exact' ? 'Exact price, per the source.' : undefined}
        >
          {priceLabel(e)}
        </Fact>
        {e.timing_kind === 'fixed' && e.sessions?.length ? (
          <Fact label="Fixed sessions" note="Plans must use one of these sessions">
            <View style={styles.chips}>{e.sessions.map((s) => <Tag key={s.label} label={s.label} />)}</View>
          </Fact>
        ) : e.timing_kind === 'flexible' && e.hours_text ? (
          <Fact label="Flexible hours" note="Pick any time within these hours">{e.hours_text}</Fact>
        ) : (
          <Fact label="Hours">Hours unknown</Fact>
        )}
        <Fact label="Source">{`${e.source}. Checked on ${formatDateOnly(e.checked_on)}.`}</Fact>
      </View>

      <AddToPickSection experience={e} />

      {e.booking_required ? (
        <View style={[styles.booking, { backgroundColor: c.warnSoft }]}>
          <Text variant="bodyStrong" color={c.warn}>{BOOKING_NOTICE}</Text>
          {provider ? <Text variant="small" color={c.warn}>Each person books with {provider} on their site.</Text> : null}
          {linkError ? <Notice tone="error">{linkError}</Notice> : null}
          {e.booking_url ? <Button label={`Book with ${provider ?? 'the provider'}`} variant="secondary" onPress={openProvider} /> : null}
        </View>
      ) : (
        <Notice tone="success" title="No booking needed.">Just show up at the meeting point.</Notice>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fact: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: space.sm, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: 2 },
  booking: { padding: space.lg, borderRadius: radius.lg, gap: space.sm },
});
