import AsyncStorage from '@react-native-async-storage/async-storage';

const SUBJECTS_KEY = '@ssbfy/taxonomy_subjects_v1';
const TOPICS_KEY_PREFIX = '@ssbfy/taxonomy_topics_v1:';
const TTL_MS = 24 * 60 * 60 * 1000;

const memory = {
  subjects: null,
  subjectsSavedAt: 0,
  topicsBySubject: new Map(),
};

function isFresh(savedAt) {
  return savedAt > 0 && Date.now() - savedAt < TTL_MS;
}

export function getMemoryCachedSubjects() {
  if (memory.subjects && isFresh(memory.subjectsSavedAt)) {
    return memory.subjects;
  }
  return null;
}

export async function getCachedSubjects() {
  const mem = getMemoryCachedSubjects();
  if (mem) return mem;
  try {
    const raw = await AsyncStorage.getItem(SUBJECTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.subjects) || !isFresh(Number(parsed.savedAt))) return null;
    memory.subjects = parsed.subjects;
    memory.subjectsSavedAt = Number(parsed.savedAt) || 0;
    return parsed.subjects;
  } catch {
    return null;
  }
}

export async function putCachedSubjects(subjects) {
  if (!Array.isArray(subjects)) return;
  const savedAt = Date.now();
  memory.subjects = subjects;
  memory.subjectsSavedAt = savedAt;
  try {
    await AsyncStorage.setItem(SUBJECTS_KEY, JSON.stringify({ savedAt, subjects }));
  } catch {
    // best-effort
  }
}

function topicsMemKey(subjectId) {
  return String(subjectId);
}

export function getMemoryCachedTopics(subjectId) {
  const key = topicsMemKey(subjectId);
  const row = memory.topicsBySubject.get(key);
  if (row && isFresh(row.savedAt)) return row.topics;
  return null;
}

export async function getCachedTopicsForSubject(subjectId) {
  const mem = getMemoryCachedTopics(subjectId);
  if (mem) return mem;
  const key = `${TOPICS_KEY_PREFIX}${topicsMemKey(subjectId)}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.topics) || !isFresh(Number(parsed.savedAt))) return null;
    memory.topicsBySubject.set(topicsMemKey(subjectId), {
      topics: parsed.topics,
      savedAt: Number(parsed.savedAt) || 0,
    });
    return parsed.topics;
  } catch {
    return null;
  }
}

export async function putCachedTopicsForSubject(subjectId, topics) {
  if (!subjectId || !Array.isArray(topics)) return;
  const savedAt = Date.now();
  const memKey = topicsMemKey(subjectId);
  memory.topicsBySubject.set(memKey, { topics, savedAt });
  try {
    await AsyncStorage.setItem(
      `${TOPICS_KEY_PREFIX}${memKey}`,
      JSON.stringify({ savedAt, topics })
    );
  } catch {
    // best-effort
  }
}
