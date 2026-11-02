// ADR 0016 — offline task classifier (F21–F23 in docs/06-requirements/todo-node.md).

import { describe, it, expect } from 'vitest';
import {
  BUILTIN_TAGS,
  classifyTask,
  findTag,
  mergeTagLibrary,
  scoreTags,
  slugifyTag,
  stem,
  tagDisplay,
  tokenize,
} from '../../../src/shared/tags/classify';

const LIB = mergeTagLibrary(undefined);

describe('stem / tokenize', () => {
  it('folds plurals and -ing/-ed forms onto one stem', () => {
    expect(stem('meetings')).toBe(stem('meeting'));
    expect(stem('planning')).toBe('plan');
    expect(stem('running')).toBe('run');
    expect(stem('groceries')).toBe('grocery');
    expect(stem('fixed')).toBe('fix');
  });

  it('drops stopwords, numbers and punctuation', () => {
    expect(tokenize('Fix the 3 bugs, in my API!')).toEqual(['fix', 'bug', 'api']);
  });
});

describe('classifyTask — built-in taxonomy', () => {
  const cases: Array<[string, string]> = [
    ['Fix login bug in the API', 'code'],
    ['Refactor board store', 'code'],
    ['Study for the statistics exam', 'study'],
    ['Finish homework sheet 4', 'study'],
    ['Draft blog post about canvases', 'writing'],
    ['Read 20 pages of my book', 'reading'],
    ['Team standup', 'meetings'],
    ['Call with the client about the pitch', 'meetings'],
    ['Reply to emails', 'admin'],
    ['Pay the electricity bill', 'admin'],
    ['Plan next week', 'planning'],
    ['Gym — legs day', 'health'],
    ['Go for a run', 'health'],
    ['Do the laundry', 'chores'],
    ['Buy groceries', 'chores'],
    ['Call mom', 'social'],
    ['Birthday dinner with friends', 'social'],
    ['Sketch logo ideas in Figma', 'creative'],
    ['Practice guitar', 'creative'],
  ];
  for (const [text, tag] of cases) {
    it(`"${text}" → ${tag}`, () => {
      expect(classifyTask(text, LIB)).toBe(tag);
    });
  }

  it('returns null rather than guessing when nothing matches', () => {
    expect(classifyTask('zxqv blorp', LIB)).toBeNull();
    expect(classifyTask('', LIB)).toBeNull();
  });

  it('is deterministic', () => {
    const a = scoreTags('review pr and write docs', LIB);
    const b = scoreTags('review pr and write docs', LIB);
    expect(a).toEqual(b);
  });
});

describe('classifyTask — learning from hand tags', () => {
  it('a hand-tagged example teaches unseen words', () => {
    expect(classifyTask('Krnl0 sprint demo prep', LIB)).not.toBe('study');
    const examples = [{ text: 'Krnl0 sprint review', tag: 'study' }];
    expect(classifyTask('Krnl0 sprint demo prep', LIB, examples)).toBe('study');
  });

  it('a near-duplicate of an example follows the example over keywords', () => {
    // "write" would say Writing; the user filed this exact chore under Admin.
    const examples = [{ text: 'write weekly status report', tag: 'admin' }];
    expect(classifyTask('write weekly status report', LIB)).toBe('writing');
    expect(classifyTask('write weekly status report', LIB, examples)).toBe('admin');
  });

  it('ignores examples whose tag no longer exists', () => {
    expect(classifyTask('zxqv', LIB, [{ text: 'zxqv', tag: 'gone' }])).toBeNull();
  });
});

describe('custom tags', () => {
  const custom = [{ id: 'gaming', label: 'Gaming', color: '#fff' }];
  const lib = mergeTagLibrary(custom);

  it('are appended after the built-ins and memoised by identity', () => {
    expect(lib.length).toBe(BUILTIN_TAGS.length + 1);
    expect(mergeTagLibrary(custom)).toBe(lib);
  });

  it('match on their own label words', () => {
    expect(classifyTask('Gaming night', lib)).toBe('gaming');
  });

  it('match on user keywords', () => {
    const withKw = mergeTagLibrary([{ id: 'gaming', label: 'Gaming', color: '#fff', keywords: ['steam', 'elden'] }]);
    expect(classifyTask('finish elden ring boss', withKw)).toBe('gaming');
  });

  it('never shadow a built-in id', () => {
    const shadow = mergeTagLibrary([{ id: 'code', label: 'Other code', color: '#000' }]);
    expect(shadow.filter((t) => t.id === 'code')).toHaveLength(1);
  });
});

describe('findTag / tagDisplay / slugifyTag', () => {
  it('resolves by id or case-insensitive label', () => {
    expect(findTag(LIB, 'meetings')?.id).toBe('meetings');
    expect(findTag(LIB, 'MEETINGS')?.id).toBe('meetings');
    expect(findTag(LIB, 'Chores')?.id).toBe('chores');
    expect(findTag(LIB, 'nope')).toBeUndefined();
  });

  it('falls back to the raw label for legacy free-text tags', () => {
    expect(tagDisplay(LIB, 'WORK').label).toBe('WORK');
    expect(tagDisplay(LIB, 'code').label).toBe('Code');
  });

  it('slugifies labels into stable ids', () => {
    expect(slugifyTag('  Side Project! ')).toBe('side-project');
  });
});

describe('one hand tag does not spread by a placeholder word', () => {
  it('tagging "task 1" as a meeting leaves "task 2".."task 5" alone', () => {
    const examples = [{ text: 'task 1', tag: 'meetings' }];
    for (const t of ['task 2', 'task 3', 'Task 4', 'task 5']) expect(classifyTask(t, LIB, examples)).toBeNull();
  });
  it('numbers keep "plan 1" and "plan 2" from being near-duplicates', () => {
    const examples = [{ text: 'garden plan 1', tag: 'meetings' }];
    expect(classifyTask('garden plan 2', LIB, examples)).not.toBe('meetings');
  });
});
