import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { ChannelInfo, ChannelMapping, CommandOptions, EventEntry, FeedbackItem, HostErrorItem, RegisteredCommand } from '@/types/host-api';

interface HostAPIState {
  commands: RegisteredCommand[];
  isReady: boolean;
  readyCallbacks: (() => void)[];
  feedbackQueue: FeedbackItem[];
  channels: string[];
  hostChannels: string[];
  channelTypeMap: Record<string, ChannelInfo['type']>;
  channelMappings: ChannelMapping[];
  events: EventEntry[];
  requestedTab: 'code' | 'visual' | null;
  hostErrors: HostErrorItem[];
  requestedValidationTab: 'validation' | 'host-alerts' | null;
}

interface HostAPIActions {
  markReady: () => void;
  onReady: (callback: () => void) => void;
  registerCommand: (options: CommandOptions) => void;
  executeCommand: (id: string) => Promise<void>;
  showFeedback: (message: string, level?: FeedbackItem['level']) => void;
  dismissFeedback: (id: string) => void;
  setChannels: (channels: (string | ChannelInfo)[]) => void;
  setChannelMappings: (mappings: ChannelMapping[]) => void;
  updateChannelMapping: (scxmlRef: string, mappedChannel: string) => void;
  setEvents: (events: EventEntry[]) => void;
  setRequestedTab: (tab: 'code' | 'visual' | null) => void;
  showErrors: (errors: Array<{ message: string; level?: HostErrorItem['level'] }>) => void;
  dismissHostError: (id: string) => void;
  clearHostErrors: () => void;
  setRequestedValidationTab: (tab: 'validation' | 'host-alerts' | null) => void;
}

export const useHostAPIStore = create<HostAPIState & HostAPIActions>((set, get) => ({
  commands: [],
  isReady: false,
  readyCallbacks: [],
  feedbackQueue: [],
  channels: [],
  hostChannels: [],
  channelTypeMap: {},
  channelMappings: [],
  events: [],
  requestedTab: null,
  hostErrors: [],
  requestedValidationTab: null,

  markReady: () => {
    const { readyCallbacks } = get();
    set({ isReady: true, readyCallbacks: [] });
    readyCallbacks.forEach(cb => cb());
  },

  onReady: (callback: () => void) => {
    if (get().isReady) {
      callback();
    } else {
      set(state => ({ readyCallbacks: [...state.readyCallbacks, callback] }));
    }
  },

  registerCommand: (options: CommandOptions) => {
    const { commands } = get();
    const exists = commands.some(c => c.id === options.id);
    if (exists) {
      console.warn(`Command with id "${options.id}" already exists, replacing.`);
    }
    const command: RegisteredCommand = { ...options, isExecuting: false };
    const updated = exists
      ? commands.map(c => c.id === options.id ? command : c)
      : [...commands, command];
    set({ commands: updated.sort((a, b) => a.order - b.order) });
  },

  executeCommand: async (id: string) => {
    const { commands, showFeedback } = get();
    const command = commands.find(c => c.id === id);
    if (!command) return;

    set(state => ({
      commands: state.commands.map(c =>
        c.id === id ? { ...c, isExecuting: true } : c
      ),
    }));

    try {
      await command.run();
    } catch (error) {
      console.error(`Command "${id}" failed:`, error);
      showFeedback(`Command failed: ${(error as Error).message}`, 'error');
    } finally {
      set(state => ({
        commands: state.commands.map(c =>
          c.id === id ? { ...c, isExecuting: false } : c
        ),
      }));
    }
  },

  showFeedback: (message: string, level: FeedbackItem['level'] = 'info') => {
    const item: FeedbackItem = { id: uuidv4(), message, level };
    set(state => ({ feedbackQueue: [...state.feedbackQueue, item] }));
    setTimeout(() => get().dismissFeedback(item.id), 4000);
  },

  dismissFeedback: (id: string) => {
    set(state => ({
      feedbackQueue: state.feedbackQueue.filter(f => f.id !== id),
    }));
  },

  setChannels: (channels: (string | ChannelInfo)[]) => {
    const infos: ChannelInfo[] = channels.map(c =>
      typeof c === 'string' ? { name: c, type: 'ch' as const } : c
    );
    const { events } = get();
    const names = infos.map(i => i.name);
    const typeMap = Object.fromEntries(infos.map(i => [i.name, i.type]));
    const eventNames = events.map(e => e.name);
    set({ hostChannels: names, channelTypeMap: typeMap, channels: [...names, ...eventNames.filter(n => !names.includes(n))] });
  },

  setChannelMappings: (mappings: ChannelMapping[]) => set({ channelMappings: mappings }),

  setEvents: (events: EventEntry[]) => {
    const { hostChannels } = get();
    const eventNames = events.map(e => e.name);
    set({ events, channels: [...hostChannels, ...eventNames.filter(n => !hostChannels.includes(n))] });
  },

  setRequestedTab: (tab) => set({ requestedTab: tab }),

  updateChannelMapping: (scxmlRef: string, mappedChannel: string) =>
    set(state => {
      if (!mappedChannel) {
        return { channelMappings: state.channelMappings.filter(m => m.scxmlRef !== scxmlRef) };
      }
      const exists = state.channelMappings.some(m => m.scxmlRef === scxmlRef);
      if (exists) {
        return { channelMappings: state.channelMappings.map(m => m.scxmlRef === scxmlRef ? { scxmlRef, mappedChannel } : m) };
      }
      return { channelMappings: [...state.channelMappings, { scxmlRef, mappedChannel }] };
    }),

  showErrors: (errors) => {
    const items: HostErrorItem[] = errors.map(e => ({
      id: uuidv4(),
      message: e.message,
      level: e.level ?? 'error',
    }));
    set(state => ({
      hostErrors: [...state.hostErrors, ...items],
      requestedValidationTab: 'host-alerts',
    }));
  },

  dismissHostError: (id: string) => {
    set(state => ({
      hostErrors: state.hostErrors.filter(e => e.id !== id),
    }));
  },

  clearHostErrors: () => set({ hostErrors: [] }),

  setRequestedValidationTab: (tab) => set({ requestedValidationTab: tab }),
}));
