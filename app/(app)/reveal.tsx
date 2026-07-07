/**
 * Graduation reveal screen — countdown, opt-in, mutual reveal.
 *
 * States (from get_reveal_state):
 *   no cohort        → "reveal date not set yet"
 *   locked           → countdown to cohort reveal_opens_at
 *   unlocked         → opt-in flow (profile fields + optional message)
 *   one-sided        → waiting on partner (identity stays hidden)
 *   revealed         → partner profile
 *   blocked          → admin-disabled / report / block / banned
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { showAlert, showConfirm } from '@/lib/alerts';
import { track } from '@/lib/analytics';

interface RevealState {
  unlocked: boolean;
  block_reason: string | null;
  opens_at: string | null;
  closes_at: string | null;
  my_opt_in: boolean | null;
  partner_opt_in: boolean | null;
  partner_message: string | null;
  revealed: boolean;
  partner_profile: {
    display_name: string | null;
    major: string | null;
    contact_method: string | null;
    farewell_message: string | null;
    grad_year: number | null;
  } | null;
}

const BLOCK_COPY: Record<string, string> = {
  no_cohort: "Your school's reveal date hasn't been set yet. Check back later — we'll let you know.",
  cohort_disabled: 'Reveal is temporarily unavailable for your class.',
  not_open_yet: '', // countdown shown instead
  window_closed: 'The reveal window for your class has closed.',
  disabled_by_admin: 'Reveal is not available for this conversation.',
  unresolved_report: 'Reveal is paused while a report about this conversation is reviewed.',
  blocked: 'Reveal is not available for this conversation.',
  banned: 'Reveal is not available for this conversation.',
};

function countdown(opensAt: string): string {
  const ms = new Date(opensAt).getTime() - Date.now();
  if (ms <= 0) return 'any moment now';
  const days = Math.floor(ms / 86400000);
  if (days > 1) return `${days} days`;
  const hours = Math.floor(ms / 3600000);
  return hours > 1 ? `${hours} hours` : 'less than an hour';
}

export default function RevealScreen() {
  const router = useRouter();
  const { pairId } = useLocalSearchParams<{ pairId: string }>();
  const [state, setState] = useState<RevealState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Opt-in form
  const [displayName, setDisplayName] = useState('');
  const [major, setMajor] = useState('');
  const [contact, setContact] = useState('');
  const [farewell, setFarewell] = useState('');

  const load = useCallback(async () => {
    if (!pairId) return;
    const { data, error } = await supabase.rpc('get_reveal_state', { p_pair_id: pairId });
    if (!error && data) setState(data as RevealState);
    setLoading(false);
  }, [pairId]);

  useEffect(() => {
    track('reveal_viewed');
    load();
  }, [load]);

  async function submitOptIn(wants: boolean) {
    if (!pairId || submitting) return;

    if (wants) {
      // Save the reveal profile first (users may update these columns directly)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('users')
          .update({
            display_name: displayName.trim() || null,
            major: major.trim() || null,
            contact_method: contact.trim() || null,
            farewell_message: farewell.trim() || null,
          })
          .eq('id', user.id);
      }
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc('request_reveal', {
      p_pair_id: pairId,
      p_wants: wants,
      p_message: wants && farewell.trim() ? farewell.trim() : null,
    });
    setSubmitting(false);

    if (error) {
      showAlert(
        'Could not update reveal',
        /rate_limited/.test(error.message)
          ? 'Too many reveal changes today. Try again tomorrow.'
          : 'Something went wrong. Please try again.',
      );
      return;
    }
    track(wants ? 'reveal_opted_in' : 'reveal_declined');
    const next = data as RevealState;
    setState(next);
    if (next.revealed) track('reveal_completed');
  }

  function confirmOptIn() {
    showConfirm(
      'Reveal your identity?',
      'Reveal is mutual — nothing is shared until your Pal opts in too. Once you both reveal, it cannot be undone. Contact sharing stays optional either way. Please never pressure your Pal to reveal.',
      {
        confirmLabel: "I'm ready",
        onConfirm: () => submitOptIn(true),
      },
    );
  }

  if (loading || !state) {
    return (
      <SafeAreaView className="flex-1 bg-penn-bg items-center justify-center">
        <ActivityIndicator size="large" color="#7c6af7" />
      </SafeAreaView>
    );
  }

  const header = (
    <View className="flex-row items-center px-5 py-3 border-b border-penn-border">
      <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text className="text-penn-accent text-base">← Back</Text>
      </TouchableOpacity>
      <Text className="text-penn-text font-bold text-base ml-4">Graduation reveal</Text>
    </View>
  );

  // ── Revealed ─────────────────────────────────────────────────────────────
  if (state.revealed && state.partner_profile) {
    const p = state.partner_profile;
    return (
      <SafeAreaView className="flex-1 bg-penn-bg">
        {header}
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <Text className="text-5xl text-center mb-6">🎓</Text>
          <Text className="text-penn-text text-2xl font-bold text-center mb-2">
            Meet your Pal
          </Text>
          <Text className="text-penn-muted text-[14px] text-center leading-6 mb-8">
            You made it this far together.
          </Text>

          <View className="bg-penn-surface rounded-2xl p-5 mb-4">
            <Text className="text-penn-text text-xl font-bold mb-1">
              {p.display_name ?? 'Your Pal'}
            </Text>
            {p.grad_year ? (
              <Text className="text-penn-muted text-[13px] mb-3">Class of {p.grad_year}</Text>
            ) : null}
            {p.major ? (
              <View className="mb-3">
                <Text className="text-penn-muted text-xs uppercase tracking-wider mb-0.5">Major</Text>
                <Text className="text-penn-text text-[14px]">{p.major}</Text>
              </View>
            ) : null}
            {p.contact_method ? (
              <View className="mb-3">
                <Text className="text-penn-muted text-xs uppercase tracking-wider mb-0.5">Stay in touch</Text>
                <Text className="text-penn-text text-[14px]">{p.contact_method}</Text>
              </View>
            ) : (
              <Text className="text-penn-muted text-[13px] italic">
                They chose not to share contact info — and that's okay.
              </Text>
            )}
          </View>

          {p.farewell_message ? (
            <View className="bg-penn-card border border-penn-border rounded-2xl p-5 mb-6">
              <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">
                Their message to you
              </Text>
              <Text className="text-penn-text text-[15px] leading-6 italic">
                “{p.farewell_message}”
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            className="bg-penn-accent rounded-2xl py-4 items-center"
            onPress={() => router.back()}
          >
            <Text className="text-white font-semibold">Back to your conversation</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Blocked / no cohort / window closed ──────────────────────────────────
  if (state.block_reason && state.block_reason !== 'not_open_yet') {
    return (
      <SafeAreaView className="flex-1 bg-penn-bg">
        {header}
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-4xl mb-6">🔒</Text>
          <Text className="text-penn-text text-xl font-bold text-center mb-3">
            Reveal unavailable
          </Text>
          <Text className="text-penn-muted text-[14px] text-center leading-6 max-w-xs">
            {BLOCK_COPY[state.block_reason] ?? 'Reveal is not available right now.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Locked (countdown) ───────────────────────────────────────────────────
  if (!state.unlocked && state.opens_at) {
    return (
      <SafeAreaView className="flex-1 bg-penn-bg">
        {header}
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-4xl mb-6">⏳</Text>
          <Text className="text-penn-text text-xl font-bold text-center mb-3">
            Reveal unlocks in {countdown(state.opens_at)}
          </Text>
          <Text className="text-penn-muted text-[14px] text-center leading-6 max-w-xs">
            When your class's reveal date arrives, you and your Pal can choose
            to finally meet each other. Until then, keep being there for each
            other — anonymously.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Unlocked: opted in, waiting for partner ─────────────────────────────
  if (state.my_opt_in === true && !state.revealed) {
    return (
      <SafeAreaView className="flex-1 bg-penn-bg">
        {header}
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-4xl mb-6">💌</Text>
          <Text className="text-penn-text text-xl font-bold text-center mb-3">
            You're ready to reveal
          </Text>
          <Text className="text-penn-muted text-[14px] text-center leading-6 max-w-xs mb-8">
            {state.partner_opt_in === false
              ? 'Your Pal has chosen to stay anonymous for now. If they change their mind, you both reveal together. Please don’t pressure them — staying anonymous is always okay.'
              : "We've let your Pal know you're open to revealing. If they opt in too, you'll both see each other's profiles."}
          </Text>
          <TouchableOpacity
            className="rounded-2xl py-3 px-6 border border-penn-border"
            onPress={() => submitOptIn(false)}
            disabled={submitting}
          >
            <Text className="text-penn-muted text-[14px]">
              {submitting ? 'Updating…' : 'Change my mind — stay anonymous'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Unlocked: opt-in form ────────────────────────────────────────────────
  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      {header}
      <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
        <Text className="text-4xl text-center mb-4">🎓</Text>
        <Text className="text-penn-text text-2xl font-bold text-center mb-2">
          Ready to meet the person who's been rooting for you?
        </Text>
        <Text className="text-penn-muted text-[14px] text-center leading-6 mb-6">
          Reveal is optional and mutual — nothing is shared unless you both opt
          in. Once revealed, it can't be undone. You can always stay anonymous
          forever, and that's a beautiful ending too.
        </Text>

        {state.partner_opt_in === true ? (
          <View className="bg-penn-accent/15 border border-penn-accent/40 rounded-2xl px-4 py-3 mb-6">
            <Text className="text-penn-accent text-[13px] font-semibold mb-1">
              Your Pal is open to revealing
            </Text>
            {state.partner_message ? (
              <Text className="text-penn-muted text-[13px] italic">“{state.partner_message}”</Text>
            ) : null}
          </View>
        ) : null}

        <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">
          What your Pal will see (all optional)
        </Text>
        <TextInput
          className="bg-penn-surface rounded-xl px-4 py-3.5 text-penn-text text-[15px] border border-penn-border mb-3"
          placeholder="Your name (e.g. Sam, or Sam Rivera)"
          placeholderTextColor="#6b6880"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={60}
        />
        <TextInput
          className="bg-penn-surface rounded-xl px-4 py-3.5 text-penn-text text-[15px] border border-penn-border mb-3"
          placeholder="Your major (optional)"
          placeholderTextColor="#6b6880"
          value={major}
          onChangeText={setMajor}
          maxLength={80}
        />
        <TextInput
          className="bg-penn-surface rounded-xl px-4 py-3.5 text-penn-text text-[15px] border border-penn-border mb-3"
          placeholder="How to stay in touch (optional — IG, email…)"
          placeholderTextColor="#6b6880"
          value={contact}
          onChangeText={setContact}
          maxLength={200}
        />
        <TextInput
          className="bg-penn-surface rounded-xl px-4 py-3.5 text-penn-text text-[15px] border border-penn-border mb-6"
          placeholder="A farewell message for them (optional)"
          placeholderTextColor="#6b6880"
          value={farewell}
          onChangeText={setFarewell}
          multiline
          maxLength={500}
          style={{ minHeight: 90 }}
          textAlignVertical="top"
        />

        <View className="bg-penn-card border border-penn-border rounded-2xl px-4 py-3 mb-6">
          <Text className="text-penn-muted text-[12px] leading-4">
            Reveal is optional. Contact sharing is optional. Reveal cannot be
            undone. Never pressure your Pal to reveal — reports and blocks can
            prevent reveal entirely.
          </Text>
        </View>

        <TouchableOpacity
          className={`rounded-2xl py-4 items-center mb-3 ${submitting ? 'bg-penn-accent-muted' : 'bg-penn-accent'}`}
          onPress={confirmOptIn}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-base">I want to reveal</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          className="rounded-2xl py-4 items-center border border-penn-border"
          onPress={() => submitOptIn(false)}
          disabled={submitting}
        >
          <Text className="text-penn-muted text-[14px]">Stay anonymous</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
