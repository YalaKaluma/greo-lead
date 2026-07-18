import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

export default function VoiceRecorder({
  onTranscript,
  apiUrl = '',
  disabled = false,
  className = '',
  buttonClassName = '',
  size = 'default'
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    return () => {
      stopTracks();
    };
  }, []);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  const transcribeAudio = async (audioBlob) => {
    setIsTranscribing(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      const response = await axios.post(
        `${apiUrl}/api/audio/transcribe`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      const transcript = response.data?.transcript || '';
      if (transcript && onTranscript) {
        onTranscript(transcript);
      }
    } catch (err) {
      console.error('Transcription error:', err);
      setError('Could not transcribe audio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Voice recording is not supported in this browser.');
      return;
    }

    try {
      setError('');
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stopTracks();

        if (audioBlob.size > 0) {
          await transcribeAudio(audioBlob);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      const microphoneErrors = {
        NotAllowedError: 'Microphone permission was denied. Allow microphone access in your browser settings and try again.',
        NotFoundError: 'No microphone was found on this device.',
        NotReadableError: 'The microphone is unavailable or already in use by another application.',
        AbortError: 'Microphone access was interrupted. Please try again.',
        SecurityError: 'Microphone access is blocked by the browser security settings.'
      };
      setError(microphoneErrors[err?.name] || 'Could not access microphone.');
      stopTracks();
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isTranscribing}
        title={isRecording ? 'Stop recording' : 'Record voice'}
        className={`${size === 'compact' ? 'px-3 py-1.5 text-sm' : 'px-4 py-3'} rounded-lg text-white transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed ${buttonClassName} ${
          isRecording
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-gray-600 hover:bg-gray-700'
        }`}
      >
        {isTranscribing ? 'Transcribing...' : isRecording ? 'Stop' : 'Record'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
