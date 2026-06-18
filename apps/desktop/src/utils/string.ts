const ANSI_ESCAPE_SEQUENCE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|[@-_]|\].*?(?:\x07|\x1b\\)|P.*?\x1b\\|X.*?\x1b\\|\^.*?\x1b\\|_.*?\x1b\\)/g;
const OTHER_CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
const BRACKETED_PASTE_WRAPPER = /\x1b\[(?:200|201)~/g;
const OSC_COLOR_FRAGMENT = /(?:^|\s)(?:\d+;(?:rgb:[0-9a-f]+\/[0-9a-f]+\/[0-9a-f]+|\d+;))+/gi;

export const sanitizeSessionName = (name: string): string =>
  name
    .replace(BRACKETED_PASTE_WRAPPER, '')
    .replace(ANSI_ESCAPE_SEQUENCE, '')
    .replace(OSC_COLOR_FRAGMENT, ' ')
    .replace(OTHER_CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

export const inferSessionCreatedAt = (session: { name: string; createdAt?: number | null }): number | null => {
  if (typeof session.createdAt === 'number' && Number.isFinite(session.createdAt)) {
    return session.createdAt;
  }

  const timestampMatch = session.name.match(/^Terminal (\d{10,})$/);
  if (timestampMatch) {
    const inferred = Number(timestampMatch[1]);
    if (Number.isFinite(inferred)) {
      return inferred;
    }
  }

  return null;
};

export const inferSessionLastActiveAt = (session: {
  createdAt?: number | null;
  lastActiveAt?: number | null;
}): number | null => {
  if (typeof session.lastActiveAt === 'number' && Number.isFinite(session.lastActiveAt)) {
    return session.lastActiveAt;
  }

  if (typeof session.createdAt === 'number' && Number.isFinite(session.createdAt)) {
    return session.createdAt;
  }

  return null;
};

export const normalizeSessionCounter = (value?: number | null): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

export const normalizeOptionalDuration = (value?: number | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
};
