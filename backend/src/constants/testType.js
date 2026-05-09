export const TEST_TYPE = {
  SUBJECT: 'subject',
  POST: 'post',
  TOPIC: 'topic',
  MIXED: 'mixed',
};

/** All values allowed on new Test documents (legacy DB may still hold SUBJECT/POST only). */
export const TEST_TYPE_VALUES = Object.values(TEST_TYPE);
