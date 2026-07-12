import { useEffect, useState } from 'react';

const STEPS = [
  ['my-goals', 'Your vision', 'Great leadership starts with a clear destination. This page is where Alfred turns your ambition into a primary vision, strategic pillars, and concrete outcomes so you can see how direction connects to progress. You can find here the strategic goal we briefly discussed earlier, which I divided into strategic pillars that you can see when you click on your goal. Of course this is only a first draft and we will refine this together.\nFor your reference, I also included a couple of goals most frequently used by my clients. Feel free to review, adjust, or delete them.'],
  ['todo-list', 'Your first actions', 'Big goals are achieved through small actions repeated consistently. I created a first set of goal-related actions plus general onboarding tasks you should complete next so your operating system is fully set up. I also prioritized the list so the most impactful tasks come on top. Whenever you need help prioritizing, do not hesitate to click Prioritize Task in the upper right corner. I am here to help.'],
  ['my-habits', 'Your operating rhythm', 'Transformation rarely comes from a single breakthrough. It comes from consistent actions repeated over time. This section allows you to track and build the habits that will make you successful. Based on our initial conversation, I selected only a few routines that can realistically support the leader you want to become and help you build energy, discipline, reflection, and weekly focus. I also included some of the most frequent habits my other clients use to inspire you.'],
  ['my-journey', 'Your Dojo focus', '']
];

export default function OnboardingReveal({ result, userNumber, onNavigate, onFinish }) {
  const [index, setIndex] = useState(0);
  const [page, title, defaultBody] = STEPS[index];
  const domains = result?.dojo?.domains || [];
  useEffect(() => {
    if (userNumber) {
      localStorage.setItem(`page_intro_seen_v4:${userNumber}:${page}`, 'true');
    }
    onNavigate(page);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('alfred:onboarding-reveal-page', { detail: { page } }));
    }, 0);
  }, [index, page, userNumber, onNavigate]);
  const dojoFocus = result?.dojo?.message || `Based on what you shared, I would focus particularly on ${domains.join(' and ') || 'the most relevant areas'}.`;
  const body = index === 3
    ? `Welcome to the Leadership Dojo. Your wheel, exercises, and belt journey are ready for you. ${dojoFocus} Start with the early trials, gather evidence through real action, and unlock deeper leadership assessments as you progress.`
    : defaultBody;
  return <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] p-4 md:p-6">
    <section className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-slate-950 p-5 text-white shadow-2xl md:p-6">
      <div className="flex items-start gap-4"><img src="/alfred-logo.png" alt="Alfred" className="h-11 w-11 rounded-full border border-amber-300 object-cover" />
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wider text-amber-300">{index + 1} of {STEPS.length}</p><h2 className="mt-1 text-xl font-semibold">{title}</h2><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-200">{body}</p>
          {index === 3 && <div className="mt-3 flex flex-wrap gap-2">{domains.map(domain => <span key={domain} className="rounded-full bg-amber-300/15 px-3 py-1 text-xs font-semibold text-amber-200">{domain}</span>)}</div>}
        </div></div>
      <div className="mt-5 flex justify-end"><button type="button" onClick={() => index < 3 ? setIndex(index + 1) : onFinish()} className="rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-300">{index < 3 ? 'Continue' : 'Enter the Dojo'}</button></div>
    </section>
  </div>;
}
