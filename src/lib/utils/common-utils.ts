export const EVENT_FALLBACK_VALUE = 'ua'
export const BADGE_COLORS: Record<string, string> = { ch: '#F06246', in: '#0AF0E0', out: '#34F216', st: '#ECF00A', [EVENT_FALLBACK_VALUE]: '#bd81ef', cf: '#F5A623', th: '#6EC3F4', dm: '#A0AEC0' };

export function getVariableType(name: string): string {
  if (name.startsWith('conf_')) return 'cf';
  if (name.startsWith('this_')) return 'th';
  return 'dm';
}