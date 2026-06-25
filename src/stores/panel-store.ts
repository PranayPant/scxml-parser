import { create } from 'zustand';

export type PanelId = 'config' | 'channelMapping' | 'events' | 'validation' | 'transition' | 'stateActions';

interface PanelStore {
  activePanel: PanelId | null;
  setActivePanel: (panel: PanelId | null) => void;
  togglePanel: (panel: PanelId) => void;
}

export const usePanelStore = create<PanelStore>((set, get) => ({
  activePanel: null,
  setActivePanel: (panel) => set({ activePanel: panel }),
  togglePanel: (panel) => set({ activePanel: get().activePanel === panel ? null : panel }),
}));
