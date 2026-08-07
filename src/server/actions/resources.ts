'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { resourceSchema } from '@/lib/validation/schemas';
import { MAX_FILE_SIZE, isAllowedMimeType } from '@/lib/uploads';

export interface ResourceActionResult {
  ok: boolean;
  message: string;
  id?: string;
}


export async function createResourceAction(formData: FormData): Promise<ResourceActionResult> {
  const user = await requireUser();

  const topicIds = formData.getAll('topicIds').map(String).filter(Boolean);
  const parsed = resourceSchema.safeParse({
    title: formData.get('title'),
    type: formData.get('type'),
    examId: formData.get('examId') ?? '',
    url: formData.get('url') ?? '',
    author: formData.get('author') ?? '',
    notes: formData.get('notes') ?? '',
    tags: formData.get('tags') ?? '',
    topicIds,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const storagePath = String(formData.get('storagePath') ?? '');
  const fileName = String(formData.get('fileName') ?? '');
  const mimeType = String(formData.get('mimeType') ?? '');
  const fileSize = Number(formData.get('fileSize') ?? 0);

  // Controlli lato server sui file caricati.
  if (storagePath) {
    if (!storagePath.startsWith(`${user.id}/`)) {
      return { ok: false, message: 'Percorso del file non valido.' };
    }
    if (mimeType && !isAllowedMimeType(mimeType)) {
      return { ok: false, message: 'Tipo di file non consentito.' };
    }
    if (fileSize > MAX_FILE_SIZE) {
      return { ok: false, message: 'Il file supera il limite di 50 MB.' };
    }
  }

  if (!storagePath && !parsed.data.url && !['libro', 'appunti'].includes(parsed.data.type)) {
    return { ok: false, message: 'Indica un indirizzo web oppure carica un file.' };
  }

  const supabase = await createClient();
  const tags = (parsed.data.tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const { data, error } = await supabase
    .from('study_resources')
    .insert({
      user_id: user.id,
      exam_id: parsed.data.examId || null,
      title: parsed.data.title,
      type: parsed.data.type,
      url: parsed.data.url || null,
      storage_path: storagePath || null,
      file_name: fileName || null,
      file_size: fileSize || null,
      mime_type: mimeType || null,
      author: parsed.data.author || null,
      notes: parsed.data.notes || null,
      tags,
    })
    .select('id')
    .single();

  if (error) return { ok: false, message: 'Non è stato possibile salvare la risorsa.' };

  const resourceId = (data as { id: string }).id;

  if (topicIds.length > 0) {
    await supabase.from('resource_topic_links').insert(
      topicIds.map((topicId) => ({ user_id: user.id, resource_id: resourceId, topic_id: topicId })),
    );
  }

  revalidatePath('/risorse');
  return { ok: true, message: 'Risorsa salvata.', id: resourceId };
}

export async function deleteResourceAction(resourceId: string): Promise<ResourceActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('study_resources')
    .select('storage_path')
    .eq('id', resourceId)
    .eq('user_id', user.id)
    .maybeSingle();

  const storagePath = (data as { storage_path: string | null } | null)?.storage_path;
  if (storagePath) {
    await supabase.storage.from('study-materials').remove([storagePath]);
  }

  const { error } = await supabase
    .from('study_resources')
    .delete()
    .eq('id', resourceId)
    .eq('user_id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile eliminare la risorsa.' };

  revalidatePath('/risorse');
  return { ok: true, message: 'Risorsa eliminata.' };
}

export async function updateResourceTopicsAction(
  resourceId: string,
  topicIds: string[],
): Promise<ResourceActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  await supabase
    .from('resource_topic_links')
    .delete()
    .eq('user_id', user.id)
    .eq('resource_id', resourceId);

  if (topicIds.length > 0) {
    const { error } = await supabase.from('resource_topic_links').insert(
      topicIds.map((topicId) => ({ user_id: user.id, resource_id: resourceId, topic_id: topicId })),
    );
    if (error) return { ok: false, message: 'Non è stato possibile aggiornare i collegamenti.' };
  }

  revalidatePath('/risorse');
  return { ok: true, message: 'Collegamenti aggiornati.' };
}

/** URL firmato temporaneo per aprire un file privato. */
export async function getResourceUrlAction(resourceId: string): Promise<{ url: string | null }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('study_resources')
    .select('storage_path, url')
    .eq('id', resourceId)
    .eq('user_id', user.id)
    .maybeSingle();

  const resource = data as { storage_path: string | null; url: string | null } | null;
  if (!resource) return { url: null };
  if (resource.storage_path) {
    const { data: signed } = await supabase.storage
      .from('study-materials')
      .createSignedUrl(resource.storage_path, 60 * 10);
    return { url: signed?.signedUrl ?? null };
  }
  return { url: resource.url };
}
