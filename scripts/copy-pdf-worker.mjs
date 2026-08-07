/**
 * Copia pdf.js in public/, così viene caricato a runtime dal browser.
 *
 * L'analisi dei PDF avviene interamente nel client: sia la libreria sia il
 * worker devono essere raggiungibili come file statici, senza passare dal
 * bundler. In questo modo `pdfjs-dist` è una dipendenza facoltativa: se manca,
 * l'app funziona lo stesso e disattiva solo l'importazione del materiale.
 *
 * Viene eseguito automaticamente dopo `npm install`.
 */
import { copyFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');

const targets = [
  {
    nome: 'libreria',
    candidati: ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'node_modules/pdfjs-dist/build/pdf.mjs'],
    destinazione: 'pdf.min.mjs',
  },
  {
    nome: 'worker',
    candidati: [
      'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
      'node_modules/pdfjs-dist/build/pdf.worker.mjs',
    ],
    destinazione: 'pdf.worker.min.mjs',
  },
];

let copiati = 0;

for (const target of targets) {
  for (const candidato of target.candidati) {
    const sorgente = join(root, candidato);
    try {
      await access(sorgente);
      await mkdir(publicDir, { recursive: true });
      await copyFile(sorgente, join(publicDir, target.destinazione));
      copiati += 1;
      break;
    } catch {
      // prova il candidato successivo
    }
  }
}

if (copiati === targets.length) {
  console.log('[studyai] pdf.js copiato in public/: analisi dei PDF attiva.');
} else {
  console.warn(
    '[studyai] pdfjs-dist non trovato: esegui "npm install pdfjs-dist" per attivare l\'importazione del materiale. Il resto dell\'app funziona comunque.',
  );
}
