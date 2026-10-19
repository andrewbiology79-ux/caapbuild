import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import CqCreateScreen from '../screens/CqCreateScreen';
import CategoryScreen from '../screens/CategoryScreen';
import CollectionScreen from '../screens/CollectionScreen';
import MoreScreen from '../screens/MoreScreen';

const Tab = createBottomTabNavigator();

export default function Tabs() {
  const [topicId, setTopicId] = useState<string | undefined>();
  return (
    <Tab.Navigator initialRouteName="CQ Collection" screenOptions={{ tabBarActiveTintColor: '#0F766E' }}>
      <Tab.Screen name="Cq Create" component={CqCreateScreen} />
      <Tab.Screen name="Category">
        {({ navigation }) => <CategoryScreen onOpenTopic={(id) => { setTopicId(id); navigation.navigate('CQ Collection'); }} />}
      </Tab.Screen>
      <Tab.Screen name="CQ Collection">{() => <CollectionScreen topicId={topicId} />}</Tab.Screen>
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}
