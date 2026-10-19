import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Question, SourceTag, SubQuestion } from '../types';
import { useCqStore } from '../store/useCqStore';

interface Props { visible: boolean; folderId?: string; initial?: Question; onClose: () => void }

const parseSources = (t: string): SourceTag[] =>
  t.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = x.match(/^(.*?)\s*(\d{4})?$/)!;
    return { board: m[1] || x, year: m[2] ? Number(m[2]) : undefined };
  });
const fmtSources = (s: SourceTag[]) => s.map((x) => `${x.board}${x.year ? ' ' + x.year : ''}`).join(', ');

export default function QuestionEditorModal({ visible, folderId, initial, onClose }: Props) {
  const { addQuestion, updateQuestion } = useCqStore();
  const [stim, setStim] = useState('');
  const [g, setG] = useState({ text: '', marks: '3', src: '' });
  const [h, setH] = useState({ text: '', marks: '4', src: '' });
  const [diff, setDiff] = useState(3);

  useEffect(() => {
    if (!visible) return;
    setStim(initial?.stimulus.text ?? '');
    setG({ text: initial?.gha.text ?? '', marks: String(initial?.gha.marks ?? 3), src: fmtSources(initial?.gha.sources ?? []) });
    setH({ text: initial?.ghe.text ?? '', marks: String(initial?.ghe.marks ?? 4), src: fmtSources(initial?.ghe.sources ?? []) });
    setDiff(initial?.difficulty ?? 3);
  }, [visible, initial]);

  const sub = (label: 'গ' | 'ঘ', v: typeof g, old?: SubQuestion): SubQuestion => ({
    label, text: v.text, marks: Number(v.marks) || 0, sources: parseSources(v.src),
    includeInCreate: old?.includeInCreate ?? true, answer: old?.answer });

  const save = () => {
    const base = { stimulus: { text: stim, images: initial?.stimulus.images ?? [] },
      gha: sub('গ', g, initial?.gha), ghe: sub('ঘ', h, initial?.ghe), difficulty: diff as Question['difficulty'] };
    if (initial) updateQuestion({ ...initial, ...base });
    else if (folderId) addQuestion({ ...base, folderId, usage: [] });
    onClose();
  };

  const Block = ({ title, v, set }: { title: string; v: typeof g; set: (x: typeof g) => void }) => (
    <View style={s.block}>
      <Text style={s.h}>{title}</Text>
      <TextInput style={[s.in, { minHeight: 70 }]} multiline value={v.text} onChangeText={(t) => set({ ...v, text: t })} placeholder="Question — use [\frac{a}{b}] for math" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[s.in, { width: 70 }]} keyboardType="number-pad" value={v.marks} onChangeText={(t) => set({ ...v, marks: t })} placeholder="Marks" />
        <TextInput style={[s.in, { flex: 1 }]} value={v.src} onChangeText={(t) => set({ ...v, src: t })} placeholder="Sources: ঢাকা বোর্ড 2023, ..." />
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.bar}>
        <Pressable onPress={onClose}><Text style={s.cancel}>Cancel</Text></Pressable>
        <Text style={s.h}>{initial ? 'Edit CQ' : 'New CQ'}</Text>
        <Pressable onPress={save}><Text style={s.ok}>Save</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={s.block}>
          <Text style={s.h}>মূল উদ্দীপক</Text>
          <TextInput style={[s.in, { minHeight: 90 }]} multiline value={stim} onChangeText={setStim} />
        </View>
        <Block title="(গ)" v={g} set={setG} />
        <Block title="(ঘ)" v={h} set={setH} />
        <View style={s.block}>
          <Text style={s.h}>Difficulty</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setDiff(n)}><Text style={{ fontSize: 30, color: '#D99A00' }}>{n <= diff ? '★' : '☆'}</Text></Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}
const s = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 50, borderBottomWidth: 1, borderBottomColor: '#D5DCE4' },
  block: { gap: 8 }, h: { fontSize: 16, fontWeight: '700', color: '#14213D' },
  in: { borderWidth: 1, borderColor: '#D5DCE4', borderRadius: 8, padding: 10, fontSize: 15, textAlignVertical: 'top' },
  cancel: { color: '#52606D', fontSize: 16 }, ok: { color: '#0F766E', fontSize: 16, fontWeight: '700' },
});
