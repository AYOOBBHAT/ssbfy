/**
 * Clear TestScreen timers/listeners on unmount or after session commit.
 */
export function clearTestSessionTimers(refs) {
  if (refs.draftSaveTimerRef?.current) {
    clearTimeout(refs.draftSaveTimerRef.current);
    refs.draftSaveTimerRef.current = null;
  }
  if (refs.serverSyncTimerRef?.current) {
    clearInterval(refs.serverSyncTimerRef.current);
    refs.serverSyncTimerRef.current = null;
  }
}
