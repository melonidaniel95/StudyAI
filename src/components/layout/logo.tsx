import { cn } from '@/lib/utils';

/**
 * Marchio dell'applicazione.
 * `variant="simbolo"` mostra solo l'icona, `variant="completo"` icona + nome.
 */
export function Logo({
  size = 36,
  variant = 'simbolo',
  className,
}: {
  size?: number;
  variant?: 'simbolo' | 'completo';
  className?: string;
}) {
  return (
    <img
      src={variant === 'completo' ? '/logo.png' : '/logo-simbolo.png'}
      alt="StudyAI"
      width={size}
      height={size}
      className={cn('object-contain', className)}
      style={{ height: size, width: variant === 'completo' ? 'auto' : size }}
    />
  );
}
