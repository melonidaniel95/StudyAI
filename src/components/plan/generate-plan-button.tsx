'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { generatePlanAction } from '@/server/actions/planning';

export function GeneratePlanButton({ label = 'Rigenera il piano' }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await generatePlanAction();
          if (!result.ok) {
            toast.error(result.message);
            return;
          }
          toast.success(result.message);
          for (const warning of result.warnings ?? []) {
            toast.warning(warning, { duration: 8000 });
          }
          router.refresh();
        })
      }
    >
      <Wand2 className="h-4 w-4" aria-hidden />
      {label}
    </Button>
  );
}
