import { useEffect, useState } from 'react';
import axios from 'axios';

const BELT_ORDER = ['white', 'yellow', 'green', 'brown', 'black'];

function normalizeBelt(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+belt$/, '')
    .replace(/\s+/g, '_');

  return BELT_ORDER.includes(normalized) ? normalized : 'white';
}

function getHighestBelt(...values) {
  return values
    .map(normalizeBelt)
    .sort((a, b) => BELT_ORDER.indexOf(b) - BELT_ORDER.indexOf(a))[0] || 'white';
}

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
        const [statusResult, latestAssessmentResult] = await Promise.allSettled([
          axios.get(`${apiUrl}/api/journey/belt-readiness/status`, {
            params: { user_number: userNumber }
          }),
          axios.get(`${apiUrl}/api/journey/belt-assessments/latest`, {
            params: { user_number: userNumber }
          })
        ]);

        const readinessStatus = statusResult.status === 'fulfilled' ? statusResult.value.data : null;
        const latestAssessment = latestAssessmentResult.status === 'fulfilled' ? latestAssessmentResult.value.data : null;
        const resolvedBelt = getHighestBelt(
          readinessStatus?.current_belt,
          latestAssessment?.target_belt,
          latestAssessment?.current_belt
        );

        axios.post(`${apiUrl}/api/usage-events`, {
          user_number: userNumber,
          event_type: 'diagnostic',
          page: 'yellow-belt-unlock',
          feature: 'yellow_belt_unlock_state',
          metadata: {
            resolved_belt: resolvedBelt,
            readiness_current_belt: readinessStatus?.current_belt || null,
            readiness_target_belt: readinessStatus?.target_belt || null,
            latest_assessment_current_belt: latestAssessment?.current_belt || null,
            latest_assessment_target_belt: latestAssessment?.target_belt || null,
            latest_assessment_recommendation: latestAssessment?.recommendation || null,
            latest_assessment_accepted_at: latestAssessment?.accepted_at || null,
            status_request_ok: statusResult.status === 'fulfilled',
            latest_assessment_request_ok: latestAssessmentResult.status === 'fulfilled',
          }
        }).catch(() => {
          // Diagnostics should never affect unlock behavior.
        });

        if (!cancelled) {
          setCurrentBelt(resolvedBelt);
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
    isYellowBeltOrAbove: BELT_ORDER.indexOf(currentBelt) >= BELT_ORDER.indexOf('yellow')
  };
}
