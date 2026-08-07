# Architettura di StudyAI

Documento delle decisioni tecniche. Il README spiega *come si usa* il progetto; qui si spiega *perché è fatto così*.

---

## 1. Principio guida

Il valore di StudyAI non è nell'interfaccia ma in tre domande a cui deve saper rispondere con onestà:

1. **Che cosa studio oggi?** → motore di pianificazione
2. **Quanto sono davvero preparato?** → calcolo della preparazione
3. **Ce la faccio per quell'appello?** → valutazione di fattibilità

Da qui la scelta strutturale principale: **la logica che risponde a queste domande è isolata in funzioni pure**, in `src/lib/domain/`, senza dipendenze da React, Next.js o Supabase. È l'unica parte del progetto interamente coperta da test, e può essere modificata senza toccare l'interfaccia.

```
UI (React)  →  Server Action  →  lib/domain (pura)  →  risultato
                     ↓
                server/data.ts  →  Supabase
```

---

## 2. Livelli

| Livello | Cartella | Responsabilità | Dipendenze |
| --- | --- | --- | --- |
| Dominio | `src/lib/domain/` | Calcoli, regole, spiegazioni | nessuna (solo `date-fns`) |
| Accesso dati | `src/server/data.ts` | Tutte le letture, aggregazioni in memoria | Supabase, dominio |
| Mutazioni | `src/server/actions/*` | Validazione, scrittura, invalidazione cache | Supabase, dominio, Zod |
| Presentazione | `src/app/`, `src/components/` | Rendering, interazione | livelli precedenti |

Regole rispettate:

- le pagine non chiamano mai Supabase direttamente;
- le Server Action validano **sempre** con Zod, anche se il client ha già validato;
- i componenti client ricevono dati già normalizzati (nessuna forma «riga di database» nella UI, salvo tipi espliciti);
- nessun componente supera le ~500 righe; quelli complessi sono divisi in sotto-componenti nello stesso file solo quando sono strettamente accoppiati.

---

## 3. Perché tipi scritti a mano invece di `supabase gen types`

`src/types/db.ts` contiene i tipi delle righe scritti a mano e allineati alle migrazioni.

- **Pro**: il progetto compila senza dover avere un database attivo, non serve un passaggio di generazione, i tipi sono leggibili e commentati, e si integrano con gli union type del dominio (`TopicStatus`, `ActivityType`…).
- **Contro**: vanno aggiornati a mano quando cambia lo schema.
- **Mitigazione**: `tests/data-isolation.test.ts` legge le migrazioni SQL e verifica che tutte le tabelle esistano, abbiano `user_id` e siano coperte da RLS. Chi preferisce la generazione automatica può sostituire il file mantenendo i nomi esportati.

---

## 4. Il seed è una funzione SQL, non uno script

I dati iniziali sono creati da `public.seed_initial_data()`, una funzione `security definer` che lavora su `auth.uid()`.

Motivi:

- funziona in un contesto **multiutente** senza modifiche: ogni utente ottiene la propria copia;
- è richiamabile dall'onboarding senza chiavi privilegiate lato client;
- è **idempotente**: se l'utente ha già esami non fa nulla;
- non richiede `SUPABASE_SERVICE_ROLE_KEY` nel flusso normale.

L'alternativa (uno script `seed.sql` con un `user_id` scritto a mano) sarebbe stata più fragile e legata a un singolo account.

---

## 5. Il motore di pianificazione

`src/lib/domain/planner.ts` genera il piano **giorno per giorno**, ricalcolando le priorità a ogni giornata dell'orizzonte. È più costoso di un'assegnazione globale, ma permette due comportamenti che il progetto richiede esplicitamente:

- quando un appello è passato, la materia esce dal calcolo e **il tempo passa automaticamente a quella successiva** (per esempio: Elettronica fino al 27/08, poi Metodi);
- le regole «ultimi giorni» (niente argomenti nuovi, spazio alle simulazioni) dipendono dalla distanza dall'appello di quel giorno specifico.

### Ordine di allocazione all'interno di una giornata

1. **Capacità**: minuti disponibili × (1 − margine). Il margine (default 15%) non è mai pianificato.
2. **Selezione delle materie**: punteggio di priorità, al massimo `maxParallelExams` principali; una materia «leggera» (idoneità) può occupare un blocco breve residuo.
3. **Ripartizione**: proporzionale al punteggio, arrotondata a blocchi di 15 minuti, con minimo e massimo di sessione presi dal profilo.
4. **Composizione delle attività**, in quest'ordine: ripassi in scadenza → simulazione (se nella finestra) → correzione errori (se ≥ 3 aperti) → recupero arretrati (max 45 min/giorno) → teoria/esercizi alternati.

### Cosa il motore non fa

Non cambia mai l'appello da solo. Se il lavoro non entra nel tempo disponibile produce un **avviso** che nomina l'appello di riserva, lasciando la decisione all'utente. È una scelta di prodotto, non un limite tecnico.

---

## 6. Preparazione: perché il valore è «smorzato»

Il rischio più concreto di un punteggio di preparazione è essere ottimista. Due accorgimenti:

- **Smorzamento bayesiano** (`dampedRatio`): con pochi tentativi il tasso di successo non può avvicinarsi a 1. Due risposte corrette su due valgono meno del 30%.
- **Affidabilità della stima** (`confidence`): funzione della quantità di dati raccolti. Sotto il 25% l'interfaccia scrive «dati insufficienti» invece di mostrare una percentuale che sembrerebbe affidabile.

Inoltre la copertura del programma non deriva dal fatto che un argomento sia stato «aperto»: lo stato `in_corso` vale 0,35 e la padronanza misurata pesa per il 40% del valore di ogni argomento.

---

## 7. Ripetizione dilazionata semplificata

È stato scelto un algoritmo **spiegabile** invece di SM-2 o FSRS completi: sequenza fissa 1-3-7-14-30 con un fattore di facilità limitato a 1,3–3,5. Ogni calcolo restituisce una frase in italiano che spiega la data scelta, e quella frase viene salvata in `review_schedules.reason` e mostrata all'utente. Un sistema che non sai spiegare è un sistema di cui non ti fidi.

---

## 8. Sicurezza a più livelli

1. **Middleware** (`src/middleware.ts`): aggiorna la sessione a ogni richiesta e redirige le route private.
2. **Layout server** (`src/app/(app)/layout.tsx`): ricontrolla l'utente e lo stato dell'onboarding.
3. **Server Action**: `requireUser()` all'inizio, poi validazione Zod.
4. **Query**: filtro esplicito `.eq('user_id', user.id)` anche quando la RLS sarebbe sufficiente (difesa in profondità).
5. **RLS PostgreSQL**: `enable` + `force` su tutte le tabelle, policy su `auth.uid()`.
6. **Storage**: policy sul primo segmento del percorso, bucket privato, tipi MIME e dimensione controllati sia sul client sia sul server.

Il livello 4 è verificato automaticamente da un test che analizza il codice sorgente.

---

## 9. Offline

Scelte deliberatamente conservative:

- il service worker **non mette mai in cache le richieste verso Supabase**: dati di studio potenzialmente stantii sarebbero peggio dell'assenza di dati;
- le navigazioni usano network-first con fallback alla cache e poi alla pagina `/offline`;
- una sessione conclusa senza rete viene messa in coda in `localStorage` e inviata alla riconnessione;
- la sincronizzazione è **idempotente** grazie a `study_sessions.client_uuid` con indice unico: reinviare la stessa sessione non crea duplicati.

---

## 10. Assistente AI

- L'astrazione in `src/lib/ai/provider.ts` parla direttamente con le API HTTP di Anthropic e OpenAI: nessun SDK, nessun vincolo a un fornitore, nessuna dipendenza aggiuntiva da aggiornare.
- Il provider si sceglie con una variabile d'ambiente; con `none` (valore predefinito) l'app funziona in tutto e per tutto.
- Tutti i contenuti generati entrano nel database con `source = 'ai'` e `needs_verification = true`, e **solo dopo una conferma esplicita** dell'utente.
- La padronanza di un argomento non viene mai modificata dall'AI senza conferma.
- Limite giornaliero per utente in `ai_usage`, controllato prima di ogni chiamata.

---

## 11. Interfaccia

- **Mobile-first**: sidebar su desktop (≥ 1024 px), barra inferiore a 5 voci su mobile con «Altro» in un dialogo.
- **Palette**: blu ardesia (principale), azzurro polvere (secondario), ocra caldo (evidenziazioni), beige chiaro (sfondo), antracite (testo e modalità scura). Definita con variabili CSS HSL, quindi la modalità scura è un semplice cambio di variabili.
- **Colori di rischio mai da soli**: `RiskBadge` accompagna sempre il colore con un'icona e un'etichetta testuale (verificato da un test).
- **Poche informazioni per schermata**: la pagina «Oggi» mostra quattro numeri e l'elenco delle attività; il resto è a un clic di distanza.
- **Spiegazioni sempre disponibili**: ogni percentuale ha un tooltip o un blocco che ne descrive il calcolo.

---

## 12. Limitazioni note e prossimi passi

| Ambito | Stato attuale | Possibile evoluzione |
| --- | --- | --- |
| Prerequisiti tra argomenti | Tabella `topic_prerequisites` presente; il motore accetta `blockedBy` ma la UI non permette ancora di impostarli | Aggiungere la gestione nella scheda Programma |
| `readiness_snapshots` | Tabella e tipi pronti; la preparazione è ricalcolata a ogni richiesta | Salvare uno snapshot giornaliero per il grafico storico |
| Notifiche | Notifiche del browser a app aperta | Web Push con VAPID e notifiche programmate lato server |
| Riordino moduli | Riordino argomenti con trascinamento e frecce; per i moduli esiste l'azione server | Esporre il trascinamento anche per i moduli |
| Simulazioni | Configurazione e registrazione dell'esito | Modalità cronometrata con quesiti guidati |
| Tipi database | Scritti a mano | `supabase gen types typescript` in uno script di CI |
