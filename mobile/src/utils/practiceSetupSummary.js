import { formatTaxonomyLabel } from './formatTaxonomyLabel';

const DIFFICULTY_LABELS = {
  all: 'All difficulties',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

/**
 * @param {{
 *   count: number,
 *   difficulty: string,
 *   subject?: object|null,
 *   topic?: object|null,
 *   post?: object|null,
 * }} opts
 */
export function buildPracticeSetupSummary({ count, difficulty, subject, topic, post }) {
  const diff =
    difficulty && difficulty !== 'all'
      ? `${DIFFICULTY_LABELS[difficulty] || difficulty} `
      : '';

  let scope = 'mixed subjects';
  if (topic) {
    scope = formatTaxonomyLabel(topic.name || topic.slug);
  } else if (subject) {
    scope = formatTaxonomyLabel(subject.name || subject.slug);
  }

  const postLabel = post
    ? formatTaxonomyLabel(post.name || post.slug || post.title)
    : null;

  const headline = `${count} ${diff}${scope} question${count === 1 ? '' : 's'}`.replace(
    /\s+/g,
    ' '
  );

  const sublines = ['No timer · Practice mode'];
  if (postLabel) {
    sublines.push(`Exam filter: ${postLabel}`);
  }

  return { headline, sublines };
}
