import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

interface Props { visible: boolean; title: string; initial?: string; onSubmit: (v: string) => void; onCancel: () => void }

export default function TextPrompt({ visible, title, initial = '', onSubmit, onCancel }: Props) {
  const [v, setV] = useState(initial);
  useEffect(() => { if (visible) setV(initial); }, [visible, initial]);
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={s.back}>
        <View style={s.box}>
          <Text style={s.title}>{title}</Text>
          <TextInput value={v} onChangeText={setV} autoFocus style={s.input} />
          <View style={s.row}>
            <Pressable onPress={onCancel}><Text style={s.cancel}>Cancel</Text></Pressable>
            <Pressable onPress={() => v.trim() && onSubmit(v.trim())}><Text style={s.ok}>Save</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'center', padding: 24 },
  box: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#14213D' },
  input: { borderWidth: 1, borderColor: '#D5DCE4', borderRadius: 8, padding: 10, fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24 },
  cancel: { color: '#52606D', fontSize: 16 }, ok: { color: '#0F766E', fontSize: 16, fontWeight: '700' },
});
