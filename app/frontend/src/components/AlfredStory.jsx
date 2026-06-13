import React from 'react';

const STORY_PARAGRAPHS = [
  "I didn't create Alfred because I wanted to build software.",
  "I created Alfred because I needed help.",
  "For more than 20 years, I've worked in demanding leadership and consulting roles. Along the way, my wife and I built a busy family life with four children, pursued ambitious careers, and chased countless entrepreneurial dreams.",
  "Energy, creativity, enthusiasm, and vision were never the problem.",
  "Execution was.",
  "Like many leaders, I had more ideas than time. More ambitions than bandwidth. More opportunities than I could realistically pursue.",
  "I knew where I wanted to go. The challenge was staying focused long enough to get there.",
  "Over the years, I tried everything.",
  "I used countless to-do list applications. They helped me stay organized and gave me a productivity boost. But they never really understood what mattered most. They could tell me what I needed to do, but not what I should do.",
  "I worked with coaches as well. Many of them were incredibly helpful. But coaching often required spending valuable time explaining my context, my priorities, my goals, and everything happening in my life before we could even begin making progress.",
  "What I needed wasn't another productivity tool.",
  "And it wasn't another coach.",
  "I needed a Chief of Staff.",
  "Someone who understood my goals, my values, my commitments, my family, my team, and my aspirations.",
  "Someone who could help me prioritize.",
  "Someone who could hold me accountable.",
  "Someone who could challenge my thinking.",
  "Someone who could help me become the leader, husband, father, entrepreneur, and professional I wanted to be.",
  "In short, I needed an Alfred.",
  "Batman had Alfred.",
  "I didn't.",
  "So I built him.",
  "What started as a personal experiment slowly became part of my daily life. Alfred helped me clarify my vision, focus on what truly moved the needle, build better habits, reflect more intentionally, and stay aligned with the person I wanted to become.",
  "Over time, I realized I wasn't alone.",
  "Every executive, entrepreneur, manager, and high performer I spoke with seemed to face the same challenge: not a lack of ambition, but a lack of bandwidth.",
  "Not a lack of knowledge, but a lack of consistent execution.",
  "Not a lack of goals, but a lack of a trusted system to help them stay on course.",
  "That's why I decided to share Alfred with others.",
  "My hope is simple.",
  "If Alfred can help you gain clarity, stay focused, grow as a leader, and create a little more balance in your life the way it has in mine, then it will have been worth building.",
  "Welcome to Alfred.",
  "I'm glad you're here."
];

export default function AlfredStory() {
  return (
    <section className="min-h-full bg-[#f7f5f0] text-slate-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        <header className="border-b border-slate-300 pb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Alfred's Story
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
            What are we solving?
          </h1>
        </header>

        <article className="max-w-3xl text-lg leading-8 text-slate-800 sm:text-xl sm:leading-9">
          {STORY_PARAGRAPHS.map((paragraph, index) => (
            <p
              key={`${paragraph.slice(0, 24)}-${index}`}
              className={
                paragraph.length < 45
                  ? 'mt-7 font-semibold text-slate-950'
                  : 'mt-7'
              }
            >
              {paragraph}
            </p>
          ))}
        </article>
      </div>
    </section>
  );
}
