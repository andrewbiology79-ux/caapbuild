import React, { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LEVELS, useCqStore } from '../store/useCqStore';
import TextPrompt from '../components/TextPrompt';
import { FolderNode } from '../types';

type Row = { node: FolderNode; depth: number };
const flatten = (ns: FolderNode[], open: Set<string>, d = 0): Row[] =>
  ns.flatMap((n) => [{ node: n, depth: d }, ...(open.has(n.id) ? flatten(n.children, open, d + 1) : [])]);

type Prompt = { title: string; initial?: string; run: (v: string) => void } | null;

export default function CategoryScreen({ onOpenTopic }: { onOpenTopic: (id: string) => void }) {
  const { folders, addFolder, renameFolder, deleteFolder } = useCqStore();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<FolderNode | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);

  const tap = (n: FolderNode) => {
    if (n.level === 'topic') return onOpenTopic(n.id);
    setOpen((s) => { const x = new Set(s); x.has(n.id) ? x.delete(n.id) : x.add(n.id); return x; });
  };
  const canAdd = sel && sel.level !== 'topic';
  const childLevel = sel ? LEVELS[LEVELS.indexOf(sel.level) + 1] : 'subject';

  return (
    <View style={{ flex: 1 }}>
      <FlatList data={flatten(folders, open)} keyExtractor={(r) => r.node.id} contentContainerStyle={{ padding: 12 }}
        ListHeaderComponent={<Pressable onPress={() => setPrompt({ title: 'New subject', run: (v) => addFolder(null, v) })}>
          <Text style={s.add}>+ Add subject</Text></Pressable>}
        renderItem={({ item: { node, depth } }) => (
          <Pressable onPress={() => tap(node)} onLongPress={() => setSel(node)} style={[s.row, { marginLeft: depth * 16 }]}>
            <Text style={s.arrow}>{node.level === 'topic' ? '•' : open.has(node.id) ? '▾' : '▸'}</Text>
            <Text style={s.title}>{node.title}</Text>
          </Pressable>)} />

      <Modal transparent visible={!!sel} animationType="fade" onRequestClose={() => setSel(null)}>
        <Pressable style={s.back} onPress={() => setSel(null)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{sel?.title}</Text>
            {canAdd && <Pressable style={s.item} onPress={() => { const n = sel!; setSel(null);
              setPrompt({ title: `New ${childLevel}`, run: (v) => { addFolder(n.id, v); setOpen((o) => new Set(o).add(n.id)); } }); }}>
              <Text style={s.itemTxt}>Add {childLevel}</Text></Pressable>}
            <Pressable style={s.item} onPress={() => { const n = sel!; setSel(null);
              setPrompt({ title: 'Rename', initial: n.title, run: (v) => renameFolder(n.id, v) }); }}>
              <Text style={s.itemTxt}>Rename</Text></Pressable>
            <Pressable style={s.item} onPress={() => { const n = sel!; setSel(null);
              Alert.alert('Delete?', 'This also deletes everything inside it.', [
                { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteFolder(n.id) }]); }}>
              <Text style={[s.itemTxt, { color: '#B42318' }]}>Delete</Text></Pressable>
          </View>
        </Pressable>
      </Modal>

      <TextPrompt visible={!!prompt} title={prompt?.title ?? ''} initial={prompt?.initial}
        onCancel={() => setPrompt(null)} onSubmit={(v) => { prompt?.run(v); setPrompt(null); }} />
    </View>
  );
}
const s = StyleSheet.create({
  add: { color: '#0F766E', fontWeight: '700', paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#D5DCE4' },
  arrow: { width: 16, color: '#0F766E' }, title: { fontSize: 16, color: '#14213D', flex: 1 },
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingBottom: 12 },
  sheetTitle: { padding: 16, fontWeight: '700', color: '#14213D' },
  item: { paddingVertical: 14, paddingHorizontal: 20 }, itemTxt: { fontSize: 16, color: '#14213D' },
});
