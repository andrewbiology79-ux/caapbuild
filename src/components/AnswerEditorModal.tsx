import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import MathText from './MathText';
import { useCqStore } from '../store/useCqStore';
import { ImageAsset, Question } from '../types';

interface Props { visible: boolean; question?: Question; which: 'gha' | 'ghe'; onClose: () => void }

/** Answer editor: text with [LaTeX], live preview, and explanation images. */
export default function AnswerEditorModal({ visible, question, which, onClose }: Props) {
  const setAnswer = useCqStore((s) => s.setAnswer);
  const [text, setText] = useState('');
  const [imgs, setImgs] = useState<ImageAsset[]>([]);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!visible || !question) return;
    setText(question[which].answer?.html ?? '');
    setImgs(question[which].answer?.images ?? []);
    setPreview(false);
  }, [visible, question, which]);

  const addImg = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!r.canceled) setImgs((x) => [...x, { id: Date.now().toString(36), uri: r.assets[0].uri }]);
  };
  const save = () => { if (question) setAnswer(question.id, which, { html: text, images: imgs }); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.bar}>
        <Pressable onPress={onClose}><Text style={s.cancel}>Cancel</Text></Pressable>
        <Text style={s.h}>Answer ({question?.[which].label})</Text>
        <Pressable onPress={save}><Text style={s.ok}>Save</Text></Pressable>
      </View>
      <View style={s.tools}>
        <Pressable onPress={() => setText((t) => t + '[ ]')}><Text style={s.tool}>[ ] math</Text></Pressable>
        <Pressable onPress={() => setText((t) => t + '[\\frac{a}{b}]')}><Text style={s.tool}>a/b</Text></Pressable>
        <Pressable onPress={() => setText((t) => t + '[x^{2}]')}><Text style={s.tool}>x²</Text></Pressable>
        <Pressable onPress={addImg}><Text style={s.tool}>+ Image</Text></Pressable>
        <Pressable onPress={() => setPreview((v) => !v)}><Text style={[s.tool, { color: '#0F766E' }]}>{preview ? 'Edit' : 'Preview'}</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
        {preview ? <MathText text={text || ' '} /> :
          <TextInput multiline value={text} onChangeText={setText} style={s.in} placeholder="Write the answer / explanation…" />}
        {imgs.map((i) => (
          <View key={i.id}>
            <Image source={{ uri: i.uri }} style={s.img} resizeMode="contain" />
            <Pressable onPress={() => setImgs((x) => x.filter((y) => y.id !== i.id))}><Text style={{ color: '#B42318' }}>Remove image</Text></Pressable>
          </View>
        ))}
      </ScrollView>
    </Modal>
  );
}
const s = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 50, borderBottomWidth: 1, borderBottomColor: '#D5DCE4' },
  h: { fontSize: 16, fontWeight: '700', color: '#14213D' },
  tools: { flexDirection: 'row', gap: 16, padding: 12, backgroundColor: '#F6F8FA' }, tool: { color: '#14213D', fontWeight: '600' },
  in: { minHeight: 200, borderWidth: 1, borderColor: '#D5DCE4', borderRadius: 8, padding: 10, fontSize: 15, textAlignVertical: 'top' },
  img: { width: '100%', height: 200, backgroundColor: '#F6F8FA' },
  cancel: { color: '#52606D', fontSize: 16 }, ok: { color: '#0F766E', fontSize: 16, fontWeight: '700' },
});
