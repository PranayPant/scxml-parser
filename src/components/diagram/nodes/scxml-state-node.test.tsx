import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { SCXMLStateNode } from './scxml-state-node';

const baseProps = {
  id: 'motor_region',
  selected: false,
  type: 'scxmlState',
  zIndex: 0,
  isConnectable: true,
  xPos: 0,
  yPos: 0,
  dragging: false,
} as any;

const renderNode = (ui: React.ReactElement) =>
  render(<ReactFlowProvider>{ui}</ReactFlowProvider>);

describe('SCXMLStateNode — connection handles', () => {
  it('renders its 8 connection handles by default', () => {
    const { container } = renderNode(
      <SCXMLStateNode {...baseProps} data={{ label: 'idle', stateType: 'simple' }} />
    );

    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(8);
  });

  it('suppresses all connection handles when rendered as a parallel region', () => {
    const { container } = renderNode(
      <SCXMLStateNode
        {...baseProps}
        data={{ label: 'motor_region', stateType: 'simple', isParallelRegion: true }}
      />
    );

    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(0);
  });
});
