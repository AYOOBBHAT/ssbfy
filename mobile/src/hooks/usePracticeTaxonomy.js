import { useEffect, useRef, useState } from 'react';
import { getSubjects, getTopicsForSubject } from '../services/noteService';
import { isRequestCancelled } from '../services/api';
import {
  getCachedSubjects,
  getCachedTopicsForSubject,
  getMemoryCachedSubjects,
  getMemoryCachedTopics,
  putCachedSubjects,
  putCachedTopicsForSubject,
} from '../utils/taxonomyCache';

/**
 * Subjects + per-subject topics with memory/AsyncStorage cache (stale-while-revalidate).
 */
export function usePracticeTaxonomy(selectedSubjectId) {
  const [subjects, setSubjects] = useState(() => getMemoryCachedSubjects() || []);
  const [subjectsLoading, setSubjectsLoading] = useState(!getMemoryCachedSubjects());
  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  const subjectsLoadRef = useRef(null);
  const topicsLoadRef = useRef(null);

  useEffect(() => {
    subjectsLoadRef.current?.abort();
    const ac = new AbortController();
    subjectsLoadRef.current = ac;

    (async () => {
      const cached = await getCachedSubjects();
      if (ac.signal.aborted) return;
      if (cached?.length) {
        setSubjects(cached);
        setSubjectsLoading(false);
      } else {
        setSubjectsLoading(true);
      }

      try {
        const data = await getSubjects({ signal: ac.signal });
        if (subjectsLoadRef.current !== ac) return;
        const list = Array.isArray(data?.subjects) ? data.subjects : [];
        setSubjects(list);
        void putCachedSubjects(list);
      } catch (e) {
        if (isRequestCancelled(e) || subjectsLoadRef.current !== ac) return;
        if (!cached?.length) setSubjects([]);
      } finally {
        if (subjectsLoadRef.current === ac) setSubjectsLoading(false);
      }
    })();

    return () => {
      subjectsLoadRef.current?.abort();
      subjectsLoadRef.current = null;
    };
  }, []);

  useEffect(() => {
    topicsLoadRef.current?.abort();
    const ac = new AbortController();
    topicsLoadRef.current = ac;

    if (!selectedSubjectId) {
      setTopics([]);
      setTopicsLoading(false);
      return () => {
        ac.abort();
        topicsLoadRef.current = null;
      };
    }

    const subjectKey = String(selectedSubjectId);

    (async () => {
      const memTopics = getMemoryCachedTopics(subjectKey);
      const cached = memTopics || (await getCachedTopicsForSubject(subjectKey));
      if (ac.signal.aborted) return;
      if (cached?.length) {
        setTopics(cached);
        setTopicsLoading(false);
      } else {
        setTopics([]);
        setTopicsLoading(true);
      }

      try {
        const data = await getTopicsForSubject(subjectKey, { signal: ac.signal });
        if (topicsLoadRef.current !== ac) return;
        const list = Array.isArray(data?.topics) ? data.topics : [];
        setTopics(list);
        void putCachedTopicsForSubject(subjectKey, list);
      } catch (e) {
        if (isRequestCancelled(e) || topicsLoadRef.current !== ac) return;
        if (!cached?.length) setTopics([]);
      } finally {
        if (topicsLoadRef.current === ac) setTopicsLoading(false);
      }
    })();

    return () => {
      ac.abort();
      topicsLoadRef.current = null;
    };
  }, [selectedSubjectId]);

  return { subjects, subjectsLoading, topics, topicsLoading };
}
