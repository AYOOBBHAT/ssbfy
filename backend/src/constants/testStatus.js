/** Mock test lifecycle — soft disable only (no hard delete for admin retire). */
export const TEST_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
};

export const TEST_STATUS_VALUES = Object.values(TEST_STATUS);

export function isTestDisabled(test) {
  return test?.status === TEST_STATUS.DISABLED;
}
