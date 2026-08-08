'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Eraser, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { generatePlanAction } from '@/server/actions/planning';

/**
 * Due modi di rigenerare:
 *  - normale: sostituisce le attività future non ancora svolte, lasciando
 *    intatte quelle spostate a mano e gli arretrati;
 *  - da zero: elimina tutto ciò che non è stato completato e ricostruisce
 *    il piano da oggi. Serve quando restano residui di piani precedenti.
 */
export function GeneratePlanButton({
  label = 'Rigenera il piano',
  showReset = true,
}: {
  label?: string;
  showReset?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function esegui(reset: boolean) {
    startTransition(async () => {
      const result = await generatePlanAction({ reset });
      if (!result.ok) {
        toast.error(result.message, { duration: 9000 });
        return;
      }
      toast.success(result.message, { duration: 9000 });
      for (const warning of result.warnings ?? []) {
        toast.warning(warning, { duration: 10000 });
      }
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" loading={pending} onClick={() => esegui(false)}>
        <Wand2 className="h-4 w-4" aria-hidden />
        {label}
      </Button>

      {showReset ? (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={pending}>
              <Eraser className="h-4 w-4" aria-hidden />
              Ricostruisci da zero
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ricostruire il piano da oggi?</AlertDialogTitle>
              <AlertDialogDescription>
                Vengono eliminate tutte le attività non completate: quelle future, quelle rimaste
                indietro e anche quelle che avevi spostato o modificato a mano. Il piano viene poi
                ricostruito da oggi sul materiale caricato.
                <br />
                <br />
                <strong>Le sessioni già svolte non vengono toccate</strong>: cronologia, ripassi,
                esercizi e statistiche restano intatti.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Annulla</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault();
                  esegui(true);
                }}
              >
                {pending ? 'Ricostruzione…' : 'Ricostruisci da zero'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
