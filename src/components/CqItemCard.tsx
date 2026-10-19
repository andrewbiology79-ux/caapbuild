import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import MathText from './MathText';
import { useCqStore } from '../store/useCqStore';
import { Question, SubQuestion } from '../types';

const C = { ink: '#14213D', paper: '#F6F8FA', line: '#D5DCE4', accent: '#0F766E', warn: '#B42318', star: '#D99A00' };

interface Props {
  question: Question;
  serial: number;                                   // auto SL No, supplied by the list index
  onOpenAnswer: (q: Question, which: 'gha' | 'ghe') => void; // opens the answer editor modal
  onEdit: (q: Question) => void;
  onDelete: (q: Question) => void;
}

export default function CqItemCard({ question: q, serial, onOpenAnswer, onEdit, onDelete }: Props) {
  const s = useCqStore();
  const selected = s.createOrder.includes(q.id);
  const [menu, setMenu] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

  const addImage = async () => {
    setMenu(false);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!r.canceled) s.addStimulusImage(q.id, { id: Date.now().toString(36), uri: r.assets[0].uri });
  };

  const menuItems: [string, () => void][] = [
    ['Edit', () => onEdit(q)],
    ['Copy', () => s.copy(q.id)],
    ['Cut', () => s.cut(q.id)],
    ['Paste After', () => s.paste(q.id, 'after')],
    ['Paste Before', () => s.paste(q.id, 'before')],
    ['Add image', addImage],
    ['Delete', () => onDelete(q)],
    ...(q.stimulus.images.length ? [['Remove last image', () => s.removeStimulusImage(q.id,
      q.stimulus.images[q.stimulus.images.length - 1].id)] as [string, () => void]] : []),
  ];

  const Sub = ({ sub, which }: { sub: SubQuestion; which: 'gha' | 'ghe' }) => (
    <View style={st.sub}>
      <Text style={st.label}>({sub.label})</Text>
      <View style={{ flex: 1 }}>
        <MathText text={sub.text} />
        <View style={st.tags}>
          {sub.sources.map((t, i) => (
            <Text key={i} style={st.tag}>{t.board}{t.year ? ` ${t.year}` : ''}</Text>
          ))}
          <Pressable onPress={() => onOpenAnswer(q, which)}><Text style={st.answerBtn}>Answer</Text></Pressable>
        </View>
      </View>
      <Pressable onPress={() => s.toggleSub(q.id, which)} hitSlop={8}
        style={[st.check, sub.includeInCreate && { backgroundColor: C.accent, borderColor: C.accent }]}>
        {sub.includeInCreate && <Text style={{ color: '#fff', fontWeight: '700' }}>✓</Text>}
      </Pressable>
    </View>
  );

  return (
    <View style={[st.card, selected && { borderColor: C.accent, borderWidth: 2 }]}>
      {/* Header */}
      <View style={st.header}>
        <Text style={st.sl}>{String(serial).padStart(2, '0')}</Text>
        <Pressable onPress={() => s.select(q.id)} style={[st.sq, { borderColor: C.accent }]}><Text style={{ color: C.accent }}>+</Text></Pressable>
        <Pressable onPress={() => s.deselect(q.id)} style={[st.sq, { borderColor: C.warn }]}><Text style={{ color: C.warn }}>x</Text></Pressable>
        <Pressable onPress={() => setUsageOpen((v) => !v)}>
          <Text style={st.usage}>Used {q.usage.length}×</Text>
        </Pressable>
        <Text style={{ color: C.star, flex: 1, textAlign: 'center' }}>
          {'★'.repeat(q.difficulty)}{'☆'.repeat(5 - q.difficulty)}
        </Text>
        <Pressable onPress={() => setMenu(true)} hitSlop={10}><Text style={{ fontSize: 22, color: C.ink }}>⋮</Text></Pressable>
      </View>
      {usageOpen && q.usage.map((u, i) => <Text key={i} style={st.usageRow}>{u.examName} · {u.date}</Text>)}

      {/* Stimulus */}
      <Text style={st.section}>মূল উদ্দীপক</Text>
      <MathText text={q.stimulus.text} />
      {q.stimulus.images.map((img) => (
        <Image key={img.id} source={{ uri: img.uri }} style={st.img} resizeMode="contain" />
      ))}

      {/* Sub-questions */}
      <Sub sub={q.gha} which="gha" />
      <Sub sub={q.ghe} which="ghe" />

      <Modal transparent visible={menu} animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={st.backdrop} onPress={() => setMenu(false)}>
          <View style={st.sheet}>
            {menuItems.map(([label, fn]) => (
              <Pressable key={label} style={st.item}
                onPress={() => { fn(); setMenu(false); }}
                disabled={label.startsWith('Paste') && !s.clipboard}>
                <Text style={[st.itemTxt, label.startsWith('Paste') && !s.clipboard && { opacity: 0.35 }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 12, marginHorizontal: 12, marginVertical: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sl: { fontSize: 18, fontWeight: '700', color: C.ink, minWidth: 28 },
  sq: { width: 28, height: 28, borderWidth: 1.5, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  usage: { fontSize: 12, color: C.accent, textDecorationLine: 'underline' },
  usageRow: { fontSize: 12, color: '#52606D', paddingLeft: 36 },
  section: { fontSize: 13, fontWeight: '700', color: C.ink, marginTop: 8, marginBottom: 2 },
  img: { width: '100%', height: 180, marginVertical: 6, backgroundColor: C.paper },
  sub: { flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line },
  label: { fontWeight: '700', color: C.ink, fontSize: 16 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  tag: { fontSize: 11, color: C.ink, backgroundColor: C.paper, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  answerBtn: { fontSize: 12, color: '#fff', backgroundColor: C.ink, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  check: { width: 26, height: 26, borderWidth: 2, borderColor: C.line, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingVertical: 8 },
  item: { paddingVertical: 14, paddingHorizontal: 20 },
  itemTxt: { fontSize: 16, color: C.ink },
});
