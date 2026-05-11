/**
 * Consistent audit/fix console output + exit codes.
 * Exit: 2 = [ERROR] seen, 1 = only [WARN], 0 = clean.
 */

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes('--dry-run') || argv.includes('-n'),
    verbose: argv.includes('--verbose') || argv.includes('-v'),
    /** Fix scripts: apply writes only when --apply is passed (default is dry). */
    apply: argv.includes('--apply'),
  };
}

export function createReporter() {
  const counts = { warn: 0, error: 0, fixable: 0 };
  return {
    warn(msg) {
      counts.warn += 1;
      console.log(`[WARN] ${msg}`);
    },
    error(msg) {
      counts.error += 1;
      console.log(`[ERROR] ${msg}`);
    },
    fixable(msg) {
      counts.fixable += 1;
      console.log(`[FIXABLE] ${msg}`);
    },
    info(msg) {
      console.log(`[INFO] ${msg}`);
    },
    summary(lines) {
      console.log('[SUMMARY]');
      for (const line of lines) {
        console.log(`  ${line}`);
      }
    },
    counts,
    exitCode() {
      if (counts.error > 0) return 2;
      if (counts.warn > 0) return 1;
      return 0;
    },
  };
}
