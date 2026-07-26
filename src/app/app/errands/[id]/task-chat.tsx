"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, MessageCircle, Image as ImageIcon } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { markMessagesRead, sendMessage } from "../../actions";

type Message = {
  id: string;
  sender_id: string;
  content: string;
  image_path: string | null;
  image_url: string | null;
  read_at: string | null;
  created_at: string;
};

const TYPING_DEBOUNCE_MS = 500;
const TYPING_VISIBLE_MS = 3000;

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
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sign any images that do not yet have a URL.
  useEffect(() => {
    async function signImages() {
      const needsSign = messages.some((m) => m.image_path && !m.image_url);
      if (!needsSign) return;

      const supabase = createClient();
      let changed = false;
      const next = await Promise.all(
        messages.map(async (m) => {
          if (!m.image_path || m.image_url) return m;
          const { data } = await supabase.storage
            .from("chat-images")
            .createSignedUrl(m.image_path, 60 * 5);
          if (!data?.signedUrl) return m;
          changed = true;
          return { ...m, image_url: data.signedUrl };
        }),
      );
      if (changed) setMessages(next);
    }
    void signImages();
  }, [messages]);

  // Realtime: new messages, read receipts, and typing.
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
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [
              ...prev,
              { ...newMessage, image_url: null },
            ];
          });
          if (newMessage.sender_id !== userId) {
            void markMessagesRead(taskId);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id ? { ...m, read_at: updated.read_at } : m,
            ),
          );
        },
      )
      .subscribe();

    const typingChannel = supabase
      .channel(`typing:${taskId}`, { config: { broadcast: { self: false } } })
      .on(
        "broadcast",
        { event: "typing" },
        (payload) => {
          const event = payload.payload as { user_id: string; is_typing: boolean };
          if (event.user_id !== userId) {
            setOtherTyping(event.is_typing);
          }
        },
      )
      .subscribe();
    typingChannelRef.current = typingChannel;

    return () => {
      void supabase.removeChannel(channel);
      void supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
    };
  }, [taskId, userId]);

  // Mark existing messages as read on mount and focus.
  useEffect(() => {
    function onFocus() {
      if (document.visibilityState === "visible") {
        void markMessagesRead(taskId);
      }
    }
    onFocus();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [taskId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Clear typing indicator if we haven't heard from the other side recently.
  useEffect(() => {
    if (!otherTyping) return;
    const timer = setTimeout(() => setOtherTyping(false), TYPING_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [otherTyping]);

  function broadcastTyping(isTyping: boolean) {
    typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: userId, is_typing: isTyping },
    });
  }

  function handleContentChange(value: string) {
    setContent(value);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    broadcastTyping(true);
    typingTimeoutRef.current = setTimeout(() => broadcastTyping(false), TYPING_DEBOUNCE_MS);
  }

  function handleFileSelect(file: File | null) {
    setError(null);
    if (file && file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10 MB");
      setSelectedImage(null);
      setImagePreview(null);
      return;
    }
    if (!file || file.size === 0) {
      setSelectedImage(null);
      setImagePreview(null);
      return;
    }
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = content.trim();
    if (!text && !selectedImage) return;
    if (text.length > 1000) return;

    setIsPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("content", text);
    if (selectedImage) formData.set("image", selectedImage);

    const result = await sendMessage(taskId, formData);
    setIsPending(false);

    if (result.error) {
      setError(result.error);
    } else {
      setContent("");
      setSelectedImage(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      broadcastTyping(false);
    }
  }

  return (
    <section className="mt-5 rounded-[1.5rem] border border-cream-deep bg-white p-6 shadow-sm">
      <p className="flex items-center gap-2 font-medium text-green-deep">
        <MessageCircle className="h-5 w-5 text-orange-deep" aria-hidden /> Chat with {recipientName}
      </p>

      {otherTyping ? (
        <p className="mt-1 text-xs text-muted">{recipientName} is typing…</p>
      ) : null}

      <div className="mt-3 flex max-h-96 flex-col gap-3 overflow-y-auto rounded-2xl border border-cream-deep bg-cream/30 p-4">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No messages yet. Say hello or share a photo to coordinate pickup.
          </p>
        ) : (
          messages.map((m) => {
            const isMe = m.sender_id === userId;
            const isRead = m.read_at != null;
            return (
              <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    isMe
                      ? "rounded-br-md bg-green text-cream"
                      : "rounded-bl-md border border-cream-deep bg-white text-ink"
                  }`}
                >
                  {m.content ? <p className="whitespace-pre-wrap">{m.content}</p> : null}
                  {m.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL; next/image can't optimize it
                    <img
                      src={m.image_url}
                      alt="Attached image"
                      className="mt-2 max-h-60 rounded-xl object-cover"
                      loading="lazy"
                    />
                  ) : m.image_path ? (
                    <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted" aria-hidden />
                  ) : null}
                </div>
                {isMe && isRead ? (
                  <span className="mt-0.5 text-[10px] text-muted">Seen</span>
                ) : null}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error ? <p className="mt-2 text-sm text-orange-deep">{error}</p> : null}

      {imagePreview ? (
        <div className="relative mt-3 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview; next/image can't optimize it */}
          <img
            src={imagePreview}
            alt="Selected image preview"
            className="h-20 rounded-xl border border-cream-deep object-cover"
          />
          <button
            type="button"
            onClick={() => {
              setSelectedImage(null);
              setImagePreview(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-orange text-[10px] font-bold text-white"
            aria-label="Remove image"
          >
            ×
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending || !!selectedImage}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-cream-deep text-green-deep transition hover:bg-cream/60 disabled:opacity-60"
          aria-label="Attach image"
        >
          <ImageIcon className="h-4 w-4" aria-hidden />
        </button>
        <textarea
          name="content"
          rows={2}
          maxLength={1000}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Type a message…"
          disabled={isPending}
          className="min-h-0 flex-1 resize-none rounded-2xl border border-cream-deep bg-cream/40 px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-green-soft disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending || (!content.trim() && !selectedImage)}
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
