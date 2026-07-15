import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { ParallelWrapperNode } from './parallel-wrapper-node';

const baseProps = {
  id: 'running',
  selected: false,
  type: 'scxmlParallel',
  zIndex: 0,
  isConnectable: true,
  xPos: 0,
  yPos: 0,
  dragging: false,
} as any;

// Handle (used for the wrapper's own connection points) requires a
// ReactFlow zustand store ancestor to render at all.
const renderNode = (ui: React.ReactElement) =>
  render(<ReactFlowProvider>{ui}</ReactFlowProvider>);

describe('ParallelWrapperNode', () => {
  it('renders its label and sizes itself to the given width/height', () => {
    renderNode(
      <ParallelWrapperNode
        {...baseProps}
        data={{ label: 'running', stateType: 'parallel', width: 300, height: 200 }}
      />
    );

    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('calls onDelete when the delete button is clicked', () => {
    const onDelete = vi.fn();
    renderNode(
      <ParallelWrapperNode
        {...baseProps}
        data={{ label: 'running', stateType: 'parallel', onDelete }}
      />
    );

    fireEvent.click(screen.getByTitle('Delete parallel state'));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('renders without a delete button when onDelete is not provided', () => {
    renderNode(
      <ParallelWrapperNode
        {...baseProps}
        data={{ label: 'running', stateType: 'parallel' }}
      />
    );

    expect(screen.queryByTitle('Delete parallel state')).not.toBeInTheDocument();
  });

  it('calls onNavigateInto when a collapsed (nested-as-region) wrapper is clicked', () => {
    const onNavigateInto = vi.fn();
    renderNode(
      <ParallelWrapperNode
        {...baseProps}
        data={{
          label: 'inner',
          stateType: 'parallel',
          isParallelRegion: true,
          onNavigateInto,
        }}
      />
    );

    fireEvent.click(screen.getByText('inner').closest('.parallel-wrapper-node')!);
    expect(onNavigateInto).toHaveBeenCalledOnce();
  });

  it('does not navigate when an already auto-expanded (non-region) wrapper is clicked', () => {
    // Drilling into a parallel's own level is disallowed entirely when it's
    // already auto-expanded — its regions are already visible right here,
    // so entering would only show a flattened view with nothing new.
    const onNavigateInto = vi.fn();
    renderNode(
      <ParallelWrapperNode
        {...baseProps}
        data={{ label: 'running', stateType: 'parallel', onNavigateInto }}
      />
    );

    fireEvent.click(screen.getByText('running').closest('.parallel-wrapper-node')!);
    expect(onNavigateInto).not.toHaveBeenCalled();
  });

  it('calls onAddRegion when the add-region button is clicked', () => {
    const onAddRegion = vi.fn();
    renderNode(
      <ParallelWrapperNode
        {...baseProps}
        data={{ label: 'running', stateType: 'parallel', onAddRegion }}
      />
    );

    fireEvent.click(screen.getByTitle('Add region'));
    expect(onAddRegion).toHaveBeenCalledOnce();
  });

  it('renders connection handles for the parallel state as a whole', () => {
    const { container } = renderNode(
      <ParallelWrapperNode
        {...baseProps}
        data={{ label: 'running', stateType: 'parallel' }}
      />
    );

    // 4 positions × 2 (source + target) = 8 handles.
    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(8);
  });

  it('suppresses its own handles when shown as a collapsed region of another parallel', () => {
    const { container } = renderNode(
      <ParallelWrapperNode
        {...baseProps}
        data={{ label: 'inner', stateType: 'parallel', isParallelRegion: true }}
      />
    );

    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(0);
  });
});
