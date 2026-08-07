/**
 * Vincoli sui file caricati, condivisi tra client e server.
 *
 * Questi valori NON possono stare in un modulo `'use server'`: quei file
 * possono esportare soltanto funzioni asincrone, e ogni altra esportazione
 * viene sostituita da un riferimento remoto (con errori del tipo
 * «X.join is not a function» quando la si usa nel browser).
 */

/** Tipi MIME accettati dal bucket `study-materials`. */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
] as const;

/** Dimensione massima di un singolo file: 50 MB, come il limite del bucket. */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Elenco pronto per l'attributo `accept` di un input file. */
export const ACCEPT_ATTRIBUTE = ALLOWED_MIME_TYPES.join(',');

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Verifica se un tipo MIME arbitrario è fra quelli accettati. */
export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}
