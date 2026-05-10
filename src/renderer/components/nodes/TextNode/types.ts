export interface TextState {
  content: string;
  fontSize?: number;
}

export interface TextConfig {
  placeholder?: string;
}

export const defaultTextState = (): TextState => ({
  content: '',
  fontSize: 18,
});

export const defaultTextConfig = (): TextConfig => ({
  placeholder: 'Start writing…',
});
