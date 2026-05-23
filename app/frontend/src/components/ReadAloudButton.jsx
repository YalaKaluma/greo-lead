import { useEffect, useRef, useState } from 'react';

export default function ReadAloudButton({ text, apiUrl = '', className = '' }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [voices, setVoices] = useState([]);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);

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

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
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

  const playWithBrowserVoice = () => {
    if (!text?.trim() || typeof window === 'undefined' || !window.speechSynthesis) return;

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

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const toggleSpeech = async () => {
    if (!text?.trim() || typeof window === 'undefined') return;

    if (isSpeaking || isLoading) {
      stopAudio();
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${apiUrl}/api/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error('Speech request failed');
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      audioUrlRef.current = audioUrl;
      const nextAudio = new Audio(audioUrl);
      audioRef.current = nextAudio;

      nextAudio.onended = () => {
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
        audioRef.current = null;
        setIsSpeaking(false);
      };
      nextAudio.onerror = () => {
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
        audioRef.current = null;
        setIsSpeaking(false);
        playWithBrowserVoice();
      };

      setIsSpeaking(true);
      await nextAudio.play();
    } catch (error) {
      console.error('OpenAI TTS playback error:', error);
      playWithBrowserVoice();
    } finally {
      setIsLoading(false);
    }
  };

  if (!text?.trim() || typeof window === 'undefined') {
    return null;
  }

  return (
    <button
      type="button"
      onClick={toggleSpeech}
      title={isSpeaking ? 'Stop Alfred voice' : 'Read aloud with Alfred AI voice'}
      className={`inline-flex h-7 items-center justify-center rounded-full px-2 text-xs transition-colors ${className}`}
    >
      {isLoading ? 'Loading' : isSpeaking ? 'Stop' : 'Audio'}
    </button>
  );
}
