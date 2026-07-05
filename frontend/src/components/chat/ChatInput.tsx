"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
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

  // Auto-resize textarea as content grows
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
  }, [message]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 pb-4">
      <div
        className={[
          "flex items-end gap-2 rounded-2xl border bg-card/60 px-4 py-3 backdrop-blur-sm",
          "transition-all duration-150",
          disabled
            ? "border-border/30 opacity-70"
            : "border-border/40 focus-within:border-primary/50 focus-within:shadow-[0_0_0_1px_oklch(0.62_0.22_264_/_0.15)]",
        ].join(" ")}
      >
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="E.g., Earn yield on 5 000 USDC safely…"
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:cursor-not-allowed"
          style={{ minHeight: "24px", maxHeight: "128px" }}
        />
        <Button
          type="submit"
          disabled={!message.trim() || disabled}
          size="icon"
          className={[
            "h-8 w-8 shrink-0 rounded-xl transition-all duration-150",
            "bg-primary text-primary-foreground",
            "disabled:opacity-30 disabled:shadow-none",
            message.trim() && !disabled
              ? "shadow-[0_0_14px_oklch(0.62_0.22_264_/_0.45)] hover:shadow-[0_0_20px_oklch(0.62_0.22_264_/_0.55)]"
              : "",
          ].join(" ")}
        >
          {disabled ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUp className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      <p className="mt-2 text-center text-[10px] text-muted-foreground/35 select-none">
        <kbd className="font-mono">Enter</kbd> to send ·{" "}
        <kbd className="font-mono">Shift+Enter</kbd> for newline
      </p>
    </form>
  );
}
