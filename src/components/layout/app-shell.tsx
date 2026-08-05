'use client';

import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { BottomNav } from './bottom-nav';
import { signOutAction } from '@/server/actions/auth';
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register';
import { OfflineSync } from '@/components/pwa/offline-sync';

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <ServiceWorkerRegister />
      <OfflineSync />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          email={email}
          onSignOut={() => {
            void signOutAction();
          }}
        />
        <main id="contenuto" className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
