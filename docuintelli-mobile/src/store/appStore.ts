import { create } from 'zustand';

interface AppState {
  isOnline: boolean;
  isLocked: boolean;
  setOnline: (online: boolean) => void;
  setLocked: (locked: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isOnline: true,
  isLocked: false,
  setOnline: (online) => set({ isOnline: online }),
  setLocked: (locked) => set({ isLocked: locked }),
}));
