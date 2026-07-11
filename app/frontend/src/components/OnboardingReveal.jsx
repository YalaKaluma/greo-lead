import { useEffect, useState } from 'react';

const STEPS = [
  ['my-goals', 'Your vision', 'I translated your ambition into a primary vision, strategic pillars, and concrete outcomes.'],
  ['todo-list', 'Your first actions', 'These are the actions I believe will create useful momentum now. They are due today so you can begin immediately.'],
  ['my-habits', 'Your operating rhythm', 'I selected only a few routines that can realistically support the leader you want to become.'],
  ['my-journey', 'Your Dojo focus', '']
];

export default function OnboardingReveal({ result, onNavigate, onFinish }) {
  const [index, setIndex] = useState(0);
  const [page, title, defaultBody] = STEPS[index];
  const domains = result?.dojo?.domains || [];
  useEffect(() => { onNavigate(page); }, [index]);
  const body = index === 3
    ? (result?.dojo?.message || `Based on what you shared, I would focus particularly on ${domains.join(' and ') || 'the most relevant areas'} in our curriculum.`)
    : defaultBody;
  return <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] p-4 md:p-6">
    <section className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-slate-950 p-5 text-white shadow-2xl md:p-6">
      <div className="flex items-start gap-4"><img src="/alfred-logo.png" alt="Alfred" className="h-11 w-11 rounded-full border border-amber-300 object-cover" />
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wider text-amber-300">{index + 1} of {STEPS.length}</p><h2 className="mt-1 text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-200">{body}</p>
          {index === 3 && <div className="mt-3 flex flex-wrap gap-2">{domains.map(domain => <span key={domain} className="rounded-full bg-amber-300/15 px-3 py-1 text-xs font-semibold text-amber-200">{domain}</span>)}</div>}
        </div></div>
      <div className="mt-5 flex justify-end"><button type="button" onClick={() => index < 3 ? setIndex(index + 1) : onFinish()} className="rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-300">{index < 3 ? 'Continue' : 'Enter the Dojo'}</button></div>
    </section>
  </div>;
}
