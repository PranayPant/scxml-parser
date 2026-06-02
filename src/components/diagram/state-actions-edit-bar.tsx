"use client";

import { BADGE_COLORS } from "@/lib";
import { extractDatamodelVariables } from "@/lib/utils/datamodel-extractor";
import { useHostAPIStore } from "@/stores/host-api-store";
import { Save, X } from "lucide-react";
import React from "react";

type Suggestion = { label: string; kind: "channel" | "variable" };

interface ActionRow {
  location: string;
  expr: string;
}

interface StateActionsEditBarProps {
  stateId: string;
  entryActions: ActionRow[];
  exitActions: ActionRow[];
  scxmlContent: string;
  onSave: (entryActions: string[], exitActions: string[]) => void;
  onCancel: () => void;
}

export const StateActionsEditBar: React.FC<StateActionsEditBarProps> = ({
  stateId,
  entryActions: initialEntry,
  exitActions: initialExit,
  scxmlContent,
  onSave,
  onCancel,
}) => {
  const [editingField, setEditingField] = React.useState<"onentry" | "onexit">(
    "onentry",
  );
  const [entryActions, setEntryActions] = React.useState<ActionRow[]>(
    initialEntry.length > 0 ? initialEntry : [{ location: "", expr: "" }],
  );
  const [exitActions, setExitActions] = React.useState<ActionRow[]>(
    initialExit.length > 0 ? initialExit : [{ location: "", expr: "" }],
  );
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const actions = editingField === "onentry" ? entryActions : exitActions;
  const setActions =
    editingField === "onentry" ? setEntryActions : setExitActions;

  const channels = useHostAPIStore((state) => state.channels);
  const channelTypeMap = useHostAPIStore((state) => state.channelTypeMap);

  const dataVars = React.useMemo(
    () => extractDatamodelVariables(scxmlContent),
    [scxmlContent],
  );

  const locationValue = actions[0]?.location ?? "";

  const suggestions: Suggestion[] = React.useMemo(() => {
    const prefix = locationValue.toLowerCase();
    const varSuggestions: Suggestion[] = dataVars
      .filter((v) => v.toLowerCase().includes(prefix))
      .map((v) => ({ label: v, kind: "variable" }));
    const channelSuggestions: Suggestion[] = channels
      .filter((c) => c.toLowerCase().includes(prefix))
      .map((c) => ({ label: c, kind: "channel" }));
    return [...varSuggestions, ...channelSuggestions];
  }, [locationValue, dataVars, channels]);

  const showSuggestions = isOpen && suggestions.length > 0;

  const selectSuggestion = (suggestion: Suggestion) => {
    const updated =
      actions.length > 0 ? [...actions] : [{ location: "", expr: "" }];
    updated[0] = { ...updated[0], location: suggestion.label };
    setActions(updated);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const saveAll = () => {
    const toStrings = (rows: ActionRow[]) =>
      rows
        .filter((a) => a.location || a.expr)
        .map((a) => `assign|${a.location}|${a.expr}`);
    onSave(toStrings(entryActions), toStrings(exitActions));
  };

  const handleLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1,
        );
        return;
      }
      if (e.key === "Tab" && activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0) selectSuggestion(suggestions[activeIndex]);
        else saveAll();
        return;
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        setActiveIndex(-1);
        return;
      }
    } else {
      if (e.key === "Enter") {
        saveAll();
        return;
      }
      if (e.key === "Escape") {
        onCancel();
        return;
      }
    }
  };

  return (
    <div className='absolute top-[0px] left-0 right-0 z-10 flex items-center gap-2 px-4 py-2 bg-white border-b shadow-sm'>
      {/* onentry / onexit switch */}
      <div className='flex rounded-md border border-green-300 overflow-hidden text-sm'>
        {(["onentry", "onexit"] as const).map((field) => (
          <button
            key={field}
            type='button'
            onClick={() => {
              setEditingField(field);
              setIsOpen(false);
              setActiveIndex(-1);
            }}
            className={`px-3 py-1.5 font-mono transition-colors ${
              editingField === field
                ? "bg-green-500 text-white"
                : "bg-white text-gray-600 hover:bg-green-50"
            }`}
          >
            {field}
          </button>
        ))}
      </div>

      {/* location input with autocomplete */}
      <div className='relative w-96'>
        <input
          type='text'
          value={
            activeIndex >= 0 ? suggestions[activeIndex].label : locationValue
          }
          onChange={(e) => {
            const updated =
              actions.length > 0 ? [...actions] : [{ location: "", expr: "" }];
            updated[0] = { ...updated[0], location: e.target.value };
            setActions(updated);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            blurTimerRef.current = setTimeout(() => setIsOpen(false), 100);
          }}
          onKeyDown={handleLocationKeyDown}
          className='w-full px-3 py-1.5 text-sm text-gray-800 border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'
          placeholder='location'
        />
        {showSuggestions && (
          <div className='absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-green-200 rounded-md shadow-lg max-h-48 overflow-y-auto'>
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion.label}
                onMouseDown={() => selectSuggestion(suggestion)}
                className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
                  index === activeIndex
                    ? "bg-green-500 text-white"
                    : "hover:bg-green-100 text-gray-800"
                }`}
              >
                <span
                  className='text-xs px-1 py-0.5 rounded font-mono text-black'
                  style={{
                    backgroundColor:
                      BADGE_COLORS[channelTypeMap[suggestion.label] ?? "ch"],
                  }}
                >
                  {channelTypeMap[suggestion.label] ?? "ch"}
                </span>
                <span>{suggestion.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* expr input */}
      <input
        type='text'
        value={actions[0]?.expr ?? ""}
        onChange={(e) => {
          const updated =
            actions.length > 0 ? [...actions] : [{ location: "", expr: "" }];
          updated[0] = { ...updated[0], expr: e.target.value };
          setActions(updated);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") saveAll();
          else if (e.key === "Escape") onCancel();
        }}
        className='flex-1 px-3 py-1.5 text-sm text-gray-800 border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'
        placeholder='expr'
      />

      <button
        onClick={saveAll}
        title='Save'
        className='p-1.5 rounded-md text-green-500 hover:bg-gray-100 hover:text-green-600 transition-colors'
      >
        <Save className='h-4 w-4' />
      </button>
      <button
        onClick={onCancel}
        title='Cancel'
        className='p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-700 transition-colors'
      >
        <X className='h-4 w-4' />
      </button>
    </div>
  );
};
