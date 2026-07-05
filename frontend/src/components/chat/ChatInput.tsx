"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, Loader2 } from "lucide-react";

export function ChatInput({
  onSendMessage,
  disabled,
}: {
  onSendMessage: (msg: string) => void;
  disabled?: boolean;
}) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [message]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="px-4 py-3">
      <div
        className={[
          "flex items-end gap-2 rounded-xl border bg-card px-3 py-2.5",
          disabled ? "opacity-50" : "focus-within:border-foreground/20",
        ].join(" ")}
      >
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your goal…"
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none disabled:cursor-not-allowed"
          style={{ minHeight: "22px", maxHeight: "120px" }}
        />
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-20"
        >
          {disabled ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUp className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground/25 select-none">
        Enter to send · Shift+Enter for newline
      </p>
    </form>
  );
}
