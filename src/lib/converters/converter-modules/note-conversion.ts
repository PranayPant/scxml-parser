/**
 * Post-it Note Conversion for SCXML Converter
 *
 * Converts <viz:note> annotation elements (direct children of <scxml>) into
 * React Flow nodes and back-fills persisted ids for legacy notes.
 * Notes bypass ELK layout entirely: they always carry an explicit position
 * and the fixed note size (legacy custom sizes are ignored — migration).
 */

import type { Node } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { VISUAL_METADATA_CONSTANTS } from '@/types/visual-metadata';
import { getAttribute } from './visual-metadata';

const NOTE = VISUAL_METADATA_CONSTANTS.NOTE;

function toNoteArray(scxml: any): any[] {
  const raw = scxml?.[NOTE.ELEMENT_NAME];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/**
 * Extract React Flow nodes for all <viz:note> elements.
 * Notes without a persisted viz:id get a transient positional id
 * ("note:idx-N") that survives exactly one render cycle — ensureNoteIds
 * persists real ids immediately via the initialization write-back.
 */
export function extractNoteNodes(scxml: any): Node[] {
  return toNoteArray(scxml).map((note, index) => {
    const id =
      getAttribute(note, 'viz:id') || `${NOTE.ID_PREFIX}idx-${index}`;

    let x = 100;
    let y = 100;
    const vizXywh = getAttribute(note, 'viz:xywh');
    if (vizXywh && typeof vizXywh === 'string') {
      const parts = vizXywh
        .trim()
        .split(',')
        .map((p) => parseFloat(p.trim()));
      // Use only x,y — stored width/height are ignored so legacy
      // arbitrarily-sized notes migrate to the fixed size.
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        x = parts[0];
        y = parts[1];
      }
    }

    // fast-xml-parser coerces digit-only text content to a number
    const text = note?.['#text'] != null ? String(note['#text']) : '';

    return {
      id,
      type: 'scxmlNote',
      position: { x, y },
      zIndex: -1,
      data: { text },
    };
  });
}

/**
 * Whether any <viz:note> element lacks a persisted viz:id
 */
export function notesNeedIds(scxml: any): boolean {
  return toNoteArray(scxml).some((note) => !getAttribute(note, 'viz:id'));
}

/**
 * Assign persisted viz:id attributes to notes that lack one.
 * Returns the updated SCXML string, or '' when nothing changed or on error.
 */
export function ensureNoteIds(scxmlContent: string): string {
  if (!scxmlContent) return '';

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(scxmlContent, 'text/xml');
    if (doc.querySelector('parsererror')) {
      console.error('XML parsing error in ensureNoteIds');
      return '';
    }

    // getElementsByTagName because CSS selectors cannot match the
    // qualified name of a namespaced element
    const notes = doc.getElementsByTagName(NOTE.ELEMENT_NAME);
    let changed = false;
    for (let i = 0; i < notes.length; i++) {
      if (!notes[i].getAttribute('viz:id')) {
        notes[i].setAttribute(
          'viz:id',
          `${NOTE.ID_PREFIX}${uuidv4().slice(0, 8)}`
        );
        changed = true;
      }
    }

    if (!changed) return '';

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch (error) {
    console.error('Error in ensureNoteIds:', error);
    return '';
  }
}
