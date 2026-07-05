"use client";

import React, { useEffect, useRef } from "react";

export interface Message {
  id: string;
  role: "user" | "bot";
  content: string | React.ReactNode;
  isLoading?: boolean;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <div className="typing-dots" aria-hidden="true">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
      <span className="text-xs text-muted-foreground">Thinking…</span>
    </div>
  );
}

export function ChatWindow({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-2xl space-y-1 px-4 py-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "user" ? (
              /* User bubble — same card style, right-aligned */
              <div className="max-w-[78%] rounded-2xl rounded-br-sm border border-border bg-card px-4 py-2.5 text-sm leading-relaxed text-foreground">
                {typeof msg.content === "string" ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  msg.content
                )}
              </div>
            ) : (
              /* Bot bubble */
              <div className="max-w-[85%] sm:max-w-[78%]">
                {msg.isLoading ? (
                  <div className="rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3">
                    <TypingIndicator />
                  </div>
                ) : typeof msg.content === "string" ? (
                  <div className="rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground">
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ) : (
                  /* Rich content (approval cards etc) */
                  <div className="w-full">{msg.content}</div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} className="h-2" />
      </div>
    </div>
  );
}
