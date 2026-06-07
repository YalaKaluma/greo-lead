import { useEffect, useState } from 'react';
import axios from 'axios';

const UNLOCKED_BELTS = new Set(['yellow', 'green', 'brown', 'black']);

export function useYellowBeltUnlock(apiUrl, userNumber) {
  const [currentBelt, setCurrentBelt] = useState('white');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadBeltStatus = async () => {
      if (!apiUrl || !userNumber) {
        setCurrentBelt('white');
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const response = await axios.get(`${apiUrl}/api/journey/belt-readiness/status`, {
          params: { user_number: userNumber }
        });
        if (!cancelled) {
          setCurrentBelt((response.data?.current_belt || 'white').toLowerCase());
        }
      } catch (error) {
        console.error('Error loading belt unlock status:', error);
        if (!cancelled) {
          setCurrentBelt('white');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadBeltStatus();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, userNumber]);

  return {
    currentBelt,
    loading,
    isYellowBeltOrAbove: UNLOCKED_BELTS.has(currentBelt)
  };
}
