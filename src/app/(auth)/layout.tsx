import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-6 py-5">
        <Link href="/" className="text-title2 tracking-tight">
          Reviewhere<span className="text-[var(--color-accent)]">.</span>
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
