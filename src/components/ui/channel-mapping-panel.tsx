'use client';

import React, { useMemo } from 'react';
import { extractDatamodelVariables, extractUnresolvedChannelRefs } from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Panel } from '@/components/ui/primitives';

interface ChannelMappingPanelProps {
  isVisible: boolean;
  onClose: () => void;
  scxmlContent: string;
}

export function ChannelMappingPanel({ isVisible, onClose, scxmlContent }: ChannelMappingPanelProps) {
  const channels = useHostAPIStore(state => state.channels);
  const channelMappings = useHostAPIStore(state => state.channelMappings);
  const updateChannelMapping = useHostAPIStore(state => state.updateChannelMapping);

  const channelNames = useMemo(() => channels.map(c => c.name), [channels]);

  const unresolvedRefs = useMemo(() => extractUnresolvedChannelRefs(scxmlContent, channelNames), [scxmlContent, channelNames]);

  const availableOptions = useMemo(() => {
    const datamodelVars = extractDatamodelVariables(scxmlContent).filter(v => !v.startsWith('this_'));
    return Array.from(new Set([...channelNames, ...datamodelVars])).sort();
  }, [scxmlContent, channelNames]);

  const getMapped = (scxmlRef: string) =>
    channelMappings.find(m => m.scxmlRef === scxmlRef)?.mappedChannel ?? '';

  if (!isVisible) return null;

  return (
    <Panel title='Channel Mapping' onClose={onClose}>
      {unresolvedRefs.length === 0 ? (
        <div className='p-4 text-xs text-muted space-y-2'>
          <p>No unresolved channel references found in this SCXML.</p>
          <p>
            Channel references are variable names used in conditions or expressions that are not
            declared in the{' '}
            <code className='bg-muted px-1 rounded'>&lt;datamodel&gt;</code> and do not use
            the <code className='bg-muted px-1 rounded'>this_</code> or{' '}
            <code className='bg-muted px-1 rounded'>conf_</code> prefixes.
          </p>
        </div>
      ) : (
        <table className='w-full text-xs table-fixed'>
          <thead>
            <tr className='bg-muted border-b border-default'>
              <th className='text-left px-3 py-2 text-muted font-medium w-2/5'>SCXML Ref</th>
              <th className='text-left px-3 py-2 text-muted font-medium w-3/5'>Physical Channel</th>
            </tr>
          </thead>
          <tbody>
            {unresolvedRefs.map(ref => (
              <tr key={ref} className='border-b border-default hover:bg-muted'>
                <td className='px-3 py-2 font-mono text-default truncate max-w-0' title={ref}>{ref}</td>
                <td className='px-3 py-2'>
                  {availableOptions.length === 0 ? (
                    <span className='text-dimmed italic'>No channels available</span>
                  ) : (
                    <SearchableSelect
                      value={getMapped(ref)}
                      options={availableOptions}
                      onChange={v => updateChannelMapping(ref, v)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
