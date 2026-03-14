import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Radio, Signal, Users, MessageCircle } from 'lucide-react-native';

import { ScannerScreen } from '../screens/ScannerScreen';
import { GattDetailScreen } from '../screens/GattDetailScreen';
import { PeripheralScreen } from '../screens/PeripheralScreen';
import { PeersScreen } from '../screens/PeersScreen';
import { ChatListScreen } from '../screens/ChatListScreen';
import { ChatDetailScreen } from '../screens/ChatDetailScreen';

export type ScannerStackParamList = {
  Scanner: undefined;
  GattDetail: { deviceId: string };
};

export type ChatStackParamList = {
  ChatList: undefined;
  ChatDetail: { peerId: string; peerName: string };
};

export type RootTabParamList = {
  ScannerTab: undefined;
  Peripheral: undefined;
  Peers: undefined;
  Chat: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const ScannerStack = createNativeStackNavigator<ScannerStackParamList>();
const ChatStack = createNativeStackNavigator<ChatStackParamList>();

function ScannerStackNavigator() {
  return (
    <ScannerStack.Navigator id="ScannerStack">
      <ScannerStack.Screen
        name="Scanner"
        component={ScannerScreen}
        options={{ title: 'BLE Scanner', headerShown: true }}
      />
      <ScannerStack.Screen
        name="GattDetail"
        component={GattDetailScreen}
        options={{ title: 'GATT Explorer', headerShown: true }}
      />
    </ScannerStack.Navigator>
  );
}

function ChatStackNavigator() {
  return (
    <ChatStack.Navigator id="ChatStack">
      <ChatStack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{ title: 'Conversations', headerShown: true }}
      />
      <ChatStack.Screen
        name="ChatDetail"
        component={ChatDetailScreen}
        options={({ route }) => ({
          title: route.params.peerName || 'Chat',
          headerShown: true,
        })}
      />
    </ChatStack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        id="Root"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#2563eb',
        }}>
        <Tab.Screen
          name="ScannerTab"
          component={ScannerStackNavigator}
          options={{
            title: 'Scanner',
            tabBarIcon: ({ color }) => <Radio size={22} color={color} />,
          }}
        />
        <Tab.Screen
          name="Peripheral"
          component={PeripheralScreen}
          options={{
            title: 'Peripheral',
            tabBarIcon: ({ color }) => <Signal size={22} color={color} />,
          }}
        />
        <Tab.Screen
          name="Peers"
          component={PeersScreen}
          options={{
            title: 'Peers',
            tabBarIcon: ({ color }) => <Users size={22} color={color} />,
          }}
        />
        <Tab.Screen
          name="Chat"
          component={ChatStackNavigator}
          options={{
            title: 'Chat',
            tabBarIcon: ({ color }) => <MessageCircle size={22} color={color} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
