import { useMemo, useCallback, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import { useEditorStore } from '@/stores/editor-store';
import { arrangeRegions, type RegionBox } from '@/lib/layout/arrange-regions';

interface UseHierarchyNavigationProps {
  allNodes: Node[];
  allEdges: Edge[];
}

export function useHierarchyNavigation({
  allNodes,
  allEdges,
}: UseHierarchyNavigationProps) {
  const {
    hierarchyState,
    navigateIntoState,
    navigateUp,
    navigateToRoot,
    setVisibleNodes,
  } = useEditorStore();

  // Track root node IDs to detect when a new file is loaded
  const rootNodeIds = useMemo(() => {
    return allNodes
      .filter((node) => !node.parentId)
      .map((n) => n.id)
      .sort()
      .join(',');
  }, [allNodes]);

  // Reset navigation when root nodes change (indicates new file loaded)
  useEffect(() => {
    // When root nodes change and we're not at root, navigate to root
    if (rootNodeIds && hierarchyState.currentPath.length > 0) {
      const currentParentExists = allNodes.some(n => n.id === hierarchyState.currentParentId);
      if (!currentParentExists) {
        navigateToRoot();
      }
    }
  }, [rootNodeIds, hierarchyState.currentPath.length, hierarchyState.currentParentId, allNodes, navigateToRoot]);

  // Filter nodes to only show current hierarchy level. A <parallel> state's
  // direct regions are always pulled in alongside it (kept parentId, real
  // ReactFlow parent/child containment) — everything else stays flat, one
  // level at a time, exactly as before. This does not recurse: a region that
  // is itself a parallel renders collapsed until the user navigates into it.
  const filteredNodes = useMemo(() => {
    if (allNodes.length === 0) return [];

    let visibleNodesList: Node[] = [];

    if (!hierarchyState.currentParentId) {
      visibleNodesList = allNodes.filter((node) => !node.parentId);
    } else {
      visibleNodesList = allNodes.filter(
        (node) => node.parentId === hierarchyState.currentParentId
      );
    }

    const enrich = (node: Node, keepParentId: boolean): Node => {
      const hasChildren = allNodes.some((n) => n.parentId === node.id);
      const isParallel = node.data.stateType === 'parallel';

      return {
        ...node,
        parentId: keepParentId ? node.parentId : undefined,
        type: isParallel ? 'scxmlParallel' : node.type,
        data: {
          ...node.data,
          hasChildren,
          isCompound: hasChildren,
          stateType: node.data.stateType || (hasChildren ? 'compound' : 'simple'),
          onNavigateInto: () => navigateIntoState(node.id),
        },
        style: {
          ...node.style,
          minWidth: 160,
          minHeight: 80,
        },
      };
    };

    const result: Node[] = [];

    // Shared by both pull-in paths below: lay out `regionSources` via
    // arrangeRegions and push each one, enriched, into `result`.
    // `anchorId` is the id of the (already-rendered) wrapper node to attach
    // to via real ReactFlow parent/child containment (parentId + extent:
    // 'parent') — or `undefined` when there is no rendered wrapper to attach
    // to, in which case regions are flattened: absolute-positioned using the
    // same box coordinates, with no parentId/extent. Attaching parentId to a
    // node that isn't present in the returned array crashes ReactFlow, so
    // `undefined` must be used whenever the container itself is hidden.
    const pushRegions = (
      regionSources: Node[],
      boxes: RegionBox[],
      anchorId: string | undefined
    ) => {
      for (const regionSource of regionSources) {
        const box = boxes.find((b) => b.id === regionSource.id)!;
        const enrichedRegion = enrich(regionSource, anchorId !== undefined);
        if (anchorId !== undefined) {
          enrichedRegion.parentId = anchorId;
          (enrichedRegion as any).extent = 'parent';
        }
        // Regions are laid out automatically by arrangeRegions on every
        // render (per the approved design: auto-layout only, no manual
        // drag/resize) — allowing a drag would just be silently overwritten
        // on the next render anyway, and extent:'parent' alone doesn't
        // reliably keep a dragged node inside the wrapper's visual bounds.
        enrichedRegion.draggable = false;
        enrichedRegion.position = { x: box.x, y: box.y };
        enrichedRegion.data = {
          ...enrichedRegion.data,
          width: box.width,
          height: box.height,
          // Only the parallel wrapper itself is connectable from outside —
          // suppresses SCXMLStateNode's handles when this region isn't
          // itself a nested parallel (ParallelWrapperNode keeps its own
          // handles regardless, since entering/exiting a nested parallel as
          // a whole is still legitimate).
          isParallelRegion: true,
        };
        enrichedRegion.style = {
          ...enrichedRegion.style,
          width: box.width,
          height: box.height,
        };
        result.push(enrichedRegion);
      }
    };

    // If we've navigated INSIDE a <parallel> state, the currently visible
    // nodes ARE that state's direct regions. The container itself is not
    // rendered here (same "hidden container" convention as everywhere else
    // in this hook), so the regions must be flattened — absolute-positioned,
    // no parentId — rather than attached to a parent that doesn't exist in
    // the result. Still no recursion: a region here that is itself a
    // parallel stays collapsed until separately navigated into.
    const currentParentNode = hierarchyState.currentParentId
      ? allNodes.find((n) => n.id === hierarchyState.currentParentId)
      : undefined;

    if (currentParentNode?.data.stateType === 'parallel') {
      const { regionBoxes } = arrangeRegions(
        visibleNodesList.map((r) => ({
          id: r.id,
          width: (r.data as any).width || 160,
          height: (r.data as any).height || 80,
        }))
      );

      pushRegions(visibleNodesList, regionBoxes, undefined);

      return result;
    }

    for (const visibleNode of visibleNodesList) {
      const enrichedNode = enrich(visibleNode, false);

      if (visibleNode.data.stateType !== 'parallel') {
        result.push(enrichedNode);
        continue;
      }

      const regionSources = allNodes.filter(
        (n) => n.parentId === visibleNode.id
      );
      const { regionBoxes, wrapperWidth, wrapperHeight } = arrangeRegions(
        regionSources.map((r) => ({
          id: r.id,
          width: (r.data as any).width || 160,
          height: (r.data as any).height || 80,
        }))
      );

      enrichedNode.data = {
        ...enrichedNode.data,
        width: wrapperWidth,
        height: wrapperHeight,
      };
      enrichedNode.style = {
        ...enrichedNode.style,
        width: wrapperWidth,
        height: wrapperHeight,
      };
      result.push(enrichedNode);

      pushRegions(regionSources, regionBoxes, visibleNode.id);
    }

    return result;
  }, [allNodes, hierarchyState.currentParentId, navigateIntoState]);

  // Update visible nodes in store when filtered nodes change
  useEffect(() => {
    const visibleIds = new Set(filteredNodes.map((n) => n.id));
    setVisibleNodes(visibleIds);
  }, [filteredNodes, setVisibleNodes]);

  // Filter edges to only show connections between visible nodes
  const filteredEdges = useMemo(() => {
    if (filteredNodes.length === 0) return [];

    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));

    return allEdges.filter(
      (edge) =>
        visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );
  }, [allEdges, filteredNodes]);

  // Get breadcrumb path for navigation display
  const breadcrumbPath = useMemo(() => {
    if (hierarchyState.currentPath.length === 0) {
      return ['Root'];
    }
    return ['Root', ...hierarchyState.currentPath];
  }, [hierarchyState.currentPath]);

  // Check if we can navigate up
  const canNavigateUp = hierarchyState.currentPath.length > 0;

  // Navigate to a specific level in the breadcrumb
  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      if (index === 0) {
        navigateToRoot();
      } else if (index < hierarchyState.currentPath.length) {
        // Navigate to intermediate level
        const targetPath = hierarchyState.currentPath.slice(0, index);
        const targetParentId = targetPath[targetPath.length - 1] || null;

        // We need to reset to that level
        // For now, we'll navigate up repeatedly
        const stepsUp = hierarchyState.currentPath.length - index;
        for (let i = 0; i < stepsUp; i++) {
          navigateUp();
        }
      }
    },
    [hierarchyState.currentPath, navigateToRoot, navigateUp]
  );

  // Find parent node info for display
  const currentParentNode = useMemo(() => {
    if (!hierarchyState.currentParentId) return null;
    return allNodes.find((n) => n.id === hierarchyState.currentParentId);
  }, [hierarchyState.currentParentId, allNodes]);

  return {
    filteredNodes,
    filteredEdges,
    breadcrumbPath,
    canNavigateUp,
    navigateUp,
    navigateToRoot,
    navigateIntoState,
    navigateToBreadcrumb,
    currentParentNode,
    currentParentId: hierarchyState.currentParentId,
  };
}
