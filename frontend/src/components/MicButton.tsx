import { useState } from "react";
import { listen, voiceAvailable } from "../native/voice";
import { useToast } from "./ToastProvider";
import { MicIcon } from "./icons";

/** A microphone button: listens in Slovenian and hands over what was said. */
export default function MicButton({ onText, prompt }: { onText: (text: string) => void; prompt?: string }) {
  const [listening, setListening] = useState(false);
  const showToast = useToast();
  if (!voiceAvailable()) return null;

  async function start() {
    if (listening) return;
    setListening(true);
    try {
      const text = await listen(prompt);
      if (text) onText(text);
    } catch (e) {
      const message = (e as Error)?.message || "";
      if (!/cancel/i.test(message)) showToast({ message: message || "Voice input failed." });
    } finally {
      setListening(false);
    }
  }

  return (
    <button
      type="button"
      className={`mic-button ${listening ? "is-listening" : ""}`}
      onClick={() => void start()}
      aria-label={listening ? "Listening…" : "Say it"}
      title={listening ? "Listening…" : "Say it (Slovenian)"}
    >
      <MicIcon width={17} height={17} />
    </button>
  );
}
