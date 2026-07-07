/**
 * Admin – Schools management: list, add, edit, activate/deactivate,
 * per-school user + pair counts, cross-school pilot toggle.
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

interface AdminSchool {
  id: string;
  name: string;
  primary_domain: string;
  allowed_domains: string[];
  status: 'active' | 'pending' | 'inactive';
  cross_school_matching_enabled: boolean;
  user_count: number;
  active_pair_count: number;
}

export default function AdminSchoolsScreen() {
  const router = useRouter();
  const [schools, setSchools] = useState<AdminSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<AdminSchool> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_schools');
    if (error) showAlert('Error', error.message);
    else setSchools((data ?? []) as AdminSchool[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!editing?.name?.trim() || !editing?.primary_domain?.trim()) {
      showAlert('Missing fields', 'Name and primary domain are required.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('admin_upsert_school', {
      p_id: editing.id ?? null,
      p_name: editing.name.trim(),
      p_primary_domain: editing.primary_domain.trim().toLowerCase(),
      p_allowed_domains: editing.allowed_domains ?? [],
      p_status: editing.status ?? 'active',
      p_cross_school: editing.cross_school_matching_enabled ?? false,
    });
    setSaving(false);
    if (error) {
      showAlert('Could not save', error.message);
      return;
    }
    setEditing(null);
    load();
  }

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <View className="flex-row items-center justify-between px-5 py-3 border-b border-penn-border">
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text className="text-penn-accent text-base">← Back</Text>
        </TouchableOpacity>
        <Text className="text-penn-text font-bold text-base">Schools</Text>
        <TouchableOpacity
          onPress={() => setEditing({ status: 'active', allowed_domains: [] })}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text className="text-penn-accent text-sm">+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#7c6af7" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {editing ? (
            <View className="bg-penn-surface rounded-2xl p-4 mb-4 border border-penn-accent/40">
              <Text className="text-penn-text font-semibold mb-3">
                {editing.id ? 'Edit school' : 'Add school'}
              </Text>
              <TextInput
                className="bg-penn-card rounded-xl px-3 py-2.5 text-penn-text text-[14px] border border-penn-border mb-2"
                placeholder="Name (e.g. Pepperdine University)"
                placeholderTextColor="#6b6880"
                value={editing.name ?? ''}
                onChangeText={(t) => setEditing({ ...editing, name: t })}
              />
              <TextInput
                className="bg-penn-card rounded-xl px-3 py-2.5 text-penn-text text-[14px] border border-penn-border mb-2"
                placeholder="Primary domain (e.g. pepperdine.edu)"
                placeholderTextColor="#6b6880"
                autoCapitalize="none"
                value={editing.primary_domain ?? ''}
                onChangeText={(t) => setEditing({ ...editing, primary_domain: t })}
              />
              <TextInput
                className="bg-penn-card rounded-xl px-3 py-2.5 text-penn-text text-[14px] border border-penn-border mb-3"
                placeholder="Allowed domains, comma separated (optional)"
                placeholderTextColor="#6b6880"
                autoCapitalize="none"
                value={(editing.allowed_domains ?? []).join(', ')}
                onChangeText={(t) =>
                  setEditing({
                    ...editing,
                    allowed_domains: t.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
                  })
                }
              />
              <View className="flex-row gap-x-2 mb-3">
                {(['active', 'pending', 'inactive'] as const).map((st) => (
                  <TouchableOpacity
                    key={st}
                    onPress={() => setEditing({ ...editing, status: st })}
                    className={`px-3 py-1.5 rounded-lg border ${
                      editing.status === st ? 'bg-penn-accent border-penn-accent' : 'bg-penn-card border-penn-border'
                    }`}
                  >
                    <Text className={`text-xs ${editing.status === st ? 'text-white' : 'text-penn-muted'}`}>{st}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                className="flex-row items-center mb-4"
                onPress={() =>
                  setEditing({ ...editing, cross_school_matching_enabled: !editing.cross_school_matching_enabled })
                }
              >
                <Text className="text-penn-muted text-[13px]">
                  {editing.cross_school_matching_enabled ? '☑' : '☐'} Cross-school matching (pilot mode)
                </Text>
              </TouchableOpacity>
              <View className="flex-row gap-x-2">
                <TouchableOpacity
                  className="flex-1 bg-penn-accent rounded-xl py-3 items-center"
                  onPress={save}
                  disabled={saving}
                >
                  <Text className="text-white font-semibold text-[14px]">{saving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 bg-penn-border rounded-xl py-3 items-center"
                  onPress={() => setEditing(null)}
                >
                  <Text className="text-penn-text text-[14px]">Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {schools.length === 0 && !editing ? (
            <Text className="text-penn-muted text-center py-16">
              No schools yet. Schools are auto-created on signup while
              "allow unknown schools" is on, or add one manually.
            </Text>
          ) : null}

          {schools.map((school) => (
            <TouchableOpacity
              key={school.id}
              className="bg-penn-surface rounded-2xl p-4 mb-3"
              onPress={() => setEditing(school)}
              activeOpacity={0.8}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-penn-text text-[15px] font-semibold flex-1" numberOfLines={1}>
                  {school.name}
                </Text>
                <Text
                  className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                    school.status === 'active'
                      ? 'text-green-400 bg-green-900/40'
                      : school.status === 'pending'
                        ? 'text-orange-400 bg-orange-900/40'
                        : 'text-penn-muted bg-penn-card'
                  }`}
                >
                  {school.status}
                </Text>
              </View>
              <Text className="text-penn-muted text-[13px] mb-1">{school.primary_domain}</Text>
              {school.allowed_domains.length > 0 ? (
                <Text className="text-penn-muted text-[11px] mb-1">
                  Also: {school.allowed_domains.join(', ')}
                </Text>
              ) : null}
              <Text className="text-penn-muted text-xs">
                {school.user_count} students · {school.active_pair_count} active pairs
                {school.cross_school_matching_enabled ? ' · cross-school ON' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
