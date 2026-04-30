const shouldLog = process.env.NODE_ENV !== 'production';

function log(method, ...args) {
  if (!shouldLog) return;
  console[method](...args);
}

export const logger = {
  debug: (...args) => log('log', ...args),
  info: (...args) => log('log', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};
