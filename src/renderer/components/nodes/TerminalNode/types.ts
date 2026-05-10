export interface TermState {
  sessionId: string | null;
  title: string;
}

export interface TermConfig {
  shell: string;   // 'default' means OS default
  fontSize: number; // default 13
}

export function defaultTermState(): TermState {
  return { sessionId: null, title: 'Terminal' };
}

export function defaultTermConfig(): TermConfig {
  return { shell: 'default', fontSize: 13 };
}
