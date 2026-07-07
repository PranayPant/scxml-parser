'use client';

import { useCallback, useState } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import type { ActionType } from '@/types/history';

export function useHistoryRestore() {
  const { setContent } = useEditorStore();
  const [isUpdatingFromHistory, setIsUpdatingFromHistory] = useState(false);
  const [currentHistoryActionType, setCurrentHistoryActionType] = useState<ActionType | undefined>(undefined);

  const handleHistoryRestore = useCallback(
    (restoredContent: string, actionType: ActionType) => {
      setIsUpdatingFromHistory(true);
      setCurrentHistoryActionType(actionType);
      setContent(restoredContent);
      setTimeout(() => {
        setIsUpdatingFromHistory(false);
        setCurrentHistoryActionType(undefined);
      }, 100);
    },
    [setContent]
  );

  return { isUpdatingFromHistory, currentHistoryActionType, handleHistoryRestore };
}
