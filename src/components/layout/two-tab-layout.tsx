"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Code2, Workflow, ChevronRight, Home } from "lucide-react";
import { InlineTipsCarousel } from "./inline-tips-carousel";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useHostAPIStore } from "@/stores/host-api-store";
import { useEditorStore } from "@/stores/editor-store";

interface TwoTabLayoutProps {
  codeEditor: React.ReactNode;
  visualDiagram: React.ReactNode;
  fileInfo?: {
    name?: string;
    isDirty?: boolean;
  };
  actions?:
    | React.ReactNode
    | ((
        activeTab: TabType,
        setActiveTab: (tab: TabType) => void,
      ) => React.ReactNode);
}

export type TabType = "code" | "visual";

export const TwoTabLayout: React.FC<TwoTabLayoutProps> = ({
  codeEditor,
  visualDiagram,
  fileInfo,
  actions,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(
    () => useHostAPIStore.getState().requestedTab ?? "code"
  );
  const { commands, feedbackQueue, executeCommand, dismissFeedback, requestedTab, setRequestedTab } =
    useHostAPIStore();
  const { hierarchyState, navigateToRoot, navigateUp } = useEditorStore();
  const currentPath = hierarchyState.currentPath;
  const visiblePath = currentPath.slice(-2);
  const hasHiddenSegments = currentPath.length > 2;

  useEffect(() => {
    if (requestedTab !== null) {
      setActiveTab(requestedTab);
      setRequestedTab(null);
    }
  }, [requestedTab, setRequestedTab]);

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  const editorTips = [
    {
      tab: "code" as const,
      content: (
        <>
          Press{" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            Ctrl+Space
          </kbd>{" "}
          for autocomplete suggestions
        </>
      ),
    },
    {
      tab: "both" as const,
      content: (
        <>
          Use{" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            Ctrl+Z
          </kbd>{" "}
          to undo and{" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            Ctrl+Y
          </kbd>{" "}
          to redo changes
        </>
      ),
    },
    {
      tab: "both" as const,
      content: (
        <>
        You can create a new channel by using {" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            this_
          </kbd>{" "}prefix
        </>
      ),
    },
    {
      tab: "visual" as const,
      content: (
        <>
          Select an edge, then{" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            Shift+Click
          </kbd>{" "}
          to add waypoints
        </>
      ),
    },
    {
      tab: "visual" as const,
      content: "Click the plus icon on a simple state to add a child state.",
    },
    {
      tab: "visual" as const,
      content:
        "Click the down arrow on a compound state to navigate inside it.",
    },
    {
      tab: "visual" as const,
      content: "Click the network icon for auto-layout options",
    },
    {
      tab: "visual" as const,
      content: (
        <>
          Press{" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            Delete
          </kbd>{" "}
          (Windows) or{" "}
          <kbd className='px-1.5 py-0.5 bg-muted rounded text-default font-mono'>
            fn+Delete
          </kbd>{" "}
          (Mac) to remove selected states or transitions
        </>
      ),
    },
  ];

  return (
    <div className='h-full flex flex-col relative'>
      {feedbackQueue.map((item) => (
        <div
          key={item.id}
          className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-start space-x-3 px-4 py-3 rounded-lg shadow-lg text-sm max-w-lg w-full ${
            item.level === "info"
              ? "bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-800 dark:text-green-300"
              : item.level === "warning"
                ? "bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900 text-yellow-800 dark:text-yellow-300"
                : "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300"
          }`}
        >
          <span className='flex-1 whitespace-pre-wrap'>{item.message}</span>
          <button
            onClick={() => dismissFeedback(item.id)}
            className='shrink-0 font-bold opacity-60 hover:opacity-100'
          >
            ✕
          </button>
        </div>
      ))}

      {/* Combined toolbar */}
      <div className='flex items-center gap-1 px-3 py-2 border-b border-default bg-elevated'>
        {/* Tab switcher icon buttons */}
        <button
          onClick={() => handleTabChange("visual")}
          title="Visual Diagram"
          className={`p-2 rounded-md transition-colors ${
            activeTab === "visual"
              ? "bg-primary-muted text-primary"
              : "text-muted hover:bg-muted hover:text-default"
          }`}
        >
          <Workflow className='h-4 w-4' />
        </button>
        <button
          onClick={() => handleTabChange("code")}
          title="Code Editor"
          className={`p-2 rounded-md transition-colors ${
            activeTab === "code"
              ? "bg-primary-muted text-primary"
              : "text-muted hover:bg-muted hover:text-default"
          }`}
        >
          <Code2 className='h-4 w-4' />
        </button>

        {/* Host-registered commands */}
        {commands.length > 0 && (
          <>
            <div className='h-6 w-px bg-[var(--ui-border)] mx-1' />
            {commands.map((cmd) => (
              <button
                key={cmd.id}
                onClick={() => executeCommand(cmd.id)}
                disabled={cmd.isExecuting}
                title={cmd.tooltip}
                className='cursor-pointer flex items-center space-x-2 text-sm px-3 py-1.5 rounded-md border border-primary text-primary bg-elevated hover:bg-primary-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {cmd.isExecuting && (
                  <span className='h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block' />
                )}
                <span>{cmd.label}</span>
              </button>
            ))}
          </>
        )}

        {/* Breadcrumb — visible when navigated into a nested state */}
        {currentPath.length > 0 && (
          <>
            <div className='h-4 w-px bg-[var(--ui-border)] mx-1' />
            <div className='flex items-center gap-0.5 text-sm'>
              <button
                onClick={navigateToRoot}
                className='p-0.5 text-dimmed hover:text-default transition-colors'
                title='Navigate to root'
              >
                <Home className='h-3.5 w-3.5' />
              </button>
              {hasHiddenSegments && (
                <>
                  <ChevronRight className='h-3.5 w-3.5 text-dimmed' />
                  <span className='text-dimmed px-0.5'>…</span>
                </>
              )}
              {visiblePath.map((segment, i) => {
                const isLast = i === visiblePath.length - 1;
                const stepsUp = visiblePath.length - 1 - i;
                return (
                  <React.Fragment key={i}>
                    <ChevronRight className='h-3.5 w-3.5 text-dimmed' />
                    {isLast ? (
                      <span className='text-default font-medium'>{segment}</span>
                    ) : (
                      <button
                        onClick={() => { for (let j = 0; j < stepsUp; j++) navigateUp(); }}
                        className='px-1 text-muted hover:text-default transition-colors'
                        title={`Navigate to ${segment}`}
                      >
                        {segment}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </>
        )}

        <div className='flex-1' />

        <InlineTipsCarousel
          tips={editorTips}
          activeTab={activeTab}
          autoAdvance={true}
          autoAdvanceInterval={6000}
        />

        <ThemeToggle />

        {/* Built-in actions (undo/redo + ⋮ menu from page.tsx) */}
        {actions &&
          (typeof actions === "function"
            ? actions(activeTab, setActiveTab)
            : actions)}
      </div>

      {/* Content Area */}
      <div className='flex-1 overflow-hidden'>
        {activeTab === "code" && (
          <div className='h-full p-4 bg-base'>{codeEditor}</div>
        )}
        {activeTab === "visual" && (
          <div className='h-full bg-muted'>{visualDiagram}</div>
        )}
      </div>
    </div>
  );
};
