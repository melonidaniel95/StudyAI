# Stato di avanzamento — StudyAI

Ultimo aggiornamento: 6 agosto 2026.

---

## Fase 1 — MVP utilizzabile ✅

| Funzione | Stato | Dove |
| --- | --- | --- |
| Registrazione, accesso, logout, recupero password | ✅ | `src/app/(auth)/`, `src/server/actions/auth.ts` |
| Protezione delle route e refresh della sessione | ✅ | `src/middleware.ts`, `src/lib/supabase/middleware.ts` |
| Onboarding guidato in 4 passi con valori precompilati | ✅ | `src/app/onboarding/` |
| Seed automatico: 14 esami, appelli 2026, 8 prerequisiti | ✅ | `supabase/migrations/0004_seed_function.sql` |
| Esami: schede, tabella, filtri, ordinamenti, dettaglio | ✅ | `src/app/(app)/esami/` |
| Appelli: creazione, modifica, principale/riserva, duplicazione, conflitti | ✅ | `src/components/exams/session-manager.tsx` |
| Programma: moduli, argomenti, riordino, modifica inline, importazione | ✅ | `src/components/exams/syllabus-editor.tsx` |
| Disponibilità settimanale e giornate non disponibili | ✅ | `src/app/(app)/impostazioni/` |
| Dashboard «Oggi» con priorità spiegata | ✅ | `src/app/(app)/oggi/` |
| Motore di pianificazione automatico | ✅ | `src/lib/domain/planner.ts` |
| Sessione di studio concentrata e conclusione guidata | ✅ | `src/app/sessione/[sessionId]/` |
| Ripetizione dilazionata con spiegazione | ✅ | `src/lib/domain/spaced-repetition.ts`, `src/app/(app)/ripassi/` |
| Libreria risorse con upload su Storage | ✅ | `src/app/(app)/risorse/` |
| Priorità immediate Elettronica e Metodi | ✅ | seed + motore |

## Fase 2 — Verifica e consolidamento ✅

| Funzione | Stato | Dove |
| --- | --- | --- |
| Quaderno degli errori con 8 tipologie | ✅ | `src/app/(app)/errori/` |
| Errori ricorrenti che alzano la priorità | ✅ | `src/server/actions/errors.ts` |
| Domande aperte e modalità «spiega senza guardare» | ✅ | `src/app/(app)/domande/` |
| Flashcard con ripetizione dilazionata | ✅ | `src/server/actions/practice.ts` |
| Esercizi con autovalutazione e invio automatico agli errori | ✅ | `src/app/(app)/esercizi/` |
| Simulazioni con punteggio, soglia e confronto storico | ✅ | `src/app/(app)/simulazioni/` |
| Calcolo della preparazione configurabile e spiegato | ✅ | `src/lib/domain/readiness.ts` |
| Valutazione di fattibilità a 5 livelli | ✅ | `src/lib/domain/feasibility.ts` |
| Statistiche con grafici accessibili | ✅ | `src/app/(app)/statistiche/` |

## Fase 3 — Funzioni avanzate ✅

| Funzione | Stato | Dove |
| --- | --- | --- |
| Assistente AI indipendente dal fornitore | ✅ | `src/lib/ai/`, `src/server/actions/ai.ts` |
| Modalità «Interrogami» con conferma esplicita | ✅ | `src/app/(app)/assistente/` |
| Importazione intelligente dei programmi | ✅ | `analyzeSyllabusAction` + importazione da testo |
| Calendario giorno/settimana/mese/timeline con trascinamento | ✅ | `src/app/(app)/calendario/` |
| PWA installabile con service worker | ✅ | `public/manifest.webmanifest`, `public/sw.js` |
| Modalità offline e sincronizzazione idempotente | ✅ | `src/components/pwa/offline-sync.tsx` |
| Notifiche del browser previo consenso | ✅ | `src/components/pwa/notification-scheduler.tsx` |
| Riprogrammazione automatica distribuita | ✅ | `src/lib/domain/reschedule.ts` |

## Fase 4 — Pianificazione dal materiale ✅

| Funzione | Stato | Dove |
| --- | --- | --- |
| Caricamento multiplo di slide e dispense | ✅ | `src/components/exams/material-import.tsx` |
| Estrazione di pagine e indice dal PDF nel browser | ✅ | `src/lib/pdf/extract.ts` |
| Divisione in blocchi con intervalli di pagina | ✅ | `src/lib/domain/materials.ts` |
| Stime di tempo da pagine × minuti-per-pagina | ✅ | `estimateMinutes`, `buildSegments` |
| Attività del piano con intervallo di slide | ✅ | `src/lib/domain/planner.ts`, `planning.ts` |
| Pagine coperte registrate a fine sessione | ✅ | `src/app/sessione/[sessionId]/focus-session.tsx` |
| Taratura automatica del ritmo sui tempi reali | ✅ | `calibratePace`, `recalibratePaceAction` |
| Avanzamento in pagine, non in file aperti | ✅ | `src/components/exams/material-overview.tsx` |

## Fase 5 — Icone e analisi AI del materiale ✅

| Funzione | Stato | Dove |
| --- | --- | --- |
| Icona per ogni materia, con proposta automatica dal nome | ✅ | `src/lib/exam-icons.tsx` |
| Selettore di icona nel form esame, 32 icone curate | ✅ | `src/components/exams/exam-form-dialog.tsx` |
| Icone in elenco, dettaglio, Oggi, piano, calendario, dashboard | ✅ | — |
| Testo delle slide estratto durante l'importazione | ✅ | `extractPagesText` in `src/lib/pdf/extract.ts` |
| Densità di formule come indicatore di pesantezza | ✅ | `estimateFormulaDensity` |
| Analisi AI a lotti con avanzamento e interruzione | ✅ | `src/server/actions/material-analysis.ts` |
| Difficoltà del contenuto che corregge le stime del piano | ✅ | `src/server/actions/planning.ts` |
| Domande, esercizi e flashcard generati dal materiale reale | ✅ | `MATERIAL_ANALYSIS_SYSTEM` |

## Identità visiva ✅

| Elemento | Stato |
| --- | --- |
| Logo StudyAI come icona PWA (192, 512, maskable, apple-touch, favicon) | ✅ |
| Logo nella sidebar, nella barra superiore, nell'accesso e nell'onboarding | ✅ |
| Palette allineata ai colori del logo: blu notte #1E3C5A, azzurro #8CBEDC, ambra #E6A01E | ✅ |
| Nome dell'applicazione aggiornato da StudyOS a StudyAI ovunque | ✅ |

---

## Verifiche eseguite

| Controllo | Esito |
| --- | --- |
| `tsc --noEmit` sull'intero sorgente | ✅ 0 errori |
| `next lint` | ✅ nessun errore né avviso |
| Test unitari e di integrazione (Vitest) | ✅ 127 test superati |
| Test di isolamento dati e migrazioni | ✅ 15 test superati |
| Compilazione delle route (dev server) | ✅ nessun errore |
| `next build` | ⚠️ da eseguire in locale: vedi nota |

> **Nota sulla build.** Il progetto è stato sviluppato e verificato in un ambiente con limite di 45 secondi per comando e 2 vCPU: `next build` richiede più tempo di quel limite e non è stato possibile portarlo a termine lì. Typecheck, lint e test sono stati eseguiti integralmente e sono puliti. Esegui `npm run build` in locale come ultima conferma.

---

## Attività ancora aperte

Nessuna funzione richiesta è stata omessa. Restano questi miglioramenti, non bloccanti:

1. **Prerequisiti tra argomenti**: la tabella `topic_prerequisites` e il supporto nel motore (`blockedBy`) esistono; l'analisi AI individua già i prerequisiti (campo `requires`) ma non li scrive ancora nella tabella, quindi il motore non li usa per ordinare gli argomenti.
2. **Snapshot storici di preparazione**: la tabella `readiness_snapshots` è pronta; oggi la preparazione è ricalcolata a ogni richiesta. Uno snapshot giornaliero permetterebbe il grafico dell'andamento nel tempo.
3. **Notifiche push reali**: oggi sono notifiche del browser mostrate ad app aperta. Per i promemoria ad app chiusa servono Web Push e chiavi VAPID.
4. **Trascinamento dei moduli**: gli argomenti si riordinano trascinandoli; per i moduli esiste l'azione server ma non ancora il trascinamento nell'interfaccia.
5. **Simulazione cronometrata guidata**: oggi si configura la prova e si registra l'esito; manca la modalità con timer e quesiti presentati uno alla volta.

---

## Prossimo passo operativo

1. `npm install`
2. Crea il progetto Supabase e applica in ordine i quattro file di `supabase/migrations/`
3. Compila `.env.local` partendo da `.env.example`
4. `npm run build` (conferma finale) e `npm run dev`
5. Registrati, completa l'onboarding: esami, appelli e primo piano vengono creati automaticamente
6. Verifica i due programmi dimostrativi con i programmi ufficiali e togli la marcatura «bozza»
