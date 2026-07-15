"use client";

import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Trash2 } from "lucide-react";
import type { SCXMLStateNodeData } from "./scxml-state-node";

const HANDLE_CLASS =
  "!bg-slate-500 !border-white !w-4 !h-4 !border-2 hover:!bg-blue-500 transition-colors";

// Parallel's signature color — analogous to how compound states default to
// blue via SCXMLStateNode's getStateCharacteristics(), parallel gets its own
// consistent violet identity (used here, in the ⚡ badge, and icon elsewhere).
const PARALLEL_COLOR = "#7c3aed";
const PARALLEL_BG = "#f3e8ff";

export interface ParallelWrapperNodeProps extends NodeProps<SCXMLStateNodeData> {}

export const ParallelWrapperNode = memo<ParallelWrapperNodeProps>(
  ({ data }) => {
    const { label, onDelete, onNavigateInto, onAddRegion } =
      data as SCXMLStateNodeData & {
        onAddRegion?: () => void;
      };
    // Suppressed when this parallel is itself shown as someone else's
    // (collapsed) region — only the outermost, currently-visible wrapper is
    // independently connectable, same reasoning as plain regions.
    const isParallelRegion = Boolean((data as any).isParallelRegion);
    const width = (data as any).width || 240;
    const height = (data as any).height || 160;

    return (
      <div
        // Only navigable when this parallel is itself a collapsed region —
        // that's the only case where entering it reveals something that
        // isn't already visible (its own pre-existing regions). Drilling
        // into an already auto-expanded top-level wrapper is disallowed
        // entirely: its regions are already shown right here, so entering
        // it would only produce a flattened view with nothing new in it.
        onClick={isParallelRegion ? () => onNavigateInto?.() : undefined}
        style={{
          width,
          height,
          boxSizing: "border-box",
          position: "relative",
          borderStyle: "dashed",
          borderWidth: "2px",
          borderColor: PARALLEL_COLOR,
          background: `linear-gradient(135deg, ${PARALLEL_BG} 0%, ${PARALLEL_BG}99 50%, ${PARALLEL_BG}66 100%)`,
          // Must stay 'visible', not the isolate/rounded-xl combo's implied
          // clipping — otherwise handles positioned right at the border
          // (top:0/bottom:0/left:0/right:0) get cut in half. Same fix
          // SCXMLStateNode already applies for the identical reason.
          overflow: "visible",
          ...(isParallelRegion && onNavigateInto ? { cursor: "pointer" } : {}),
        }}
        // Same card treatment (rounded corners, shadow/hover, backdrop blur,
        // hover ring) as a compound SCXMLStateNode's default styling.
        className='parallel-wrapper-node group isolate rounded-xl backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-200 hover:z-10 ring-2 ring-opacity-0 hover:ring-opacity-30 ring-violet-400'
      >
        {/* Connection handles for the parallel state as a whole — entering
            or exiting via these represents entering/exiting the entire
            parallel (all regions at once), the idiomatic SCXML pattern.
            Suppressed when this parallel is itself a collapsed region of
            another parallel — that parallel's own wrapper is the only
            connectable point, same as plain regions. */}
        {!isParallelRegion && (
          <>
            <Handle
              type='target'
              position={Position.Top}
              id='top'
              style={{
                left: "50%",
                top: "0",
                transform: "translate(-50%, -50%)",
                zIndex: 10,
              }}
              className={HANDLE_CLASS}
            />
            <Handle
              type='source'
              position={Position.Top}
              id='top'
              style={{
                left: "50%",
                top: "0",
                transform: "translate(-50%, -50%)",
                zIndex: 10,
              }}
              className={HANDLE_CLASS}
            />
            <Handle
              type='target'
              position={Position.Bottom}
              id='bottom'
              style={{
                left: "50%",
                bottom: "0",
                transform: "translate(-50%, 50%)",
                zIndex: 10,
              }}
              className={HANDLE_CLASS}
            />
            <Handle
              type='source'
              position={Position.Bottom}
              id='bottom'
              style={{
                left: "50%",
                bottom: "0",
                transform: "translate(-50%, 50%)",
                zIndex: 10,
              }}
              className={HANDLE_CLASS}
            />
            <Handle
              type='target'
              position={Position.Left}
              id='left'
              style={{
                left: "0",
                top: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 10,
              }}
              className={HANDLE_CLASS}
            />
            <Handle
              type='source'
              position={Position.Left}
              id='left'
              style={{
                left: "0",
                top: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 10,
              }}
              className={HANDLE_CLASS}
            />
            <Handle
              type='target'
              position={Position.Right}
              id='right'
              style={{
                right: "0",
                top: "50%",
                transform: "translate(50%, -50%)",
                zIndex: 10,
              }}
              className={HANDLE_CLASS}
            />
            <Handle
              type='source'
              position={Position.Right}
              id='right'
              style={{
                right: "0",
                top: "50%",
                transform: "translate(50%, -50%)",
                zIndex: 10,
              }}
              className={HANDLE_CLASS}
            />
          </>
        )}

        {/* In-card header (icon + label), matching where a compound state
            renders its header, rather than a badge floating above the
            border — sits within arrangeRegions' reserved top band, above
            where region children are positioned. */}
        <div className='flex items-center space-x-2 px-3 pt-2 pb-1'>
          <span className='text-base leading-none'>⚡</span>
          <span
            className='font-bold text-lg leading-none'
            style={{ color: PARALLEL_COLOR }}
          >
            {label}
          </span>
        </div>

        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className='absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-red-50 border border-gray-200 hover:border-red-300 rounded-lg shadow-sm transition-all duration-200 opacity-0 hover:opacity-100 group-hover:opacity-70 hover:!opacity-100 z-20 cursor-pointer'
            title='Delete parallel state'
          >
            <Trash2 className='h-4 w-4 text-gray-600 hover:text-red-600 transition-colors' />
          </button>
        )}

        {onAddRegion && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddRegion();
            }}
            style={{
              // Starts exactly at the wrapper's own bottom edge (top: 100%)
              // plus a small gap, so it renders entirely below the border in
              // free canvas space — region content fills the interior right
              // up to the bottom padding, so any inside-the-box bottom-right
              // position risks being covered by the last region again.
              position: "absolute",
              top: "calc(100% - 5px)",
              right: "8px",
              zIndex: 10,
            }}
            className='bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer shadow-sm'
            title='Add region'
          >
            + Region
          </button>
        )}
      </div>
    );
  },
);

ParallelWrapperNode.displayName = "ParallelWrapperNode";
