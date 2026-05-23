import { useEffect, useState } from 'react';

export default function ReadAloudButton({ text, className = '' }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return undefined;

    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  const getPreferredVoice = () => {
    const englishVoices = voices.filter(voice => voice.lang?.toLowerCase().startsWith('en'));
    const preferredNames = [
      'microsoft david',
      'microsoft mark',
      'microsoft guy',
      'google uk english male',
      'google us english male',
      'daniel',
      'george',
      'david',
      'mark',
      'richard',
      'fred',
      'ralph',
      'alex',
      'tom',
      'guy',
      'microsoft',
      'natural'
    ];

    return preferredNames
      .map(name => englishVoices.find(voice => voice.name.toLowerCase().includes(name)))
      .find(Boolean) || englishVoices[0] || voices[0] || null;
  };

  const toggleSpeech = () => {
    if (!text?.trim() || typeof window === 'undefined' || !window.speechSynthesis) return;

    if (window.speechSynthesis.speaking && isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getPreferredVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = 0.88;
    utterance.pitch = 0.82;
    utterance.volume = 1;
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
