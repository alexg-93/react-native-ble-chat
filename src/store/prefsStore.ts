import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PrefsState {
  favorites: string[];
  autoReconnect: boolean;
  advertisedName: string;

  // Actions
  toggleFavorite: (id: string) => void;
  setAutoReconnect: (v: boolean) => void;
  setAdvertisedName: (n: string) => void;
  isFavorite: (id: string) => boolean;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set, get) => ({
      favorites: [],
      autoReconnect: false,
      advertisedName: 'MyBLEDevice',

      toggleFavorite: (id) =>
        set((s) => {
          const exists = s.favorites.includes(id);
          return {
            favorites: exists
              ? s.favorites.filter((f) => f !== id)
              : [...s.favorites, id],
          };
        }),

      setAutoReconnect: (autoReconnect) => set({ autoReconnect }),
      setAdvertisedName: (advertisedName) => set({ advertisedName }),

      isFavorite: (id) => get().favorites.includes(id),
    }),
    {
      name: 'ble_prefs',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
