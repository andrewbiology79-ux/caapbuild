import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useCqStore } from '../store/useCqStore';

export default function MoreScreen() {
  const { folders, questions, importAll, resetAll } = useCqStore();

  const backup = async () => {
    const uri = FileSystem.cacheDirectory + `cq-backup-${new Date().toISOString().slice(0, 10)}.json`;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify({ version: 1, folders, questions }));
    await Sharing.shareAsync(uri, { mimeType: 'application/json' });
  };
  const restore = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (r.canceled) return;
      const d = JSON.parse(await FileSystem.readAsStringAsync(r.assets[0].uri));
      if (!Array.isArray(d.folders) || !Array.isArray(d.questions)) throw new Error('Not a CQ backup file');
      Alert.alert('Replace all data?', `${d.questions.length} questions will replace your current data.`, [
        { text: 'Cancel', style: 'cancel' }, { text: 'Replace', style: 'destructive', onPress: () => importAll(d) }]);
    } catch (e: any) { Alert.alert('Import failed', e.message); }
  };
  const reset = () => Alert.alert('Reset app?', 'Deletes all your folders and questions.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: resetAll }]);

  return (
    <View style={s.wrap}>
      <Text style={s.stat}>{questions.length} questions saved on this device</Text>
      <Pressable style={s.btn} onPress={backup}><Text style={s.t}>Export backup</Text></Pressable>
      <Pressable style={s.btn} onPress={restore}><Text style={s.t}>Import backup</Text></Pressable>
      <Pressable style={s.btn} onPress={reset}><Text style={[s.t, { color: '#B42318' }]}>Reset app data</Text></Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 16, gap: 12 }, stat: { color: '#52606D', marginBottom: 6 },
  btn: { padding: 16, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#D5DCE4' }, t: { fontSize: 16, color: '#14213D' },
});
