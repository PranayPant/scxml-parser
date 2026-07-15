import { describe, it, expect } from 'vitest';
import { getStateIdList } from './state-id-extractor';

describe('getStateIdList', () => {
  it('collects ids from state, parallel, and final elements anywhere in the document', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
      <state id="idle"/>
      <parallel id="running">
        <state id="region_1"/>
        <state id="region_2"/>
      </parallel>
      <final id="done"/>
    </scxml>`;

    expect(getStateIdList(xml).sort()).toEqual(
      ['idle', 'running', 'region_1', 'region_2', 'done'].sort()
    );
  });

  it('returns an empty array for a document with no scxml root', () => {
    expect(getStateIdList('<notscxml/>')).toEqual([]);
  });
});
