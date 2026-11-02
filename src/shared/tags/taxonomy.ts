// Task tags — built-in taxonomy (ADR 0016).
//
// Mid-level categories: specific enough to tell you where the day went
// ("Code" vs "Meetings"), broad enough that a week of tasks lands in a
// handful of buckets instead of fifty one-off labels. Users can add their
// own on top (TodoState.tagLibrary); built-ins are code constants so they
// never need migrating.
//
// `keywords` are matched after normalisation (see classify.ts → stem), so list
// the base form only: "meeting" also covers "meetings", "fix" covers "fixing".
// `strong` keywords are near-unambiguous and count double.

export interface TagDef {
  /** Stable id — stored on TodoItem.tag and CompletionRecord.tag. */
  id: string;
  /** Display label. */
  label: string;
  /** CSS color (token or hex). */
  color: string;
  keywords?: readonly string[];
  strong?: readonly string[];
  /** true for the code-defined set; custom tags omit it. */
  builtin?: boolean;
}

export const BUILTIN_TAGS: readonly TagDef[] = [
  {
    id: 'code',
    label: 'Code',
    color: 'var(--cyan)',
    builtin: true,
    strong: ['code', 'coding', 'debug', 'refactor', 'deploy', 'commit', 'repo', 'pr', 'bug', 'typescript', 'react', 'python', 'javascript', 'backend', 'frontend', 'api', 'git'],
    keywords: ['fix', 'build', 'implement', 'feature', 'test', 'script', 'merge', 'database', 'sql', 'ci', 'server', 'app', 'component', 'function', 'program', 'dev', 'release', 'electron', 'node', 'css', 'html', 'cli', 'issue'],
  },
  {
    id: 'study',
    label: 'Study',
    color: '#8a7bff',
    builtin: true,
    strong: ['study', 'homework', 'exam', 'lecture', 'course', 'assignment', 'quiz', 'revision', 'semester', 'flashcard', 'tutorial'],
    keywords: ['learn', 'class', 'uni', 'university', 'practice', 'revise', 'lab', 'seminar', 'exercise', 'module', 'grade', 'htw', 'thesis',
      // school subjects on their own ("Physics", "Linear algebra") are study time
      'math', 'maths', 'physics', 'chemistry', 'biology', 'statistics', 'stats', 'calculus', 'algebra', 'history', 'economics', 'german', 'english', 'spanish', 'french', 'language', 'vocab'],
  },
  {
    id: 'writing',
    label: 'Writing',
    color: '#f4d35e',
    builtin: true,
    strong: ['write', 'draft', 'essay', 'blog', 'proofread', 'documentation', 'outline'],
    keywords: ['doc', 'docs', 'report', 'paper', 'article', 'post', 'edit', 'notes', 'summary', 'readme', 'copy', 'newsletter', 'journal'],
  },
  {
    id: 'reading',
    label: 'Reading',
    color: '#5dd3c5',
    builtin: true,
    strong: ['read', 'book', 'novel', 'kindle', 'audiobook'],
    keywords: ['chapter', 'paper', 'article', 'podcast', 'research'],
  },
  {
    id: 'meetings',
    label: 'Meetings',
    color: 'var(--rust)',
    builtin: true,
    strong: ['meeting', 'standup', 'sync', 'interview', 'zoom', '1on1', 'webinar'],
    keywords: ['call', 'meet', 'teams', 'presentation', 'present', 'demo', 'review', 'catchup', 'workshop', 'retro', 'pitch', 'client'],
  },
  {
    id: 'admin',
    label: 'Admin',
    color: '#aab0b7',
    builtin: true,
    strong: ['email', 'inbox', 'invoice', 'tax', 'paperwork', 'insurance', 'bank', 'bill'],
    keywords: ['mail', 'reply', 'pay', 'form', 'renew', 'application', 'apply', 'admin', 'slack', 'message', 'contract', 'sign', 'budget', 'expense', 'visa', 'appointment', 'register', 'account', 'cancel', 'subscription', 'refund'],
  },
  {
    id: 'planning',
    label: 'Planning',
    color: 'var(--acid)',
    builtin: true,
    strong: ['plan', 'planning', 'roadmap', 'prioritize', 'brainstorm', 'backlog'],
    keywords: ['organize', 'goal', 'weekly', 'schedule', 'agenda', 'strategy', 'idea', 'todo', 'triage', 'priorities', 'okr', 'setup'],
  },
  {
    id: 'health',
    label: 'Health',
    color: '#7bd88f',
    builtin: true,
    strong: ['gym', 'workout', 'yoga', 'meditate', 'meditation', 'doctor', 'dentist', 'physio', 'therapy', 'run', 'jog', 'swim'],
    keywords: ['walk', 'exercise', 'stretch', 'sleep', 'nap', 'medication', 'pill', 'vitamin', 'training', 'bike', 'cycle', 'lift', 'cardio', 'hike', 'health', 'water', 'meal', 'diet'],
  },
  {
    id: 'chores',
    label: 'Chores',
    color: 'var(--k-an-warm, #ff8e64)',
    builtin: true,
    strong: ['laundry', 'dishes', 'groceries', 'grocery', 'vacuum', 'clean', 'tidy', 'errand', 'trash'],
    keywords: ['buy', 'shop', 'shopping', 'cook', 'milk', 'food', 'pick', 'pickup', 'repair', 'car', 'return', 'package', 'parcel', 'post', 'pharmacy', 'supermarket', 'wash', 'iron', 'fridge', 'kitchen', 'room', 'house', 'move', 'rent', 'plant'],
  },
  {
    id: 'social',
    label: 'Social',
    color: '#d18bff',
    builtin: true,
    strong: ['mom', 'mum', 'dad', 'family', 'friend', 'birthday', 'party', 'wedding', 'girlfriend', 'boyfriend', 'wife', 'husband', 'grandma', 'grandpa'],
    keywords: ['dinner', 'lunch', 'date', 'visit', 'gift', 'brother', 'sister', 'parents', 'kids', 'hangout', 'drinks', 'coffee', 'text'],
  },
  {
    id: 'creative',
    label: 'Creative',
    color: '#ff6fa8',
    builtin: true,
    strong: ['design', 'draw', 'sketch', 'paint', 'music', 'guitar', 'piano', 'figma', 'blender', 'photography', 'compose'],
    keywords: ['art', 'photo', 'video', 'record', 'song', 'logo', 'illustration', 'animation', 'film', 'edit', 'mockup', 'ui', 'ux', 'craft', 'render', '3d'],
  },
];
