import { useEffect, useState } from 'react';

export default function ReadAloudButton({ text, className = '' }) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleSpeech = () => {
    if (!text?.trim() || typeof window === 'undefined' || !window.speechSynthesis) return;

    if (window.speechSynthesis.speaking && isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  if (!text?.trim() || typeof window === 'undefined' || !window.speechSynthesis) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={toggleSpeech}
      title={isSpeaking ? 'Stop reading' : 'Read aloud'}
      className={`inline-flex h-7 items-center justify-center rounded-full px-2 text-xs transition-colors ${className}`}
    >
      {isSpeaking ? 'Stop' : 'Audio'}
    </button>
  );
}
