import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "../dropbox/auth";

/**
 * Voice input in Slovenian. The Android app uses the phone's own Google voice
 * input (android/.../voice/VoicePlugin.java); on the website, the browser's
 * speech recognition (Chrome and Edge send it to Google, which knows sl-SI).
 */
const LANGUAGE = "sl-SI";

interface OpravilkoVoicePlugin {
  listen(options: { language: string; prompt?: string }): Promise<{ text: string }>;
}
const OpravilkoVoice = registerPlugin<OpravilkoVoicePlugin>("OpravilkoVoice");

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

function webRecognition(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceAvailable(): boolean {
  return isNativeApp || webRecognition() !== null;
}

/** Listens once and returns what was said (empty if nothing). */
export async function listen(prompt?: string): Promise<string> {
  if (isNativeApp) return (await OpravilkoVoice.listen({ language: LANGUAGE, prompt })).text;
  const Ctor = webRecognition();
  if (!Ctor) throw new Error("This browser has no speech recognition (try Chrome or Edge).");
  return new Promise((resolve, reject) => {
    const rec = new Ctor();
    let heard = "";
    rec.lang = LANGUAGE;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      heard = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
    };
    rec.onerror = (e) =>
      reject(
        new Error(
          e.error === "not-allowed"
            ? "The microphone is blocked for this site."
            : e.error === "no-speech"
              ? "Didn't hear anything."
              : "Voice input failed."
        )
      );
    rec.onend = () => resolve(heard);
    rec.start();
  });
}
