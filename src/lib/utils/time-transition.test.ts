import { describe, it, expect } from 'vitest';
import {
  parseAfterSyntax,
  formatAfterSyntax,
  isTimeEventName,
  findTimeEventToken,
  resolveTimeEventDisplay,
} from './time-transition';

describe('parseAfterSyntax', () => {
  it('parses a plain delay in seconds', () => {
    expect(parseAfterSyntax('after 2s')).toEqual({ type: 'delay', value: '2s' });
  });

  it('parses a plain delay in milliseconds', () => {
    expect(parseAfterSyntax('after 714ms')).toEqual({ type: 'delay', value: '714ms' });
  });

  it('parses a bare delayexpr', () => {
    expect(parseAfterSyntax('after conf_wait * 60 * 1000 s')).toEqual({
      type: 'delayexpr',
      value: 'conf_wait * 60 * 1000',
    });
  });

  it('rejects a plain word ending in s with no space before it', () => {
    expect(parseAfterSyntax('after conf_hats')).toBeNull();
  });

  it('rejects a comma-merged event list', () => {
    expect(parseAfterSyntax('after 2s, skippurge')).toBeNull();
  });
});

describe('isTimeEventName', () => {
  it('matches the auto-generated pattern', () => {
    expect(isTimeEventName('Idle_t_0_timeEvent_0')).toBe(true);
  });

  it('rejects a plain event name', () => {
    expect(isTimeEventName('skippurge')).toBe(false);
  });
});

describe('findTimeEventToken', () => {
  it('returns undefined for a plain event', () => {
    expect(findTimeEventToken('skippurge')).toBeUndefined();
  });

  it('returns the token itself for an unmerged time event', () => {
    expect(findTimeEventToken('Idle_t_0_timeEvent_0')).toBe('Idle_t_0_timeEvent_0');
  });

  it('finds the time-event token inside a comma-merged list', () => {
    expect(findTimeEventToken('Lower_oxygen_level_t_0_timeEvent_0, skippurge')).toBe(
      'Lower_oxygen_level_t_0_timeEvent_0'
    );
  });

  it('finds the time-event token regardless of position', () => {
    expect(findTimeEventToken('skippurge, Lower_oxygen_level_t_0_timeEvent_0')).toBe(
      'Lower_oxygen_level_t_0_timeEvent_0'
    );
  });

  it('returns undefined for undefined input', () => {
    expect(findTimeEventToken(undefined)).toBeUndefined();
  });
});

describe('resolveTimeEventDisplay', () => {
  const sendActions = [
    'send|Lower_oxygen_level_t_0_timeEvent_0|delayexpr|conf_wait * 60 * 1000',
  ];
  const findSendAction = (token: string) => sendActions.find((a) => a.startsWith(`send|${token}|`));

  it('resolves a single unmerged time event to its after-X form', () => {
    expect(resolveTimeEventDisplay('Lower_oxygen_level_t_0_timeEvent_0', findSendAction)).toBe(
      'after conf_wait * 60 * 1000 s'
    );
  });

  it('resolves only the time-event token in a merged comma list, leaving others untouched', () => {
    expect(
      resolveTimeEventDisplay('Lower_oxygen_level_t_0_timeEvent_0, skippurge', findSendAction)
    ).toBe('after conf_wait * 60 * 1000 s, skippurge');
  });

  it('returns the original value unchanged when no token is a time event', () => {
    expect(resolveTimeEventDisplay('skippurge, otherEvent', findSendAction)).toBe(
      'skippurge, otherEvent'
    );
  });

  it('leaves a time-event token as-is when no matching send action is found', () => {
    expect(resolveTimeEventDisplay('Unknown_t_0_timeEvent_0, skippurge', findSendAction)).toBe(
      'Unknown_t_0_timeEvent_0, skippurge'
    );
  });
});

describe('formatAfterSyntax', () => {
  it('formats a plain delay', () => {
    expect(formatAfterSyntax('delay', '2s')).toBe('after 2s');
  });

  it('formats a delayexpr with the trailing " s"', () => {
    expect(formatAfterSyntax('delayexpr', 'conf_wait * 60 * 1000')).toBe(
      'after conf_wait * 60 * 1000 s'
    );
  });
});
