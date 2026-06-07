import { useEffect, useState } from 'react';
import pageIntroMessages from '../content/pageIntroMessages';

export default function PageIntroBanner({ pageId }) {
  const intro = pageIntroMessages[pageId];
  const storageKey = intro ? `page_intro_seen_v2:${pageId}` : null;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!storageKey) {
      setIsVisible(false);
      return;
    }

    setIsVisible(localStorage.getItem(storageKey) !== 'true');
  }, [storageKey]);

  if (!intro || !isVisible) {
    return null;
  }

  const dismiss = () => {
    localStorage.setItem(storageKey, 'true');
    setIsVisible(false);
  };

  return (
    <section className="mx-auto mt-4 w-full max-w-7xl px-4 md:mt-6 md:px-6">
      <div className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">About {intro.title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{intro.body}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="h-8 w-8 shrink-0 rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label={`Dismiss ${intro.title} introduction`}
          >
            X
          </button>
        </div>
      </div>
    </section>
  );
}
