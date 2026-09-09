"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";
import { useOnlineStatus } from "@/lib/network-status";

/** §7.7's offline / network error toast. Renders nothing; it only announces. */
export function NetworkToast() {
  const online = useOnlineStatus();
  const { toast } = useToast();
  // Nothing to announce on first paint — only on a change.
  const previous = useRef(online);

  useEffect(() => {
    if (previous.current === online) return;
    previous.current = online;
    if (online) toast("Back online.", "success");
    else toast("You're offline. Your progress is saved on this device.", "error");
  }, [online, toast]);

  return null;
}
