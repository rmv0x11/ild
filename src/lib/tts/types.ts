// Shared TTS types, used by both the web (Web Speech API) and native
// (Capacitor @capacitor-community/text-to-speech) providers.

export interface VoiceInfo {
  name: string;
  lang: string;
  local: boolean;
  voiceURI: string;
}

export interface SpeakResult {
  spoke: boolean;
  errorType?: string;
  voice?: VoiceInfo | null;
}
