import type { PropsWithChildren } from 'react';

export function PublicLayout({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-dvh flex-col justify-center bg-bg px-5 py-8">
      <main className="mx-auto w-full max-w-sm">{children}</main>
    </div>
  );
}
