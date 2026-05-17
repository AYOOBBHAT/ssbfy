/**
 * Shared premium / upgrade copy — keep messaging truthful and consistent
 * across screens. Aligns with product matrix (P0 trust pass).
 */

/** PremiumScreen + marketing — only enforced or clearly planned benefits. */
export const PREMIUM_BENEFITS = [
  'Unlimited full mock tests',
  'Retry completed mocks anytime',
  'Full PDF study library',
  'Save notes and PDFs for quick revision',
];

/** Context line on PremiumScreen keyed by navigation `from`. */
export const PREMIUM_FROM_COPY = {
  limit:
    'You’ve used the included full mock tests on this device. Premium adds unlimited mocks and retries.',
  notes:
    'Notes are free to read. Premium lets you bookmark notes and PDFs for quick revision.',
  pdf: 'Topic notes are free to read. Premium unlocks the full PDF library.',
  'saved-materials':
    'Bookmark notes and PDFs to revisit them anytime during revision.',
  home: 'Upgrade when you’re ready — mocks, PDFs, and saved materials are included with Premium.',
};

export const PREMIUM_HERO_TITLE = 'SSBFY Premium';
export const PREMIUM_HERO_SUB =
  'Unlimited timed mocks, the full PDF library, and saved study materials.';

export const PREMIUM_ACTIVE_SUB =
  'Unlimited mocks, mock retries, PDFs, and saved materials are unlocked.';

export const PREMIUM_SUCCESS_SUB =
  'Unlimited mocks, retries, PDFs, and saved materials are ready when you are.';

/** Shown under API free-mock limit message (Tests list) — keep aligned with mockQuotaCopy. */
export const MOCK_LIMIT_HINT =
  'Premium unlocks unlimited full mock tests and retries on this device. Daily drills and topic practice stay free.';


export { MOCK_LIMIT_CTA } from '../utils/mockQuotaCopy';

/** Home non-premium banner */
export const HOME_PREMIUM_TITLE = 'Explore Premium';
export const HOME_PREMIUM_SUB =
  'Unlimited mocks, full PDF library, and saved study materials.';
export const HOME_PREMIUM_BUTTON = 'See plans';

/** Notes list upsell */
export const NOTES_UPSELL_TITLE = 'Bookmark your notes';
export const NOTES_UPSELL_SUB =
  'Reading is free — Premium saves notes and PDFs for quick revision.';

/** PDF list upsell */
export const PDF_UPSELL_TITLE = 'Full PDF library';
export const PDF_UPSELL_SUB =
  'Topic notes are free to read. Premium unlocks every PDF in your syllabus.';

/** Save / bookmark alerts */
export const SAVE_ALERT_TITLE = 'Save with Premium';
export const SAVE_ALERT_MESSAGE =
  'Bookmark notes and PDFs to revisit them during revision.';

export const PREMIUM_SAVE_MESSAGE =
  'Bookmark notes and PDFs with Premium to save them for later.';

/** Profile saved materials row */
export const SAVED_MATERIALS_ROW_SUB = 'Bookmark notes and PDFs (Premium)';

/** Profile plan card — free tier */
export const PROFILE_FREE_PLAN_SUB =
  'Daily and topic practice are free. Premium adds unlimited mocks, PDFs, and saves.';

export const PROFILE_CTA_SEE_PLANS = 'See plans';
export const PROFILE_CTA_RENEW = 'Renew plan';

/** Home study material row subtitles */
export const HOME_NOTES_SUB = 'Topic-wise notes — free to read';
export const HOME_PDF_SUB = 'Full PDF library — included with Premium';
