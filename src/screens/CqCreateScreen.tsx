import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { useCqStore } from '../store/useCqStore';
import { exportQuestionPaper } from '../utils/exportPdf';
import MathText from '../components/MathText';
import { Question } from '../types';

const C = { ink: '#14213D', paper: '#F6F8FA', line: '#D5DCE4', accent: '#0F766E' };

export default function CqCreateScreen() {
  const { questions, createOrder, reorder, deselect, addUsage } = useCqStore();
  const [reordering, setReordering] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => createOrder.map((id) => questions.find((q) => q.id === id)).filter(Boolean) as Question[],
    [createOrder, questions],
  );

  const onExport = async () => {
    if (!selected.length) return Alert.alert('Nothing to export', 'Select questions from CQ Collection first.');
    try { setBusy(true); await exportQuestionPaper(selected);
      addUsage(selected.map((q) => q.id), `Exam ${new Date().toISOString().slice(0, 10)}`); }
    catch (e: any) { Alert.alert('Export failed', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const renderItem = ({ item, getIndex, drag, isActive }: RenderItemParams<Question>) => (
    <ScaleDecorator>
      <View style={[s.row, isActive && { borderColor: C.accent }]}>
        <Text style={s.no}>{String((getIndex() ?? 0) + 1).padStart(2, '0')}</Text>
        <View style={{ flex: 1 }}><MathText text={item.stimulus.text} size={14} /></View>
        {reordering
          ? <Pressable onLongPress={drag} onPressIn={drag} hitSlop={10}><Text style={s.handle}>≡</Text></Pressable>
          : <Pressable onPress={() => deselect(item.id)} hitSlop={10}><Text style={[s.handle, { color: '#B42318' }]}>x</Text></Pressable>}
      </View>
    </ScaleDecorator>
  );

  return (
    <View style={s.screen}>
      <View style={s.bar}>
        <Text style={s.count}>{String(selected.length).padStart(2, '0')} <Text style={s.sub}>questions</Text></Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => setReordering((v) => !v)}
            style={[s.btn, reordering && { backgroundColor: C.accent }]}>
            <Text style={[s.btnTxt, reordering && { color: '#fff' }]}>{reordering ? 'Done' : 'Δ Reorder'}</Text>
          </Pressable>
          <Pressable onPress={onExport} style={[s.btn, { backgroundColor: C.ink }]} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={[s.btnTxt, { color: '#fff' }]}>+ PDF</Text>}
          </Pressable>
        </View>
      </View>

      <DraggableFlatList
        data={selected}
        keyExtractor={(q) => q.id}
        onDragEnd={({ data }) => reorder(data.map((q) => q.id))}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        ListEmptyComponent={<Text style={s.empty}>No questions yet. Tap + on a question in CQ Collection to add it.</Text>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line },
  count: { fontSize: 26, fontWeight: '800', color: C.ink },
  sub: { fontSize: 13, fontWeight: '400' },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.ink, minWidth: 70, alignItems: 'center' },
  btnTxt: { fontWeight: '600', color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  no: { fontSize: 16, fontWeight: '700', color: C.ink },
  handle: { fontSize: 24, color: C.ink, paddingHorizontal: 6 },
  empty: { textAlign: 'center', color: '#52606D', marginTop: 60, paddingHorizontal: 30 },
});
