"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, User as UserIcon } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toast";
import { signOut } from "@/lib/firebase/auth";
import { cn, initialsFrom } from "@/lib/utils";

export function UserMenu() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const name = profile?.displayName ?? user.displayName;
  const email = profile?.email ?? user.email;
  const photo = profile?.photoURL ?? user.photoURL;

  async function onSignOut() {
    try {
      await signOut();
      router.push("/");
    } catch {
      toast("Couldn't sign you out. Please try again.", "error");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-surface-secondary text-caption font-semibold text-secondary transition-transform duration-200 active:scale-[0.94]"
      >
        {photo ? (
          // Firebase avatar hosts vary by provider, so skip next/image remote config.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initialsFrom(name, email)
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 z-50 mt-2 w-60 origin-top-right overflow-hidden rounded-md",
            "bg-surface hairline p-1 shadow-[var(--shadow-overlay)]",
          )}
        >
          <div className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="truncate text-callout font-medium text-primary">{name ?? "Your account"}</span>
            {email && <span className="truncate text-caption text-secondary">{email}</span>}
          </div>
          <div className="my-1 h-px bg-[var(--color-border)]" />
          <MenuLink href="/settings" icon={<UserIcon aria-hidden className="size-4" />} onSelect={() => setOpen(false)}>
            Profile
          </MenuLink>
          <MenuLink
            href="/settings#preferences"
            icon={<Settings aria-hidden className="size-4" />}
            onSelect={() => setOpen(false)}
          >
            Preferences
          </MenuLink>
          <div className="my-1 h-px bg-[var(--color-border)]" />
          <button
            type="button"
            role="menuitem"
            onClick={onSignOut}
            className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-callout text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-soft)]"
          >
            <LogOut aria-hidden className="size-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
  onSelect,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className="flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-callout text-primary transition-colors hover:bg-surface-secondary"
    >
      {icon}
      {children}
    </Link>
  );
}
