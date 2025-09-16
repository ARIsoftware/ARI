"use client";

import { useChat } from "@ai-sdk/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ChatInterfaceFixed() {
  const { messages, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
  });

  // Manage input state ourselves since handleInputChange is broken
  const [input, setInput] = useState("");
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const message = input.trim();
    setInput(""); // Clear input immediately
    
    // Add user message to the messages array manually
    const userMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content: message,
    };
    
    // We'll need to manage messages ourselves since useChat isn't working properly
    // For now, let's use a simple fetch to the API
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
      });
      
      // This is a basic implementation - we'd need to handle streaming properly
      console.log("Response:", response);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFormSubmit(e as any);
    }
  };

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
          <form onSubmit={handleFormSubmit} className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="min-h-[60px] resize-none"
              disabled={isLoading}
              rows={1}
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={isLoading || !input.trim()}
              className="h-[60px] w-[60px]"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}