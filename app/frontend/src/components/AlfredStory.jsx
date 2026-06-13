import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

const STORY_CONTENT = {
  en: {
    eyebrow: "Alfred's Story",
    title: "What are we solving?",
    paragraphs: [
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
    ]
  },
  fr: {
    eyebrow: "L'histoire d'Alfred",
    title: "Quel problème cherchons-nous à résoudre ?",
    paragraphs: [
      "Je n'ai pas créé Alfred parce que je voulais créer un logiciel.",
      "J'ai créé Alfred parce que j'avais besoin d'aide.",
      "Depuis plus de 20 ans, j'ai travaillé dans des rôles exigeants de leadership et de conseil. En chemin, ma femme et moi avons construit une vie de famille bien remplie avec quatre enfants, poursuivi des carrières ambitieuses et couru après d'innombrables rêves entrepreneuriaux.",
      "L'énergie, la créativité, l'enthousiasme et la vision n'ont jamais été le problème.",
      "L'exécution l'était.",
      "Comme beaucoup de leaders, j'avais plus d'idées que de temps. Plus d'ambitions que de bande passante. Plus d'occasions que je ne pouvais raisonnablement en poursuivre.",
      "Je savais où je voulais aller. Le défi était de rester concentré assez longtemps pour y arriver.",
      "Au fil des années, j'ai tout essayé.",
      "J'ai utilisé d'innombrables applications de listes de tâches. Elles m'aidaient à rester organisé et me donnaient un regain de productivité. Mais elles ne comprenaient jamais vraiment ce qui comptait le plus. Elles pouvaient me dire ce que je devais faire, mais pas ce que je devrais faire.",
      "J'ai aussi travaillé avec des coachs. Beaucoup d'entre eux ont été incroyablement utiles. Mais le coaching exigeait souvent de passer un temps précieux à expliquer mon contexte, mes priorités, mes objectifs et tout ce qui se passait dans ma vie avant même que nous puissions commencer à avancer.",
      "Ce dont j'avais besoin, ce n'était pas un autre outil de productivité.",
      "Et ce n'était pas un autre coach.",
      "J'avais besoin d'un chef de cabinet.",
      "Quelqu'un qui comprenait mes objectifs, mes valeurs, mes engagements, ma famille, mon équipe et mes aspirations.",
      "Quelqu'un qui pouvait m'aider à prioriser.",
      "Quelqu'un qui pouvait me responsabiliser.",
      "Quelqu'un qui pouvait remettre ma réflexion en question.",
      "Quelqu'un qui pouvait m'aider à devenir le leader, le mari, le père, l'entrepreneur et le professionnel que je voulais être.",
      "Bref, j'avais besoin d'un Alfred.",
      "Batman avait Alfred.",
      "Moi, non.",
      "Alors je l'ai construit.",
      "Ce qui a commencé comme une expérience personnelle est peu à peu devenu une partie de ma vie quotidienne. Alfred m'a aidé à clarifier ma vision, à me concentrer sur ce qui faisait vraiment avancer les choses, à bâtir de meilleures habitudes, à réfléchir plus intentionnellement et à rester aligné avec la personne que je voulais devenir.",
      "Avec le temps, j'ai réalisé que je n'étais pas seul.",
      "Chaque dirigeant, entrepreneur, gestionnaire et personne très performante avec qui j'ai parlé semblait faire face au même défi : non pas un manque d'ambition, mais un manque de bande passante.",
      "Non pas un manque de connaissances, mais un manque d'exécution constante.",
      "Non pas un manque d'objectifs, mais un manque de système fiable pour les aider à garder le cap.",
      "C'est pourquoi j'ai décidé de partager Alfred avec d'autres.",
      "Mon espoir est simple.",
      "Si Alfred peut vous aider à gagner en clarté, à rester concentré, à grandir comme leader et à créer un peu plus d'équilibre dans votre vie comme il l'a fait dans la mienne, alors il aura valu la peine d'être construit.",
      "Bienvenue dans Alfred.",
      "Je suis heureux que vous soyez ici."
    ]
  }
};

export default function AlfredStory() {
  const { language } = useLanguage();
  const story = STORY_CONTENT[language] || STORY_CONTENT.en;

  return (
    <section className="min-h-full bg-[#f7f5f0] text-slate-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        <header className="border-b border-slate-300 pb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            {story.eyebrow}
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
            {story.title}
          </h1>
        </header>

        <article className="max-w-3xl text-lg leading-8 text-slate-800 sm:text-xl sm:leading-9">
          {story.paragraphs.map((paragraph, index) => (
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
