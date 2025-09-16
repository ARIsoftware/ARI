"use client";

import { useChat } from "@ai-sdk/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

export function ChatInterface() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
    initialInput: "",
  });

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <h3 className="text-lg font-semibold mb-2">Welcome to AI Assistant</h3>
            <p className="text-muted-foreground">
              Start a conversation by typing a message below
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isLoading && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>
      
      <div className="border-t p-4">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}