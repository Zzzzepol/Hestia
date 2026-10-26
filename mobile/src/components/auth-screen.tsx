import Ionicons from '@expo/vector-icons/Ionicons';
import { Host, TextInput as ExpoTextInput } from '@expo/ui';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

const plum = '#3F2B42';
const cream = '#F3E8E2';
const muted = '#6D5870';
const line = '#A795A5';
const gold = '#D8942F';
const passwordScore = (value: string) => !value ? 0 : value.length < 6 ? 1 : Math.min(4, 1 + Number(value.length >= 10) + Number(/[a-z]/.test(value) && /[A-Z]/.test(value)) + Number(/\d|[^A-Za-z]/.test(value)));

type Mode = 'signIn' | 'register' | 'forgot' | 'recovery';
type Props = {
  email: string;
  password: string;
  displayName: string;
  error: string;
  notice: string;
  pending: boolean;
  recovery: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onClearMessages: () => void;
  onSignIn: () => void;
  onRegister: () => void;
  onResendConfirmation: () => void;
  onRequestReset: () => void;
  onUpdatePassword: () => void;
  onCancelRecovery: () => void;
};

function IosPasswordInput({ label, value, revealed, autoComplete, onChangeText, onFocus, onBlur, onSubmitEditing, returnKeyType }: {
  label: string;
  value: string;
  revealed: boolean;
  autoComplete: 'current-password' | 'new-password';
  onChangeText: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSubmitEditing: () => void;
  returnKeyType: 'done' | 'next';
}) {
  return <Host accessibilityLabel={label} style={{ flex: 1, minWidth: 0, height: 58 }}>
    <ExpoTextInput
      defaultValue={value}
      placeholder={label}
      placeholderTextColor={muted}
      selectionColor={plum}
      style={{ width: '100%', height: 58, paddingVertical: 10 }}
      textStyle={{ color: plum, fontSize: 17, fontWeight: '500' }}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={autoComplete}
      secureTextEntry={!revealed}
      returnKeyType={returnKeyType}
      onChangeText={onChangeText}
      onFocus={onFocus}
      onBlur={onBlur}
      onSubmitEditing={onSubmitEditing}
    />
  </Host>;
}

function Artwork({ mode, height, topInset }: { mode: Mode; height: number; topInset: number }) {
  const isSignIn = mode === 'signIn';
  return <Svg width="100%" height={height} viewBox="0 0 390 340" preserveAspectRatio="none">
    <Rect width="390" height="340" fill={plum} />
    {isSignIn ? <>
      <Circle cx="390" cy="25" r="110" fill="#5A435D" />
      <Circle cx="33" cy="218" r="68" fill="#302036" />
      <Ellipse cx="62" cy="70" rx="13" ry="11" fill="#302036" />
      <Path d="M0 110 C105 64 207 119 301 106 C343 101 364 99 390 90" fill="none" stroke={gold} strokeWidth="1.7" />
      <Path d="M235 340 L235 202 C235 161 267 122 311 115 C354 107 386 145 386 190 L386 340" fill="none" stroke={gold} strokeWidth="1.8" />
      <Ellipse cx="331" cy="216" rx="24" ry="18" fill="#5A435D" />
    </> : <>
      <Circle cx="0" cy="48" r="84" fill="#5A435D" />
      <Ellipse cx="222" cy="77" rx="15" ry="12" fill="#302036" />
      <Circle cx="349" cy="225" r="74" fill="#302036" />
      <Ellipse cx="83" cy="208" rx="18" ry="13" fill="#5A435D" />
      <Path d="M0 89 C88 54 181 79 276 84 C328 87 360 79 390 68" fill="none" stroke={gold} strokeWidth="1.7" />
      <Circle cx="329" cy="340" r="147" fill="none" stroke={gold} strokeWidth="1.8" />
      <Circle cx="329" cy="340" r="102" fill="none" stroke={gold} strokeWidth="1.8" />
      <Circle cx="329" cy="340" r="58" fill="none" stroke={gold} strokeWidth="1.8" />
    </>}
    <Path d="M0 313 C55 284 118 283 177 309 C249 346 319 349 390 309 L390 340 L0 340 Z" fill={cream} />
    <G transform={`translate(0 ${Math.min(42, Math.max(0, topInset - 8))})`}>
      <Path d="M342 41 C345 48 353 51 353 61 C353 70 347 74 343 75 C346 67 342 62 339 58 C333 64 330 70 333 75 C325 72 320 66 320 58 C320 52 324 46 329 45 C331 36 336 31 339 27 C341 31 343 36 342 41 Z" fill={cream} />
      <Path d="M339 55 C342 59 346 63 345 68 C344 72 341 74 338 74 C333 74 331 71 332 67 C332 64 336 58 339 55 Z" fill={gold} stroke={plum} strokeWidth="1.5" />
    </G>
    <Path d="M30 269 V257 H42 V264 H36 V261 M46 269 V257 H58 V264 H52 V261 M62 269 V257 H74 V264 H68 V261 M78 269 V257 H90 V264 H84 V261" fill="none" stroke={gold} strokeWidth="1.9" strokeLinejoin="miter" />
  </Svg>;
}

export function AuthScreen(props: Props) {
  const [localMode, setLocalMode] = useState<Exclude<Mode, 'recovery'>>('signIn');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [validation, setValidation] = useState('');
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const mode: Mode = props.recovery ? 'recovery' : localMode;
  const heroHeight = Math.max(310, Math.min(365, Math.min(width, 430) * .87));
  const heading = mode === 'signIn' ? 'Welcome\nback' : mode === 'register' ? 'Create\naccount' : mode === 'forgot' ? 'Reset\npassword' : 'New\npassword';
  const submit = mode === 'signIn' ? props.onSignIn : mode === 'register' ? props.onRegister : mode === 'forgot' ? props.onRequestReset : props.onUpdatePassword;
  const strength = passwordScore(props.password);
  const attemptSubmit = () => {
    if (mode === 'register' && !props.displayName.trim()) return setValidation('Enter your name.');
    if (mode !== 'recovery' && !props.email.trim()) return setValidation('Enter your email.');
    if (mode !== 'forgot' && !props.password) return setValidation('Enter your password.');
    if (mode === 'register' && props.password.length < 6) return setValidation('Use at least 6 characters for your password.');
    if (mode === 'register' && !confirmPassword) return setValidation('Confirm your password.');
    if (mode === 'register' && confirmPassword !== props.password) return setValidation('Passwords do not match.');
    if (mode === 'recovery' && props.password.length < 6) return setValidation('Use at least 6 characters for your new password.');
    setValidation('');
    submit();
  };
  const changeMode = (next: Exclude<Mode, 'recovery'>) => {
    Keyboard.dismiss();
    props.onEmailChange('');
    props.onPasswordChange('');
    props.onNameChange('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFocused(null);
    setValidation('');
    props.onClearMessages();
    setLocalMode(next);
  };

  const field = (kind: 'name' | 'email' | 'password' | 'confirm') => {
    const isPassword = kind === 'password' || kind === 'confirm';
    const revealed = kind === 'confirm' ? showConfirmPassword : showPassword;
    const value = kind === 'name' ? props.displayName : kind === 'email' ? props.email : kind === 'confirm' ? confirmPassword : props.password;
    const onChangeText = kind === 'name' ? props.onNameChange : kind === 'email' ? props.onEmailChange : kind === 'confirm' ? setConfirmPassword : props.onPasswordChange;
    const placeholder = kind === 'name' ? 'Name' : kind === 'email' ? mode === 'signIn' ? 'you@home.com' : 'Email' : kind === 'confirm' ? 'Confirm password' : 'Password';
    const icon = kind === 'name' ? 'person-outline' : kind === 'email' ? 'mail-outline' : 'lock-closed-outline';
    return <View key={`${mode}-${kind}`} style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', borderBottomWidth: focused === kind ? 2 : 1.4, borderBottomColor: focused === kind ? plum : line }}>
      <Ionicons name={icon} size={22} color={plum} style={{ marginRight: 17 }} />
      {Platform.OS === 'ios' && isPassword ? <IosPasswordInput
        label={kind === 'confirm' ? 'Confirm password' : mode === 'recovery' ? 'New password' : 'Password'}
        value={value}
        revealed={revealed}
        autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
        onChangeText={text => { setValidation(''); onChangeText(text); }}
        onFocus={() => setFocused(kind)}
        onBlur={() => setFocused(null)}
        returnKeyType={kind === 'confirm' || mode === 'signIn' || mode === 'recovery' ? 'done' : 'next'}
        onSubmitEditing={() => (kind === 'confirm' || mode === 'signIn' || mode === 'recovery') ? attemptSubmit() : undefined}
      /> : <TextInput
        accessibilityLabel={kind === 'name' ? 'Name' : kind === 'email' ? 'Email' : kind === 'confirm' ? 'Confirm password' : mode === 'recovery' ? 'New password' : 'Password'}
        value={value}
        onChangeText={text => { setValidation(''); onChangeText(text); }}
        onFocus={() => setFocused(kind)}
        onBlur={() => setFocused(null)}
        placeholder={placeholder}
        placeholderTextColor={muted}
        selectionColor={plum}
        style={{ flex: 1, minWidth: 0, minHeight: 58, color: plum, fontSize: 17, fontWeight: '500', paddingVertical: 10 }}
        keyboardType={kind === 'email' ? 'email-address' : 'default'}
        autoCapitalize={kind === 'email' || isPassword ? 'none' : 'words'}
        autoCorrect={kind === 'name'}
        textContentType={kind === 'name' ? 'name' : kind === 'email' ? 'emailAddress' : mode === 'signIn' ? 'password' : 'newPassword'}
        secureTextEntry={isPassword ? !revealed : false}
        returnKeyType={kind === 'confirm' || mode === 'signIn' || mode === 'recovery' || mode === 'forgot' ? 'done' : 'next'}
        onSubmitEditing={() => (kind === 'confirm' || mode === 'signIn' || mode === 'recovery' || mode === 'forgot') ? attemptSubmit() : undefined}
      />}
      {isPassword && <Pressable accessibilityRole="button" accessibilityLabel={`${revealed ? 'Hide' : 'Show'} ${kind === 'confirm' ? 'confirmation' : 'password'}`} accessibilityState={{ selected: revealed }} onPress={() => kind === 'confirm' ? setShowConfirmPassword(value => !value) : setShowPassword(value => !value)} hitSlop={8} style={{ width: 44, height: 48, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={23} color={plum} /></Pressable>}
    </View>;
  };

  const action = (label: string, onPress: () => void, primary: boolean, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 55, borderRadius: 17, backgroundColor: primary ? plum : cream, borderWidth: primary ? 0 : 1.5, borderColor: line, alignItems: 'center', justifyContent: 'center', opacity: disabled ? .52 : pressed ? .82 : 1, transform: [{ scale: pressed && !disabled ? .985 : 1 }] })}><Text style={{ color: primary ? cream : plum, fontSize: 18, fontWeight: '700', letterSpacing: -.3 }}>{label}</Text></Pressable>;

  return <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#211B23' : cream, alignItems: 'center' }}>
    <StatusBar style="light" />
    <KeyboardAvoidingView style={{ flex: 1, width: '100%', maxWidth: 430, backgroundColor: cream }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View key={mode} entering={FadeIn.duration(reducedMotion ? 90 : 150)} style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(28, insets.bottom + 16) }} style={{ backgroundColor: cream }}>
        <View style={{ height: heroHeight, backgroundColor: plum }}>
          <Artwork mode={mode} height={heroHeight} topInset={insets.top} />
          <Text accessibilityRole="header" style={{ position: 'absolute', left: 29, bottom: 92, color: cream, fontSize: 46, lineHeight: 45, fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }), letterSpacing: -1.6 }}>{heading}</Text>
        </View>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 29, paddingTop: 18, gap: 0 }}>
          {mode === 'register' && field('name')}
          {mode !== 'recovery' && field('email')}
          {mode !== 'forgot' && field('password')}
          {mode === 'register' && <View accessibilityLabel={`Password strength: ${['Enter a password', 'Weak', 'Fair', 'Good', 'Strong'][strength]}`} style={{ marginTop: 12, marginBottom: 2 }}><View style={{ flexDirection: 'row', gap: 5 }}>{[1, 2, 3, 4].map(level => <View key={level} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: strength >= level ? strength <= 1 ? '#9D5261' : strength === 2 ? '#AE7134' : strength === 3 ? '#6E7661' : '#3F705C' : '#D6C8CE' }} />)}</View><Text style={{ color: muted, fontSize: 12, marginTop: 6 }}>{strength ? `${['', 'Weak', 'Fair', 'Good', 'Strong'][strength]} password · use 10+ characters with mixed case and a number or symbol` : 'Password strength · use 10+ characters with mixed case and a number or symbol'}</Text></View>}
          {mode === 'register' && field('confirm')}
          {mode === 'signIn' && <Pressable accessibilityRole="button" onPress={() => changeMode('forgot')} style={{ alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' }}><Text style={{ color: plum, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>Forgot password?</Text></Pressable>}
          {mode === 'register' && <Text style={{ color: muted, fontSize: 13, lineHeight: 19, marginTop: 16, marginBottom: 20 }}>By continuing you agree to the Terms and Privacy Policy.</Text>}
          {mode === 'forgot' && <Text style={{ color: muted, fontSize: 14, lineHeight: 21, marginTop: 17, marginBottom: 20 }}>Enter your email and we’ll send you a password reset link.</Text>}
          {mode === 'recovery' && <Text style={{ color: muted, fontSize: 14, lineHeight: 21, marginTop: 17, marginBottom: 20 }}>Choose a password with at least 6 characters.</Text>}
          {!!props.error && <Text accessibilityRole="alert" style={{ color: '#8B354C', fontSize: 14, lineHeight: 20, marginBottom: 12 }}>{props.error}</Text>}
          {!!validation && <Text accessibilityRole="alert" style={{ color: '#8B354C', fontSize: 14, lineHeight: 20, marginBottom: 12 }}>{validation}</Text>}
          {!!props.notice && <Text accessibilityRole="alert" style={{ color: plum, fontSize: 14, lineHeight: 20, marginBottom: 12 }}>{props.notice}</Text>}
          {action(mode === 'signIn' ? 'Log in' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Save password', attemptSubmit, true, props.pending)}
          {mode === 'signIn' || mode === 'register' ? <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 }}><View style={{ flex: 1, height: 1, backgroundColor: '#C9B9C4' }} /><Text style={{ color: muted, fontSize: 14 }}>or</Text><View style={{ flex: 1, height: 1, backgroundColor: '#C9B9C4' }} /></View>
            {action(mode === 'signIn' ? 'Create account' : 'Log in', () => changeMode(mode === 'signIn' ? 'register' : 'signIn'), false)}
            {(props.notice.toLowerCase().includes('confirm') || props.error.toLowerCase().includes('confirm')) && <Pressable accessibilityRole="button" onPress={props.onResendConfirmation} disabled={props.pending || !props.email.trim()} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 10 }}><Text style={{ color: plum, fontSize: 14, textDecorationLine: 'underline' }}>Resend confirmation email</Text></Pressable>}
          </> : <View style={{ marginTop: 18 }}>{action('Back to log in', mode === 'recovery' ? props.onCancelRecovery : () => changeMode('signIn'), false)}</View>}
        </View>
      </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  </View>;
}
