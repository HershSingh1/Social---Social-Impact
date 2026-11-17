import { useEffect, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button, Card, Label, Screen } from '../../ui';
import { color, minTap, radius, shadow, size, space, type } from '../../ui/theme';
import { CODE_LENGTH, cleanCode, JoinCodeError, joinErrorMessage, joinGroup, previewCode, type Preview } from './join';

type Props = { initialCode?: string; onBack: () => void; onJoined: (groupId: string) => void };

const messageFor = (error: unknown) => joinErrorMessage[error instanceof JoinCodeError ? error.code : 'unknown'];

// Figma 1.2 Join with Code (node 28:3048 in file MkYNxuYFuktTR0yGExJnK7), without the "Your name" field and "No
// account needed" copy: the name comes from the account (D1, F4). The group card has no member count or avatars
// because `preview_group_code` returns neither.
export function JoinScreen({ initialCode = '', onBack, onJoined }: Props) {
  const [code, setCode] = useState(cleanCode(initialCode));
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const checked = useRef<string>(undefined);

  async function check(value: string) {
    if (value.length < CODE_LENGTH || checked.current === value) return;
    checked.current = value;
    setChecking(true);
    try { setPreview(await previewCode(value)); setError(undefined); }
    catch (failure) { checked.current = undefined; setError(messageFor(failure)); }
    finally { setChecking(false); }
  }

  // A code from a link (sidequest://join/CODE) is previewed straight away. Opening a link never joins.
  // Started after mount rather than during the effect, so the effect never sets state itself.
  useEffect(() => { queueMicrotask(() => { void check(code); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function change(raw: string) {
    const next = cleanCode(raw);
    setCode(next);
    if (next !== checked.current) setPreview(undefined);
    void check(next);
  }

  const joinButton = <Button label={preview ? (preview.alreadyMember ? 'Open group' : `Join ${preview.groupName}`) : 'Join group'}
    disabled={!preview} errorMessage={messageFor}
    onPress={async () => {
      try { onJoined(await joinGroup(code)); }
      catch (failure) {
        if (!(failure instanceof JoinCodeError)) throw failure;
        setPreview(undefined);
        checked.current = undefined;
        setError(messageFor(failure));
      }
    }} />;

  return <Screen tinted footer={joinButton}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
      <Feather name="chevron-left" size={size.tabIcon} color={color.text} />
    </Pressable>
    <View style={styles.heading}>
      <Label accessibilityRole="header" style={type.title1}>Join a group</Label>
      <Label style={styles.secondary}>Enter the 6-character code a friend shared.</Label>
    </View>

    <View>
      {/* One real input laid over six boxes, so typing, paste and the screen reader all see a single field. */}
      <View style={styles.boxes}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => <View key={i} style={[styles.box, i === code.length && styles.boxActive]}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Label style={type.title1} maxFontSizeMultiplier={1.5}>{code[i] ?? ''}</Label>
        </View>)}
      </View>
      <TextInput value={code} onChangeText={change} accessibilityLabel="Group code"
        accessibilityHint={error ? `Error: ${error}` : '6 letters and numbers'}
        autoCapitalize="characters" autoCorrect={false} autoComplete="off" maxLength={CODE_LENGTH + 2}
        caretHidden style={styles.hiddenInput} autoFocus={!initialCode} />
    </View>
    {error && <Label accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Label>}
    {checking && <Label style={styles.secondary}>Checking the code…</Label>}

    {preview && <Card>
      <View style={styles.preview} accessible>
        <View style={styles.groupIcon} importantForAccessibility="no-hide-descendants">
          <Feather name="users" size={size.tabIcon} color={color.orangeInk} />
        </View>
        <View style={styles.groupText}>
          <Label style={type.headline}>{preview.groupName}</Label>
          <Label style={styles.caption}>Created by {preview.ownerName}</Label>
          {preview.alreadyMember && <Label style={styles.caption}>You’re already in this group.</Label>}
        </View>
      </View>
    </Card>}
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { gap: space.sm },
  secondary: { color: color.textSecondary },
  caption: { ...type.caption, color: color.textSecondary },
  boxes: { flexDirection: 'row', gap: space.sm },
  box: { flex: 1, minHeight: size.codeBox, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg,
    borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius.sm, boxShadow: [...shadow.card] },
  boxActive: { borderColor: color.primary, borderWidth: 2 },
  hiddenInput: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.02, color: 'transparent' },
  back: { minWidth: minTap, minHeight: minTap, justifyContent: 'center', alignSelf: 'flex-start' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  groupIcon: { width: size.avatar.md, height: size.avatar.md, borderRadius: radius.md, backgroundColor: color.orangeSoft,
    alignItems: 'center', justifyContent: 'center' },
  groupText: { flex: 1, gap: space.xxs },
});
