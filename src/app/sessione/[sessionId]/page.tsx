import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { FocusSession } from './focus-session';
import type { Exam, StudyResource, StudySession, StudyTask, SyllabusTopic } from '@/types/db';

interface SegmentRow {
  id: string;
  title: string;
  page_start: number;
  page_end: number;
  pages_done: number;
  kind: string;
}

export const metadata: Metadata = { title: 'Sessione di studio' };
export const dynamic = 'force-dynamic';

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const supabase = await createClient();
  const { data } = await supabase
    .from('study_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  const session = data as StudySession | null;
  if (!session) notFound();

  const [{ data: examRow }, { data: topicRow }, { data: taskRow }] = await Promise.all([
    supabase.from('exams').select('*').eq('id', session.exam_id).maybeSingle(),
    session.topic_id
      ? supabase.from('syllabus_topics').select('*').eq('id', session.topic_id).maybeSingle()
      : Promise.resolve({ data: null }),
    session.task_id
      ? supabase.from('study_tasks').select('*').eq('id', session.task_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Blocco di pagine collegato alla sessione, se l'attività nasce dal materiale.
  let segment: SegmentRow | null = null;
  if (session.segment_id) {
    const { data: segmentRow } = await supabase
      .from('resource_segments')
      .select('id, title, page_start, page_end, pages_done, kind')
      .eq('id', session.segment_id)
      .eq('user_id', user.id)
      .maybeSingle();
    segment = (segmentRow as SegmentRow | null) ?? null;
  }

  let resources: StudyResource[] = [];
  if (session.topic_id) {
    const { data: links } = await supabase
      .from('resource_topic_links')
      .select('resource_id')
      .eq('user_id', user.id)
      .eq('topic_id', session.topic_id);
    const ids = ((links ?? []) as Array<{ resource_id: string }>).map((l) => l.resource_id);
    if (ids.length > 0) {
      const { data: res } = await supabase
        .from('study_resources')
        .select('*')
        .eq('user_id', user.id)
        .in('id', ids);
      resources = (res ?? []) as StudyResource[];
    }
  }

  return (
    <main id="contenuto" className="mx-auto w-full max-w-2xl px-4 py-6">
      <FocusSession
        session={session}
        exam={examRow as Exam | null}
        topic={topicRow as SyllabusTopic | null}
        task={taskRow as StudyTask | null}
        resources={resources}
        segment={
          segment
            ? {
                id: segment.id,
                title: segment.title,
                pageStart: segment.page_start,
                pageEnd: segment.page_end,
                pagesDone: segment.pages_done,
              }
            : null
        }
      />
    </main>
  );
}
