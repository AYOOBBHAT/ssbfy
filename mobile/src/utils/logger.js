const createNoop = () => () => {};

const devLogger = {
  debug: (...args) => {
    if (__DEV__) {
      console['log'](...args);
    }
  },
  info: (...args) => {
    if (__DEV__) {
      console['log'](...args);
    }
  },
  warn: (...args) => {
    if (__DEV__) {
      console['warn'](...args);
    }
  },
  error: (...args) => {
    if (__DEV__) {
      console['error'](...args);
    }
  },
};

const prodLogger = {
  debug: createNoop(),
  info: createNoop(),
  warn: createNoop(),
  error: createNoop(),
};

const logger = __DEV__ ? devLogger : prodLogger;

export default logger;
