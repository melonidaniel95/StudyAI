'use client';

import Link from 'next/link';
import { LogOut, User } from 'lucide-react';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';
import { ConnectionIndicator } from './connection-indicator';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Topbar({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
      <Link href="/oggi" className="flex items-center gap-2 lg:hidden">
        <Logo size={28} />
        <span className="text-sm font-semibold">StudyAI</span>
      </Link>
      <div className="hidden lg:block" />
      <div className="flex items-center gap-1">
        <ConnectionIndicator />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu profilo">
              <User className="h-5 w-5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate normal-case">{email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/impostazioni">Impostazioni</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSignOut}>
              <LogOut className="h-4 w-4" aria-hidden />
              Esci
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
