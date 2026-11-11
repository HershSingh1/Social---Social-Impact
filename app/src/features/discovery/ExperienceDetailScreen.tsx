import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, ErrorState, Label, Loading, Tag } from '@/ui';
import { color, inset, minTap, radius, shadow, space, type } from '@/ui/theme';
import { supabase } from '@/lib/supabase';
import { BookingNotice } from './BookingNotice';
import {
  type Experience, formatCheckedOn, formatDuration, formatLocation, formatPrice, formatTiming, sourceUrl,
} from './experience';

const selection = 'id,name,category,description,area,image_url,address,provider_name,price_kind,price_min,price_max,timing_kind,sessions,hours_text,duration_min,meeting_point,booking_required,booking_url,source,checked_on,status';

async function loadExperience(id: string) {
  const { data, error } = await supabase.from('experiences').select(selection).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Experience | null;
}

function InfoRow({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return <View style={styles.infoRow}>
    <View style={styles.iconTile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text maxFontSizeMultiplier={1} style={styles.icon}>{icon}</Text>
    </View>
    <View style={styles.infoText}><Label style={type.subhead}>{title}</Label><Label style={type.caption}>{detail}</Label></View>
  </View>;
}

function BackButton() {
  return <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backHit}>
    <View style={styles.backCircle}><Label style={type.title2}>‹</Label></View>
  </Pressable>;
}

export function ExperienceDetail({ experience }: { experience: Experience }) {
  const [imageFailed, setImageFailed] = useState(false);
  const price = formatPrice(experience);
  const timing = formatTiming(experience);
  const url = sourceUrl(experience.source);
  const location = formatLocation(experience);
  const meetingPoint = experience.meeting_point?.trim() || experience.address?.trim() || 'Meeting point shared by provider';

  if (experience.status !== 'published') return <View style={styles.removed}>
    <BackButton /><Label accessibilityRole="header" style={type.title1}>This listing was removed</Label>
    <Label>Existing plans still keep the activity details that were originally sent.</Label>
  </View>;

  return <View style={styles.flex}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        {experience.image_url && !imageFailed
          ? <Image source={{ uri: experience.image_url }} resizeMode="cover" style={styles.heroImage}
            accessibilityLabel={`${experience.name} photo`} onError={() => setImageFailed(true)} />
          : <View style={styles.heroPlaceholder} accessible accessibilityRole="image"
            accessibilityLabel={`${experience.category} placeholder image`}>
            <Label style={type.title1}>{experience.category}</Label>
          </View>}
        <BackButton />
      </View>

      <View style={styles.body}>
        <View style={styles.tags}><Tag label={experience.category} /><Tag label={experience.price_kind === 'estimated' ? 'Estimated' : price} variant="outline" /></View>
        <Label accessibilityRole="header" style={type.title1}>{experience.name}</Label>
        <InfoRow icon="◷" title={timing.label} detail={timing.detail} />
        {timing.sessions.length > 0 && <View style={styles.tags}>{timing.sessions.map(session => <Tag key={session} label={session} />)}</View>}
        <InfoRow icon="⌖" title={location} detail={`Meeting point: ${meetingPoint}`} />
        <InfoRow icon="$" title={price} detail={`Duration: ${formatDuration(experience.duration_min)}`} />

        <Card><Label style={type.headline}>About</Label><Label>{experience.description.trim() || 'Description being checked.'}</Label></Card>
        <BookingNotice required={experience.booking_required} providerName={experience.provider_name}
          url={experience.booking_url || url} />
        <Card>
          <Label style={type.headline}>Source</Label>
          <Label>{experience.provider_name || 'Source listing'}</Label>
          <Label style={type.caption}>{formatCheckedOn(experience.checked_on)}</Label>
          {url && <View style={styles.inlineButton}><Button label="View source" variant="text" size="small"
            onPress={async () => { await Linking.openURL(url); }} /></View>}
        </Card>
      </View>
    </ScrollView>

    <View style={styles.footer}>
      <View style={styles.action}><Button label="Add to group pick" variant="secondary"
        onPress={() => router.push({ pathname: '/pick/new', params: { experienceId: experience.id } } as Href)} /></View>
      <View style={styles.action}><Button label="Start a plan"
        onPress={() => router.push({ pathname: '/plan/new', params: { experienceId: experience.id } } as Href)} /></View>
    </View>
  </View>;
}

export default function ExperienceDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const query = useQuery({ queryKey: ['experience', id], enabled: Boolean(id), queryFn: () => loadExperience(id!) });
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    {!id ? <ErrorState message="This activity link is incomplete." onRetry={() => router.back()} />
      : query.isLoading ? <Loading label="Loading activity…" />
        : query.error ? <ErrorState message="Couldn’t load this activity." onRetry={async () => { await query.refetch(); }} />
          : query.data ? <ExperienceDetail experience={query.data} />
            : <View style={styles.removed}><BackButton /><Label accessibilityRole="header" style={type.title1}>This listing was removed</Label></View>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingBottom: space.xl }, hero: { height: 210, backgroundColor: color.muted },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: inset.screen, backgroundColor: color.orangeSoft },
  backHit: { position: 'absolute', top: space.md, left: space.lg, minWidth: minTap, minHeight: minTap, justifyContent: 'center' },
  backCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', boxShadow: [...shadow.card] },
  body: { paddingHorizontal: inset.screen, paddingTop: space.md, gap: space.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  infoRow: { minHeight: minTap, flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconTile: { width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: color.orange, backgroundColor: color.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  icon: { ...type.headline, color: color.text }, infoText: { flex: 1, gap: space.xxs },
  inlineButton: { alignSelf: 'flex-start' },
  footer: { flexDirection: 'row', gap: space.sm, paddingHorizontal: inset.screen, paddingTop: space.md, borderTopWidth: 1, borderColor: color.line, backgroundColor: color.bg },
  action: { flex: 1 },
  removed: { flex: 1, paddingHorizontal: inset.screen, paddingTop: 80, gap: space.lg, backgroundColor: color.surface },
});
