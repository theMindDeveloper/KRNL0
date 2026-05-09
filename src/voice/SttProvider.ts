export interface SttProvider {
  transcribe(audio: Buffer): Promise<string>;
}
