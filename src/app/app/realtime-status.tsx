"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RealtimeStatus({
  userId,
  taskId,
}: {
  userId: string;
  taskId?: string;
}) {
  const router = useRouter();
  const pending = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("status-updates");

    function refresh() {
      if (pending.current) return;
      pending.current = true;
      setTimeout(() => {
        router.refresh();
        pending.current = false;
      }, 1000);
    }

    if (taskId) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `id=eq.${taskId}`,
        },
        refresh,
      );
    } else {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `buyer_id=eq.${userId}`,
        },
        refresh,
      );
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `selected_runner_id=eq.${userId}`,
        },
        refresh,
      );
    }

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      },
      refresh,
    );

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, taskId, router]);

  return null;
}
