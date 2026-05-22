import { colors } from './colors';

/** Shared setup surfaces: practice vs battle (presentation only). */
export const SETUP_MODE = Object.freeze({
  PRACTICE: 'practice',
  BATTLE: 'battle',
});

export const battleAccent = {
  primary: colors.accent,
  soft: colors.accentSoft,
  border: colors.accentBorder,
  text: '#9a3412',
};

export function normalizeSetupMode(mode) {
  return mode === SETUP_MODE.BATTLE ? SETUP_MODE.BATTLE : SETUP_MODE.PRACTICE;
}

export function isBattleSetupMode(mode) {
  return normalizeSetupMode(mode) === SETUP_MODE.BATTLE;
}

export function resolveSetupPresentation(mode) {
  const m = normalizeSetupMode(mode);
  const battle = m === SETUP_MODE.BATTLE;
  return {
    mode: m,
    footerSummaryTitle: battle ? 'Challenge ready' : 'Ready to practice',
    footerStartLabel: battle ? 'Create battle' : 'Start Practice',
    sectionAccent: battle ? battleAccent : null,
  };
}

export const battleSetupSections = {
  subject: {
    title: 'Challenge subject',
    helper: 'Pick the subject for this head-to-head match.',
  },
  topic: {
    title: 'Challenge topic',
    helper: 'Both players get the same questions from this topic — locked when you create the battle.',
  },
  difficulty: {
    title: 'Challenge difficulty',
    helper: 'Difficulty is shared by both players.',
  },
  questions: {
    title: 'Question count',
    helper: 'How many questions each player will answer.',
  },
  timer: {
    title: 'Match timer',
    helper: 'Optional time limit for the whole match.',
  },
};

export function formatBattleRulesSummary(battle) {
  if (!battle) return '';
  const count = battle.questionCount ?? '—';
  const diff =
    battle.difficulty && battle.difficulty !== 'all'
      ? String(battle.difficulty)
      : 'mixed difficulty';
  const timer = formatBattleTimerLabel(battle);
  return `${count}-question ${diff} battle · ${timer}`;
}

export function formatBattleTimerLabel(battle) {
  if (!battle) return 'Untimed match';
  if (battle.timerMode === 'total' && battle.timerSeconds) {
    const minutes = Math.ceil(Number(battle.timerSeconds) / 60);
    return `${minutes}-minute match timer`;
  }
  if (battle.timerMode === 'per_question') return 'Per-question timer';
  return 'Untimed match';
}
