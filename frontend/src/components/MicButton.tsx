import { tr } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { listen, voiceAvailable } from "../native/voice";
import { useToast } from "./ToastProvider";
import { MicIcon } from "./icons";

/** A microphone button: listens in Slovenian and hands over what was said. */
export default function MicButton({
  onText,
  prompt,
  autoStart = false,
  className = "mic-button",
}: {
  onText: (text: string) => void;
  prompt?: string;
  /** Start listening as soon as it appears (the widget's mic button). */
  autoStart?: boolean;
  /** Its look (the Add task card uses its own round button). */
  className?: string;
}) {
  const [listening, setListening] = useState(false);
  const showToast = useToast();
  const started = useRef(false);
  useEffect(() => {
    if (autoStart && !started.current && voiceAvailable()) {
      started.current = true;
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);
  if (!voiceAvailable()) return null;

  async function start() {
    if (listening) return;
    setListening(true);
    try {
      const text = await listen(prompt);
      if (text) onText(text);
    } catch (e) {
      const message = (e as Error)?.message || "";
      if (!/cancel/i.test(message)) showToast({ message: message || tr("Voice input failed.", "Glasovni vnos ni uspel.") });
    } finally {
      setListening(false);
    }
  }

  return (
    <button
      type="button"
      className={`${className} ${listening ? "is-listening" : ""}`}
      onClick={() => void start()}
      aria-label={listening ? tr("Listening…", "Poslušam …") : tr("Say it", "Povej")}
      title={listening ? tr("Listening…", "Poslušam …") : tr("Say it (Slovenian)", "Povej (slovensko)")}
    >
      <MicIcon width={17} height={17} />
    </button>
  );
}
