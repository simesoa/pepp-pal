/**
 * Admin – Cohorts / reveal dates: list cohorts with opt-in stats,
 * create/edit reveal windows, open reveal early for a test cohort.
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
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/lib/alerts';

interface AdminCohort {
  id: string;
  school_id: string;
  school_name: string;
  graduation_year: number;
  reveal_opens_at: string;
  reveal_closes_at: string | null;
  status: 'active' | 'disabled';
  member_count: number;
  opt_in_count: number;
  reveal_count: number;
}

interface SchoolOption { id: string; name: string }

export default function AdminCohortsScreen() {
  const router = useRouter();
  const [cohorts, setCohorts] = useState<AdminCohort[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ schoolId: '', year: '', opensAt: '', closesAt: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: cohortData, error }, { data: schoolData }] = await Promise.all([
      supabase.rpc('admin_list_cohorts'),
      supabase.rpc('admin_list_schools'),
    ]);
    if (error) showAlert('Error', error.message);
    else setCohorts((cohortData ?? []) as AdminCohort[]);
    setSchools(((schoolData ?? []) as { id: string; name: string }[]).map((s) => ({ id: s.id, name: s.name })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    const year = parseInt(form.year, 10);
    if (!form.schoolId || !year || !form.opensAt) {
      showAlert('Missing fields', 'School, graduation year, and open date are required.');
      return;
    }
    const opens = new Date(form.opensAt);
    if (isNaN(opens.getTime())) {
      showAlert('Invalid date', 'Use ISO format, e.g. 2027-05-15 or 2027-05-15T17:00:00Z');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('admin_upsert_cohort', {
      p_school_id: form.schoolId,
      p_graduation_year: year,
      p_opens_at: opens.toISOString(),
      p_closes_at: form.closesAt ? new Date(form.closesAt).toISOString() : null,
      p_status: 'active',
    });
    setSaving(false);
    if (error) {
      showAlert('Could not save', error.message);
      return;
    }
    setCreating(false);
    setForm({ schoolId: '', year: '', opensAt: '', closesAt: '' });
    load();
  }

  async function toggleStatus(cohort: AdminCohort) {
    const { error } = await supabase.rpc('admin_upsert_cohort', {
      p_school_id: cohort.school_id,
      p_graduation_year: cohort.graduation_year,
      p_opens_at: cohort.reveal_opens_at,
      p_closes_at: cohort.reveal_closes_at,
      p_status: cohort.status === 'active' ? 'disabled' : 'active',
    });
    if (error) showAlert('Error', error.message);
    else load();
  }

  async function openNow(cohort: AdminCohort) {
    const { error } = await supabase.rpc('admin_upsert_cohort', {
      p_school_id: cohort.school_id,
      p_graduation_year: cohort.graduation_year,
      p_opens_at: new Date().toISOString(),
      p_closes_at: cohort.reveal_closes_at,
      p_status: 'active',
    });
    if (error) showAlert('Error', error.message);
    else {
      showAlert('Reveal opened', 'Reveal is now unlocked for this cohort (test mode).');
      load();
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <View className="flex-row items-center justify-between px-5 py-3 border-b border-penn-border">
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text className="text-penn-accent text-base">← Back</Text>
        </TouchableOpacity>
        <Text className="text-penn-text font-bold text-base">Cohorts & Reveal</Text>
        <TouchableOpacity onPress={() => setCreating(!creating)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text className="text-penn-accent text-sm">{creating ? 'Close' : '+ Add'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#7c6af7" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {creating ? (
            <View className="bg-penn-surface rounded-2xl p-4 mb-4 border border-penn-accent/40">
              <Text className="text-penn-text font-semibold mb-3">New / update cohort</Text>
              <Text className="text-penn-muted text-xs mb-1">School</Text>
              <View className="flex-row flex-wrap gap-1.5 mb-3">
                {schools.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => setForm({ ...form, schoolId: s.id })}
                    className={`px-2.5 py-1.5 rounded-lg border ${
                      form.schoolId === s.id ? 'bg-penn-accent border-penn-accent' : 'bg-penn-card border-penn-border'
                    }`}
                  >
                    <Text className={`text-xs ${form.schoolId === s.id ? 'text-white' : 'text-penn-muted'}`}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                className="bg-penn-card rounded-xl px-3 py-2.5 text-penn-text text-[14px] border border-penn-border mb-2"
                placeholder="Graduation year (e.g. 2027)"
                placeholderTextColor="#6b6880"
                keyboardType="numeric"
                value={form.year}
                onChangeText={(t) => setForm({ ...form, year: t })}
              />
              <TextInput
                className="bg-penn-card rounded-xl px-3 py-2.5 text-penn-text text-[14px] border border-penn-border mb-2"
                placeholder="Reveal opens (e.g. 2027-05-15)"
                placeholderTextColor="#6b6880"
                autoCapitalize="none"
                value={form.opensAt}
                onChangeText={(t) => setForm({ ...form, opensAt: t })}
              />
              <TextInput
                className="bg-penn-card rounded-xl px-3 py-2.5 text-penn-text text-[14px] border border-penn-border mb-3"
                placeholder="Reveal closes (optional)"
                placeholderTextColor="#6b6880"
                autoCapitalize="none"
                value={form.closesAt}
                onChangeText={(t) => setForm({ ...form, closesAt: t })}
              />
              <TouchableOpacity
                className="bg-penn-accent rounded-xl py-3 items-center"
                onPress={save}
                disabled={saving}
              >
                <Text className="text-white font-semibold text-[14px]">{saving ? 'Saving…' : 'Save cohort'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {cohorts.length === 0 && !creating ? (
            <Text className="text-penn-muted text-center py-16">
              No cohorts yet. Reveal stays locked until a cohort with a reveal
              date exists for a school + graduation year.
            </Text>
          ) : null}

          {cohorts.map((c) => {
            const opens = new Date(c.reveal_opens_at);
            const isOpen = opens.getTime() <= Date.now() && c.status === 'active';
            return (
              <View key={c.id} className="bg-penn-surface rounded-2xl p-4 mb-3">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-penn-text text-[15px] font-semibold flex-1" numberOfLines={1}>
                    {c.school_name} · Class of {c.graduation_year}
                  </Text>
                  <Text
                    className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                      c.status === 'disabled'
                        ? 'text-red-400 bg-red-900/40'
                        : isOpen
                          ? 'text-green-400 bg-green-900/40'
                          : 'text-orange-400 bg-orange-900/40'
                    }`}
                  >
                    {c.status === 'disabled' ? 'disabled' : isOpen ? 'open' : 'locked'}
                  </Text>
                </View>
                <Text className="text-penn-muted text-[13px] mb-1">
                  Opens {opens.toLocaleDateString()}
                  {c.reveal_closes_at ? ` · closes ${new Date(c.reveal_closes_at).toLocaleDateString()}` : ''}
                </Text>
                <Text className="text-penn-muted text-xs mb-3">
                  {c.member_count} students · {c.opt_in_count} opted in · {c.reveal_count} revealed
                </Text>
                <View className="flex-row gap-x-2">
                  {!isOpen && c.status === 'active' ? (
                    <TouchableOpacity
                      className="bg-penn-accent/20 border border-penn-accent/40 rounded-lg px-3 py-1.5"
                      onPress={() => openNow(c)}
                    >
                      <Text className="text-penn-accent text-xs font-semibold">Open now (test)</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    className="bg-penn-card border border-penn-border rounded-lg px-3 py-1.5"
                    onPress={() => toggleStatus(c)}
                  >
                    <Text className="text-penn-muted text-xs font-semibold">
                      {c.status === 'active' ? 'Disable' : 'Enable'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
