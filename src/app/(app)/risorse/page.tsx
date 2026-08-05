import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';
import { getExams, getResourceLinks, getResources, getTopics } from '@/server/data';
import { PageHeader } from '@/components/shared/page-header';
import { ResourceLibrary } from './resource-library';

export const metadata: Metadata = { title: 'Risorse' };
export const dynamic = 'force-dynamic';

export default async function ResourcesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const [resources, exams, topics, links] = await Promise.all([
    getResources(user.id),
    getExams(user.id),
    getTopics(user.id),
    getResourceLinks(user.id),
  ]);

  const linksByResource = new Map<string, string[]>();
  for (const link of links) {
    const list = linksByResource.get(link.resource_id) ?? [];
    list.push(link.topic_id);
    linksByResource.set(link.resource_id, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risorse"
        description="PDF, libri, video, appunti e prove d’esame, collegati agli argomenti del programma."
      />
      <ResourceLibrary
        userId={user.id}
        resources={resources.map((resource) => ({
          id: resource.id,
          title: resource.title,
          type: resource.type,
          url: resource.url,
          storagePath: resource.storage_path,
          fileName: resource.file_name,
          examId: resource.exam_id,
          tags: resource.tags,
          notes: resource.notes,
          topicIds: linksByResource.get(resource.id) ?? [],
        }))}
        exams={exams.map((exam) => ({ id: exam.id, name: exam.short_name ?? exam.name }))}
        topics={topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          examId: topic.exam_id,
        }))}
      />
    </div>
  );
}
