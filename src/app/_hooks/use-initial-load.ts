'use client';

import { useEffect, useMemo, useState } from 'react';
import { HistoryManager } from '@/lib/history/history-manager';
import { annotateLegacyConfTypes } from '@/lib/utils/datamodel-extractor';
import { useEditorStore } from '@/stores/editor-store';

export function useInitialLoad() {
  const { content, setContent, setErrors, navigateToRoot } = useEditorStore();
  const historyManager = useMemo(() => HistoryManager.getInstance(), []);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Auto-load main.scxml when served via LoopControl
  useEffect(() => {
    fetch('/scxml-editor/program')
      .then(r => r.ok ? r.text() : null)
      .then(xml => {
        if (!xml) return;
        const annotated = annotateLegacyConfTypes(xml);
        setContent(annotated);
        setErrors([]);
        historyManager.initialize(annotated, 'Auto-loaded');
        navigateToRoot();
      })
      .catch(() => {})
      .finally(() => setIsInitialLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed history if content already exists on mount (e.g. hot-reload)
  useEffect(() => {
    if (content && !historyManager.canUndo() && !historyManager.canRedo()) {
      historyManager.initialize(content, 'Initial state');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isInitialLoading };
}
