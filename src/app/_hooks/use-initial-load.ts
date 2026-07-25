'use client';

import { useEffect, useMemo, useState } from 'react';
import { HistoryManager } from '@/lib/history/history-manager';
import { useEditorStore } from '@/stores/editor-store';

// How long to wait, when embedded in a host (e.g. LoopControl), for the host to push
// content via ScxmlEditorAPI.loadScxml() before giving up and showing the Welcome screen.
const HOST_LOAD_TIMEOUT_MS = 3000;

export function useInitialLoad() {
  const { content } = useEditorStore();
  const historyManager = useMemo(() => HistoryManager.getInstance(), []);
  // Always start in the loading state — checking `window` during render would bake
  // `isEmbedded = false` into the statically-exported HTML (built with no `window`),
  // causing a Welcome-screen flash before hydration corrects it. Defer the check to
  // an effect, which only ever runs client-side after mount.
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // When embedded, wait for the host's initial content push before rendering. Standalone
  // access (no host) has nothing to wait for, so it skips straight to the Welcome screen.
  useEffect(() => {
    const isEmbedded = window.self !== window.top;
    if (!isEmbedded) {
      setIsInitialLoading(false);
      return;
    }
    const timer = setTimeout(() => setIsInitialLoading(false), HOST_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop waiting as soon as the host (or a hot-reload) provides content.
  useEffect(() => {
    if (content) setIsInitialLoading(false);
  }, [content]);

  // Seed history if content already exists on mount (e.g. hot-reload)
  useEffect(() => {
    if (content && !historyManager.canUndo() && !historyManager.canRedo()) {
      historyManager.initialize(content, 'Initial state');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isInitialLoading };
}
