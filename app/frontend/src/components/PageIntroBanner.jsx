import { useEffect, useState } from 'react';

const PAGE_INTROS = {
  'my-goals': {
    title: 'Goals',
    body: 'This page keeps your longer-term direction in one place. Use it to review what matters, break big aims into smaller outcomes, and connect work back to the bigger picture.'
  },
  'todo-list': {
    title: 'Tasks',
    body: 'This page is for the work that needs action. You can add tasks, sort priorities, track due dates, and connect items to the goals they support.'
  },
  'my-team': {
    title: 'Team',
    body: 'This page helps you keep track of the people around your work. Use it to remember responsibilities, follow-ups, strengths, and useful context for each person.'
  },
  'my-journey': {
    title: 'Leadership Journey',
    body: 'This page collects the patterns and reflections that shape your leadership over time. It gives you a place to see growth areas, lessons, and recurring themes.'
  },
  'my-habits': {
    title: 'Habits',
    body: 'This page tracks routines that support your energy and consistency. Use it for small repeated practices that help your leadership work become easier to maintain.'
  },
  'coaching-sessions': {
    title: 'Coaching Sessions',
    body: 'This page is where coaching conversations and reflections live. Use it to revisit ideas, capture useful observations, and keep continuity between sessions.'
  },
  'my-journal': {
    title: 'Journal',
    body: 'This page is for private reflection and notes. Use it to capture what happened, what you noticed, and what you may want to return to later.'
  },
  settings: {
    title: 'Settings',
    body: 'This page controls your account preferences. Use it to adjust details such as language and other options that shape how the app works for you.'
  }
};

export default function PageIntroBanner({ pageId }) {
  const intro = PAGE_INTROS[pageId];
  const storageKey = intro ? `page_intro_seen:${pageId}` : null;
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
