const CENTER = { x: 500, y: 500 };
const R_CENTER = 116;
const R_DOMAIN = 240;
const R_SUBDOMAIN = 380;
const R_BELT = 412;

const BELTS = [
  { id: "white", name: "White Belt", shortName: "White", meaning: "Awareness", color: "#F8FAFC", text: "#111827" },
  { id: "yellow", name: "Yellow Belt", shortName: "Yellow", meaning: "Self-understanding", color: "#FACC15", text: "#111827" },
  { id: "green", name: "Green Belt", shortName: "Green", meaning: "Integration", color: "#22C55E", text: "#ffffff" },
  { id: "brown", name: "Brown Belt", shortName: "Brown", meaning: "Multiplication", color: "#92400E", text: "#ffffff" },
  { id: "black", name: "Black Belt", shortName: "Black", meaning: "Transformation", color: "#111827", text: "#ffffff" },
];

const BELT_IDS = BELTS.map((belt) => belt.id);
const VISIBLE_BELTS = BELTS.filter((belt) => belt.id !== "black");

const BELT_GUIDE = [
  {
    id: "white",
    earnedBeltId: "yellow",
    statement: "I see the pieces.",
    description: "At White Belt, you begin discovering the dimensions that shape your life and leadership.",
    focusIntro: "You begin to explore",
    focus: [
      "Your vision and values",
      "Your relationships",
      "Your execution habits",
      "Your energy patterns",
      "Your growth opportunities",
    ],
    closing: "You are building awareness of the forces that influence your behavior and results.",
    objective: "Awareness",
    keyQuestion: "What are the forces shaping my life and leadership?",
  },
  {
    id: "yellow",
    earnedBeltId: "green",
    statement: "I understand the pieces.",
    description: "At Yellow Belt, you move beyond awareness and begin understanding the patterns behind your behavior.",
    focusIntro: "You begin to understand",
    focus: [
      "Why you make certain decisions",
      "What motivates or drains you",
      "The emotions behind your actions",
      "The recurring patterns in your life",
      "The forces helping or limiting your growth",
    ],
    closing: "You are no longer simply observing yourself. You are learning why you operate the way you do.",
    objective: "Understanding",
    keyQuestion: "Why do I think, feel, and behave this way?",
  },
  {
    id: "green",
    earnedBeltId: "brown",
    statement: "I build the system.",
    description: "At Green Belt, leadership becomes operational. You begin translating insight into action by building systems that support the person you want to become.",
    focusIntro: "You learn to connect",
    focus: [
      "Goals to daily actions",
      "Values to decisions",
      "Energy to performance",
      "Learning to growth",
      "Relationships to leadership impact",
    ],
    closing: "You stop relying on motivation and begin relying on habits, routines, reviews, structures, and deliberate practice. Leadership becomes a system rather than a collection of insights.",
    objective: "Operationalization",
    keyQuestion: "What systems will consistently produce the outcomes I want?",
  },
  {
    id: "brown",
    earnedBeltId: "black",
    statement: "I help others build the system.",
    description: "At Brown Belt, leadership becomes transferable.",
    focusIntro: "You begin to",
    focus: [
      "Develop others intentionally",
      "Share hard-earned wisdom",
      "Create clarity and direction",
      "Build systems that outlast you",
      "Help others grow without dependence",
    ],
    closing: "Leadership is no longer only about your success. It becomes about the growth, capability, and impact you create in others.",
    objective: "Multiplication",
    keyQuestion: "How can I help others grow?",
  },
];

const LEADERSHIP_ARC = BELT_GUIDE.map((guide) => ({
  belt: getBeltById(guide.earnedBeltId || guide.id).name,
  focus: {
    white: "Self-Awareness",
    yellow: "Self-Understanding",
    green: "Personal Operating System",
    brown: "Multiplying Leadership",
  }[guide.id],
}));

const DIMENSIONS = [
  {
    id: "vision",
    name: "Vision",
    brief: "Purpose, values, strengths, and long-term direction.",
    topics: [
      { id: "values", label: "Values", endpoint: "values" },
      { id: "strengths", label: "Strengths", endpoint: "strengths" },
      {
        id: "vision",
        label: "Vision",
        endpoint: "goals",
        filter: (item) => normalizeGoalLevel(item.time_horizon) === "vision",
      },
    ],
  },
  {
    id: "people",
    name: "People",
    brief: "Communication, delegation, inspiration, and trust.",
    topics: [
      { id: "team_composition", label: "Team Composition", endpoint: "people" },
      { id: "inspiration", label: "Inspire", endpoint: "inspiration" },
      { id: "coaching_moments", label: "Coach & Delegate", endpoint: "coaching-moments" },
    ],
  },
  {
    id: "execute",
    name: "Prioritize & Execute",
    brief: "Focus, discipline, prioritization, and delivery.",
    topics: [
      { id: "prioritization", label: "Prioritization", endpoint: "execution-systems", filter: (item) => normalizeCategory(item.category) === "prioritization" },
      { id: "execution_system", label: "Execution System", endpoint: "execution-systems", filter: (item) => normalizeCategory(item.category) !== "prioritization" },
      { id: "procrastination", label: "Procrastination", endpoint: "procrastination-patterns" },
    ],
    mvp: true,
  },
  {
    id: "energy",
    name: "Time & Energy",
    brief: "Recovery, capacity, energy management, and sustainability.",
    topics: [
      { id: "energy_sources", label: "Energy Sources", endpoint: "energy-sources" },
      { id: "energy_drains", label: "Energy Drains", endpoint: "energy-drains" },
      { id: "recovery", label: "Recovery", endpoint: "recovery-methods" },
    ],
  },
  {
    id: "learning",
    name: "Learning & Development",
    brief: "Growth, resilience, reflection, and continuous improvement.",
    topics: [
      { id: "failures", label: "Failures & Scars", endpoint: "failures" },
      { id: "development_opportunities", label: "Development Opportunities", endpoint: "development-areas" },
      { id: "development_plan", label: "Development Plan", endpoint: "opportunities" },
    ],
  },
];

const REDIRECT_TOPICS = {
  vision: { page: "my-goals", label: "Go to Vision" },
  team_composition: { page: "my-team", label: "Go to My Team" },
};

const TOPICS_REQUIRING_TITLES = new Set([
  "values",
  "strengths",
  "energy_sources",
  "energy_drains",
  "development_opportunities",
  "failures",
]);

const COLLAPSIBLE_EVIDENCE_TOPICS = new Set([
  "inspiration",
  "coaching_moments",
  "execution_system",
  "procrastination",
  "development_plan",
]);

const RECOMMENDATION_LABELS = {
  ready_for_promotion: "Ready for promotion",
  almost_ready: "Almost ready",
  not_ready: "Not yet ready",
  needs_more_evidence: "Needs more evidence",
  submitted: "Submitted",
};

const HEATMAP_COLORS = {
  1: "#DC2626",
  2: "#F97316",
  3: "#FACC15",
  4: "#86EFAC",
  5: "#16A34A",
};

const HEATMAP_TEXT = {
  1: "#FFFFFF",
  2: "#111827",
  3: "#111827",
  4: "#064E3B",
  5: "#FFFFFF",
};

const WHY_IT_MATTERS = {
  Values: "Values are the rules you follow when no one is watching. They make trade-offs easier to live with.",
  Strengths: "Leadership impact compounds when you deliberately use what already works.",
  Vision: "Vision names the direction your values and strengths are meant to serve.",
  "Team Composition": "The people around you shape your behavior more than your intentions.",
  Inspire: "Inspiration creates energy and alignment. Without it, leaders end up pushing instead of pulling.",
  "Coach & Delegate": "Coaching and delegation turn effort into leverage and protect your focus.",
  Prioritization: "Every yes quietly creates a no. Prioritization is the ability to say no without guilt.",
  "Execution System": "Willpower does not scale. A clear execution system creates progress without mental overload.",
  Procrastination: "Procrastination is usually a signal of resistance, fear, or misalignment, not laziness.",
  "Energy Sources": "Energy determines the quality of your decisions. Knowing what fuels you protects clarity.",
  "Energy Drains": "Some activities cost more than they appear. Identifying them allows redesign or containment.",
  Recovery: "Recovery is not a reward. It is a prerequisite for sustained leadership.",
  "Failures & Scars": "Unexamined experiences tend to repeat. Reflection turns experience into information.",
  "Development Opportunities": "Growth often hides inside discomfort. Naming it creates direction.",
  "Development Plan": "Insight only compounds when it leads to deliberate action.",
};

const BELT_DOMAIN_PURPOSES = {
  white: {
    vision: {
      purpose: "Discover what truly matters and begin defining your direction.",
      why: "If you do not know where you are going, achievement alone will not create fulfillment.",
    },
    people: {
      purpose: "Develop self-awareness and understand how you show up as a leader.",
      why: "Leadership begins with understanding yourself before trying to influence others.",
    },
    execute: {
      purpose: "Understand the power of discipline and consistent execution.",
      why: "Extraordinary results come from small actions repeated consistently over time.",
    },
    energy: {
      purpose: "Recognize that energy is finite and learn to observe it.",
      why: "Energy is the fuel behind performance, leadership, and fulfillment.",
    },
    learning: {
      purpose: "Learn from failure and turn setbacks into self-knowledge.",
      why: "Growth begins when failures become lessons instead of regrets.",
    },
  },
  yellow: {
    vision: {
      purpose: "Understand the motivations behind your goals and align them with your values.",
      why: "Many people pursue goals that are not truly theirs. Alignment creates meaning and energy.",
    },
    people: {
      purpose: "Understand the impact your behavior has on others.",
      why: "Leadership is measured by impact, not intention.",
    },
    execute: {
      purpose: "Understand the emotional forces that undermine execution.",
      why: "Fear, avoidance, distraction, and perfectionism often sabotage execution more than lack of ability.",
    },
    energy: {
      purpose: "Learn how to restore and renew your energy.",
      why: "Recovery is not a luxury. It is a prerequisite for sustainable performance.",
    },
    learning: {
      purpose: "Identify the recurring patterns, fears, and beliefs limiting growth.",
      why: "What remains unconscious continues to repeat itself.",
    },
  },
  green: {
    vision: {
      purpose: "Align your life, energy, strengths, and goals into a coherent whole.",
      why: "Success becomes sustainable when your priorities reinforce each other instead of competing.",
    },
    people: {
      purpose: "Build capability in others through trust and delegation.",
      why: "Great leaders create independence and growth rather than dependence.",
    },
    execute: {
      purpose: "Build systems that make execution easier and more reliable.",
      why: "Sustainable execution depends on systems, not willpower.",
    },
    energy: {
      purpose: "Invest energy intentionally and protect it through systems.",
      why: "Not everything deserves your energy. High performers allocate it deliberately.",
    },
    learning: {
      purpose: "Transform self-awareness into deliberate growth.",
      why: "Awareness creates insight; deliberate practice creates change.",
    },
  },
  brown: {
    vision: {
      purpose: "Help others discover purpose, alignment, and direction.",
      why: "Leadership reaches a higher level when your clarity helps others find their own.",
    },
    people: {
      purpose: "Multiply leadership by developing others.",
      why: "Leadership scales when you help others become leaders themselves.",
    },
    execute: {
      purpose: "Create operating models that enable teams to execute consistently.",
      why: "Leadership eventually shifts from doing the work to designing how the work gets done.",
    },
    energy: {
      purpose: "Become a source of energy for others.",
      why: "The highest form of energy leadership is elevating the people around you.",
    },
    learning: {
      purpose: "Help others recognize patterns and accelerate growth.",
      why: "The highest expression of wisdom is helping others develop it themselves.",
    },
  },
};

const LEADERSHIP_QUADRANT_LABELS = {
  vision_goals: "Vision",
  vision: "Vision",
  people: "People",
  prioritize_execute: "Prioritize & Execute",
  execute: "Prioritize & Execute",
  learning_development: "Learning & Development",
  learning: "Learning & Development",
  time_energy: "Time & Energy",
  energy: "Time & Energy",
};

const TOPIC_FORM_FIELDS = {
  Values: [
    { name: "title", label: "Title", type: "input" },
    { name: "value_text", label: "Value", type: "textarea", required: true },
    { name: "why", label: "Why it matters", type: "textarea" },
  ],
  Strengths: [
    { name: "title", label: "Title", type: "input" },
    { name: "strength", label: "Strength", type: "textarea", required: true },
    { name: "source", label: "Source", type: "input" },
  ],
  Vision: [
    { name: "title", label: "Title", type: "input" },
    { name: "goal_text", label: "Vision", type: "textarea", required: true },
    { name: "why", label: "Why", type: "textarea" },
    { name: "time_horizon", label: "Level", type: "hidden", defaultValue: "vision" },
  ],
  "Team Composition": [
    { name: "composition_text", label: "Composition", type: "textarea", required: true },
    { name: "team_type", label: "Team type", type: "input" },
    { name: "dynamics", label: "Dynamics", type: "textarea" },
  ],
  Inspire: [
    { name: "title", label: "Title", type: "input" },
    { name: "inspiration_text", label: "How you inspire", type: "textarea", required: true },
    { name: "approach", label: "Approach", type: "textarea" },
    { name: "effectiveness", label: "What works", type: "textarea" },
  ],
  "Coach & Delegate": [
    { name: "title", label: "Title", type: "input" },
    { name: "moment_text", label: "Moment", type: "textarea", required: true },
    { name: "person", label: "Person", type: "input" },
    { name: "outcome", label: "Outcome", type: "textarea" },
    { name: "learning", label: "Learning", type: "textarea" },
  ],
  Prioritization: [
    { name: "title", label: "Title", type: "input" },
    { name: "system_text", label: "System or approach", type: "textarea", required: true },
    { name: "category", label: "Category", type: "input", defaultValue: "prioritization" },
    { name: "effectiveness", label: "Effectiveness", type: "input" },
  ],
  "Execution System": [
    { name: "title", label: "Title", type: "input" },
    { name: "system_text", label: "System or approach", type: "textarea", required: true },
    { name: "category", label: "Category", type: "input" },
    { name: "effectiveness", label: "Effectiveness", type: "input" },
  ],
  Procrastination: [
    { name: "title", label: "Title", type: "input" },
    { name: "pattern_text", label: "Pattern", type: "textarea", required: true },
    { name: "underlying_reason", label: "Underlying reason", type: "textarea" },
    { name: "strategy", label: "Strategy", type: "textarea" },
  ],
  "Energy Sources": [
    { name: "title", label: "Title", type: "input" },
    { name: "source_text", label: "Energy source", type: "textarea", required: true },
    { name: "category", label: "Category", type: "input" },
  ],
  "Energy Drains": [
    { name: "title", label: "Title", type: "input" },
    { name: "drain_text", label: "Energy drain", type: "textarea", required: true },
    { name: "category", label: "Category", type: "input" },
    { name: "mitigation", label: "Mitigation strategy", type: "textarea" },
  ],
  Recovery: [
    { name: "title", label: "Title", type: "input" },
    { name: "method_text", label: "Recovery method", type: "textarea", required: true },
    { name: "category", label: "Category", type: "input" },
    { name: "frequency", label: "Frequency", type: "input" },
  ],
  "Failures & Scars": [
    { name: "title", label: "Title", type: "input" },
    { name: "failure_text", label: "Failure or scar", type: "textarea", required: true },
    { name: "learning", label: "Learning", type: "textarea" },
    { name: "scar", label: "Scar", type: "textarea" },
  ],
  "Development Opportunities": [
    { name: "title", label: "Title", type: "input" },
    { name: "skill", label: "Development area", type: "textarea", required: true },
    { name: "source", label: "Source", type: "input" },
  ],
  "Development Plan": [
    { name: "title", label: "Title", type: "input" },
    { name: "opportunity_text", label: "Opportunity", type: "textarea", required: true },
    { name: "source", label: "Source", type: "input" },
  ],
};

export {
  CENTER,
  R_CENTER,
  R_DOMAIN,
  R_SUBDOMAIN,
  R_BELT,
  BELTS,
  BELT_IDS,
  VISIBLE_BELTS,
  BELT_GUIDE,
  LEADERSHIP_ARC,
  DIMENSIONS,
  REDIRECT_TOPICS,
  TOPICS_REQUIRING_TITLES,
  COLLAPSIBLE_EVIDENCE_TOPICS,
  RECOMMENDATION_LABELS,
  HEATMAP_COLORS,
  HEATMAP_TEXT,
  WHY_IT_MATTERS,
  BELT_DOMAIN_PURPOSES,
  LEADERSHIP_QUADRANT_LABELS,
  TOPIC_FORM_FIELDS
};
