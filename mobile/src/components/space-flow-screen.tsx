import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoreHeader, core } from '@/components/core-flows';
import { Button } from '@/components/ui';
import { colors, type Scheme } from '@/theme/colors';
import type { SpaceKind } from '@/types';
import type { InvitePreview } from '@/api';

type ListedSpace = { id: string; name: string; role: 'admin' | 'member' };
type Props = {
  mode: 'create' | 'join'; scheme: Scheme; name: string; kind: SpaceKind; code: string;
  preview: InvitePreview | null; previewing: boolean; pending: boolean; error: string;
  spaces: ListedSpace[]; onName: (value: string) => void; onKind: (kind: SpaceKind) => void;
  onCode: (value: string) => void; onPreview: () => void; onSubmit: () => void;
  onMode: (mode: 'create' | 'join') => void; onSwitch: (id: string) => void; onBack: () => void;
};

const kinds: { id: SpaceKind; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'household', title: 'Household', icon: 'home-outline' },
  { id: 'dorm', title: 'Dorm', icon: 'business-outline' },
  { id: 'student_org', title: 'Student org', icon: 'people-outline' },
  { id: 'small_office', title: 'Small office', icon: 'briefcase-outline' },
];

export function SpaceFlowScreen(props: Props) {
  const [nameAttempted, setNameAttempted] = useState(false);
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null);
  const c = colors[props.scheme];
  const reduced = useReducedMotion();
  const create = props.mode === 'create';
  const validName = props.name.trim().length > 0;
  const nameError = create && nameAttempted && !validName;
  const compactCode = props.code.toUpperCase().replace(/[\s-]/g, '');
  const validCode = /^[A-HJ-NP-Z2-9]{8}$/.test(compactCode) || /^[A-Za-z0-9_-]{20,100}$/.test(props.code.trim());
  const invalidCode = !create && /expir|not found|no longer active/i.test(props.error);
  const expiredCode = invalidCode && /expir/i.test(props.error);
  const action = create ? 'Create Space' : props.preview ? `Join ${props.preview.name}` : 'Find Space';
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.background }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: 22 }}>
        <CoreHeader title={create ? 'New Space' : 'Join a Space'} variant={create ? 'new-space' : 'join-space'} scheme={props.scheme} onBack={props.onBack} />
        <Animated.View key={props.mode} entering={FadeIn.duration(reduced ? 80 : 170)} style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12, gap: 20 }}>
          {create ? <>
            <View style={{ flexDirection: 'row', minHeight: 58, borderBottomWidth: nameError ? 1.5 : 1, borderColor: nameError ? c.danger : c.border, alignItems: 'center', gap: 16 }}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>Space name</Text>
              <TextInput accessibilityLabel="Space name" value={props.name} onChangeText={props.onName} onBlur={() => setNameAttempted(true)} placeholder="Casa Lopez" placeholderTextColor={c.muted} maxLength={100} autoCapitalize="words" autoCorrect style={{ flex: 1, color: c.text, fontSize: 16, paddingVertical: 12, minHeight: 50 }} />
            </View>
            {nameError && <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -15 }}><Ionicons name="alert-circle-outline" size={14} color={c.danger} /><Text style={{ color: c.danger, fontSize: 12 }}>Give your Space a name to continue.</Text></View>}
            <View style={{ gap: 12 }}>
              <Text style={{ color: c.text, fontSize: 24, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }}>What kind of Space?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{kinds.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={option.title} accessibilityState={{ selected: props.kind === option.id }} onPress={() => props.onKind(option.id)} style={({ pressed }) => ({ flexBasis: '46%', flexGrow: 1, minHeight: 94, borderRadius: 19, borderWidth: 1.5, borderColor: props.kind === option.id ? core.plum : c.border, backgroundColor: props.kind === option.id ? core.plum : c.surface, alignItems: 'center', justifyContent: 'center', gap: 7, opacity: pressed ? .75 : 1 })}><Ionicons name={option.icon} size={23} color={props.kind === option.id ? core.cream : c.text} /><Text style={{ color: props.kind === option.id ? core.cream : c.text, fontSize: 15, fontWeight: '700' }}>{option.title}</Text></Pressable>)}</View>
            </View>
            <View style={{ padding: 15, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}><Text style={{ color: c.text, fontSize: 14, lineHeight: 21 }}><Text style={{ fontWeight: '700' }}>You will be the admin. </Text>You can invite members and manage this Space. An invite code is created when you save it.</Text></View>
          </> : <>
            <View style={{ gap: 9 }}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>Invite code</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Enter invite code" onPress={() => codeInput.current?.focus()} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 3, minHeight: 58 }}>
                {Array.from({ length: 8 }, (_, index) => <View key={index} style={{ flex: 1, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: invalidCode ? c.danger : c.border, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', marginRight: index === 3 ? 11 : 0 }}><Text style={{ color: c.text, fontSize: 21, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }}>{compactCode[index] ?? ''}</Text></View>)}
              </Pressable>
              <TextInput ref={codeInput} accessibilityLabel="Invite code, eight characters" value={props.code} onChangeText={value => props.onCode(value.replace(/[\s-]/g, '').toUpperCase().slice(0, 8))} maxLength={8} autoCapitalize="characters" autoCorrect={false} textContentType="oneTimeCode" autoComplete="one-time-code" returnKeyType="done" onSubmitEditing={validCode ? props.preview ? props.onSubmit : props.onPreview : undefined} style={{ height: 1, width: 1, opacity: 0, position: 'absolute', top: 38 }} />
              {invalidCode ? <><View accessibilityRole="alert" style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F3DCD8', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}><Ionicons name="alert-circle" size={13} color={c.danger} /><Text style={{ color: c.danger, fontSize: 12, fontWeight: '700' }}>{expiredCode ? 'This code has expired' : props.error.includes('active') ? 'This code was revoked' : 'Code not found'}</Text></View><View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ width: 44, height: 44, backgroundColor: core.plum, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="flame" size={23} color={core.cream} /></View><View style={{ flex: 1 }}><Text style={{ color: c.text, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }), fontSize: 20 }}>Ask for a new code</Text><Text style={{ color: c.muted, fontSize: 12 }}>Codes last 7 days. Ask a Space admin for a new one.</Text></View></View><Text style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>Check the code with a Space admin. An admin can revoke a code at any time.</Text></> : <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>Ask an admin to share the invite code for their Space.</Text>}
            </View>
            {props.previewing && <ActivityIndicator accessibilityLabel="Finding Space" color={core.plum} />}
            {props.preview && <Animated.View entering={FadeIn.duration(reduced ? 80 : 180)} style={{ gap: 12 }}>
              <View style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: props.scheme === 'light' ? '#DCEBDD' : '#536B54', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 }}><Ionicons name="checkmark" size={16} color={c.text} /><Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>Code found</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 17 }}><View style={{ width: 60, height: 60, backgroundColor: core.plum, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="flame" size={29} color={core.cream} /></View><View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 24, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) }} numberOfLines={2}>{props.preview.name}</Text><Text style={{ color: c.muted, fontSize: 13, marginTop: 3 }}>{kinds.find(option => option.id === props.preview?.kind)?.title} · {props.preview.memberCount} {props.preview.memberCount === 1 ? 'member' : 'members'}</Text><Text style={{ color: c.muted, fontSize: 13 }}>Invited by {props.preview.invitedBy}</Text></View></View>
              <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20 }}>You will join as a Member. You can see shared items and request returnables.</Text>
            </Animated.View>}
          </>}
          {props.error && (create || !invalidCode) ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 14, lineHeight: 20 }}>{props.error}</Text> : null}
          {!create && !validCode ? <Text style={{ color: c.muted, fontSize: 12 }}>Paste the complete code to continue.</Text> : null}
          {props.spaces.length > 0 && <View style={{ gap: 8, marginTop: 12 }}><Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>Your other Spaces</Text>{props.spaces.map(space => <Pressable key={space.id} accessibilityRole="button" accessibilityLabel={`Open ${space.name}`} onPress={() => props.onSwitch(space.id)} style={({ pressed }) => ({ minHeight: 50, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: 14, opacity: pressed ? .7 : 1 })}><Ionicons name="home-outline" size={19} color={c.text} /><Text numberOfLines={1} style={{ color: c.text, fontWeight: '700', marginLeft: 11, flex: 1 }}>{space.name}</Text><Ionicons name="chevron-forward" size={18} color={c.muted} /></Pressable>)}</View>}
        </Animated.View>
      </ScrollView>
      <View style={{ backgroundColor: c.background, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 11 }}>
        <Button label={invalidCode ? 'Try another code' : action} scheme={props.scheme} disabled={props.pending || props.previewing || (!create && !invalidCode && !validCode)} onPress={invalidCode ? () => props.onCode('') : create ? () => { setNameAttempted(true); if (validName) props.onSubmit(); } : props.preview ? props.onSubmit : props.onPreview} />
        <Pressable accessibilityRole="button" accessibilityLabel={create ? 'Join a Space instead' : 'Create a Space instead'} onPress={() => { setNameAttempted(false); props.onMode(create ? 'join' : 'create'); }} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.text, fontSize: 14 }}>{create ? 'Have a code? ' : 'No code? '}<Text style={{ fontWeight: '700', textDecorationLine: 'underline' }}>{create ? 'Join instead' : 'Create a Space instead'}</Text></Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
