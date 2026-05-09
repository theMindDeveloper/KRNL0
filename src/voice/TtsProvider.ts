export interface TtsProvider {
  speak(text: string): Promise<void>;
}
