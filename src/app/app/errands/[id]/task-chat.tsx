"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage } from "../../actions";

type Message = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export function TaskChat({
  taskId,
  userId,
  messages: initialMessages,
  recipientName,
}: {
  taskId: string;
  userId: string;
  messages: Message[];
  recipientName: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages((prev) =>
            prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage],
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [taskId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = content.trim();
    if (!text || text.length > 1000) return;

    setIsPending(true);
    setError(null);
    const result = await sendMessage(taskId, text);
    setIsPending(false);

    if (result.error) {
      setError(result.error);
    } else {
      setContent("");
    }
  }

  return (
    <section className="mt-5 rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
      <p className="flex items-center gap-2 font-medium text-green-deep">
        <MessageCircle className="h-5 w-5 text-orange-deep" aria-hidden /> Chat with {recipientName}
      </p>

      <div className="mt-3 flex max-h-80 flex-col gap-3 overflow-y-auto rounded-2xl border border-cream-deep bg-cream/30 p-4">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No messages yet. Say hello to coordinate pickup.
          </p>
        ) : (
          messages.map((m) => {
            const isMe = m.sender_id === userId;
            return (
              <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    isMe
                      ? "rounded-br-md bg-green text-cream"
                      : "rounded-bl-md border border-cream-deep bg-white text-ink"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="mt-2 text-sm text-orange-deep">{error}</p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <textarea
          name="content"
          rows={2}
          maxLength={1000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message…"
          disabled={isPending}
          className="min-h-0 flex-1 resize-none rounded-2xl border border-cream-deep bg-cream/40 px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-green-soft disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending || content.trim().length === 0}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-green text-cream transition hover:bg-green-deep disabled:opacity-60"
          aria-label="Send message"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
        </button>
      </form>
    </section>
  );
}

