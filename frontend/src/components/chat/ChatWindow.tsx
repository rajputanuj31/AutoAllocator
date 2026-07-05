"use client";

import React, { useEffect, useRef } from "react";
import { Cpu } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export interface Message {
  id: string;
  role: "user" | "bot";
  content: string | React.ReactNode;
  isLoading?: boolean;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="typing-dots" aria-hidden="true">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
      <span className="text-xs text-foreground/60">Analyzing agents…</span>
    </div>
  );
}

export function ChatWindow({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin">
      <div className="flex flex-col gap-5 max-w-3xl mx-auto">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            {/* Avatar */}
            {msg.role === "bot" ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/25 mt-0.5">
                <Cpu className="h-4 w-4 text-primary" />
              </div>
            ) : (
              <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                <AvatarFallback className="bg-secondary text-secondary-foreground text-[10px] font-semibold">
                  YOU
                </AvatarFallback>
              </Avatar>
            )}

            {/* Bubble */}
            <div
              className={[
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "rounded-tr-sm bg-primary text-primary-foreground shadow-[0_0_20px_oklch(0.62_0.22_264_/_0.25)]"
                  : "rounded-tl-sm bg-card text-card-foreground ring-1 ring-border/50",
                msg.isLoading ? "min-w-[160px] typing-bubble" : "",
              ].join(" ")}
            >
              {msg.isLoading ? (
                <TypingIndicator />
              ) : typeof msg.content === "string" ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
