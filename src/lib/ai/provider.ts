/**
 * Assistente AI: astrazione indipendente dal fornitore.
 *
 * Il provider si sceglie con la variabile d'ambiente `AI_PROVIDER`
 * (anthropic | openai | none). Se non è configurato, l'app continua a
 * funzionare normalmente: tutte le funzioni AI sono facoltative.
 *
 * Nessuna chiave viene mai esposta al client: queste funzioni girano solo
 * sul server.
 */
import 'server-only';

export type AiProvider = 'anthropic' | 'openai' | 'none';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiRequest {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface AiResponse {
  ok: boolean;
  text: string;
  error?: string;
}

const DEFAULT_MODELS: Record<Exclude<AiProvider, 'none'>, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o-mini',
};

export function getProvider(): AiProvider {
  const value = (process.env.AI_PROVIDER ?? 'none').toLowerCase();
  if (value === 'anthropic' || value === 'openai') return value;
  return 'none';
}

export function isAiConfigured(): boolean {
  return getProvider() !== 'none' && Boolean(process.env.AI_API_KEY);
}

export function dailyLimit(): number {
  const value = Number(process.env.AI_DAILY_REQUEST_LIMIT ?? 50);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 50;
}

/**
 * Esegue una richiesta al provider configurato.
 * Non lancia eccezioni: restituisce sempre un risultato leggibile.
 */
export async function callAi(request: AiRequest): Promise<AiResponse> {
  const provider = getProvider();
  const apiKey = process.env.AI_API_KEY;

  if (provider === 'none' || !apiKey) {
    return {
      ok: false,
      text: '',
      error:
        'Assistente AI non configurato. Imposta AI_PROVIDER e AI_API_KEY nel file .env.local per attivarlo. Tutte le altre funzioni di StudyOS restano disponibili.',
    };
  }

  const model = process.env.AI_MODEL || DEFAULT_MODELS[provider];
  const maxTokens = request.maxTokens ?? 1200;

  try {
    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: request.temperature ?? 0.3,
          system: request.system,
          messages: request.messages,
        }),
      });

      if (!response.ok) {
        return { ok: false, text: '', error: `Il servizio AI ha risposto con errore ${response.status}.` };
      }

      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = (data.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n')
        .trim();

      return { ok: true, text };
    }

    // openai
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: request.temperature ?? 0.3,
        messages: [{ role: 'system', content: request.system }, ...request.messages],
      }),
    });

    if (!response.ok) {
      return { ok: false, text: '', error: `Il servizio AI ha risposto con errore ${response.status}.` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    return { ok: true, text };
  } catch {
    return {
      ok: false,
      text: '',
      error: 'Non è stato possibile contattare il servizio AI. Riprova più tardi.',
    };
  }
}

/** Estrae un array JSON dalla risposta del modello, in modo tollerante. */
export function extractJsonArray<T>(text: string): T[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
