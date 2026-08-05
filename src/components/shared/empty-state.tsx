import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

/** Empty state utile: dice sempre cosa fare come passo successivo. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="border-dashed bg-muted/30 shadow-none">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        {Icon ? (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Icon className="h-6 w-6" aria-hidden />
          </span>
        ) : null}
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
