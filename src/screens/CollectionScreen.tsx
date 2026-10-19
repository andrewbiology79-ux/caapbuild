import React, { useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import CqItemCard from '../components/CqItemCard';
import QuestionEditorModal from '../components/QuestionEditorModal';
import AnswerEditorModal from '../components/AnswerEditorModal';
import { useCqStore } from '../store/useCqStore';
import { Question } from '../types';

/** topicId undefined = every question. New questions need a topic. */
export default function CollectionScreen({ topicId }: { topicId?: string }) {
  const all = useCqStore((s) => s.questions);
  const deleteQuestion = useCqStore((s) => s.deleteQuestion);
  const data = topicId ? all.filter((q) => q.folderId === topicId) : all;
  const [editor, setEditor] = useState<{ q?: Question } | null>(null);
  const [answer, setAnswer] = useState<{ q: Question; w: 'gha' | 'ghe' } | null>(null);

  const addNew = () => topicId ? setEditor({}) : Alert.alert('Pick a topic', 'Open a sub-topic from the Category tab, then add a CQ.');

  return (
    <View style={{ flex: 1 }}>
      <FlatList data={data} keyExtractor={(q) => q.id} contentContainerStyle={{ paddingBottom: 90 }}
        renderItem={({ item, index }) => (
          <CqItemCard question={item} serial={index + 1}
            onOpenAnswer={(q, w) => setAnswer({ q, w })}
            onEdit={(q) => setEditor({ q })}
            onDelete={(q) => Alert.alert('Delete CQ?', undefined, [{ text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => deleteQuestion(q.id) }])} />)}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 60 }}>No questions here yet. Tap + to add one.</Text>} />
      <Pressable onPress={addNew} style={{ position: 'absolute', right: 18, bottom: 18, width: 56, height: 56, borderRadius: 28,
        backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 30, marginTop: -2 }}>+</Text>
      </Pressable>
      <QuestionEditorModal visible={!!editor} folderId={topicId} initial={editor?.q} onClose={() => setEditor(null)} />
      <AnswerEditorModal visible={!!answer} question={answer ? all.find((x) => x.id === answer.q.id) : undefined}
        which={answer?.w ?? 'gha'} onClose={() => setAnswer(null)} />
    </View>
  );
}
