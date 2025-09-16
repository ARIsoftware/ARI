"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatInterfaceSimple() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    
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
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('API Error:', errorData);
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No reader available");
      }
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // Read the OpenAI stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              break;
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { ...msg, content: msg.content + content }
                      : msg
                  )
                );
              }
            } catch (e) {
              // Ignore parsing errors
              console.log('Parse error for line:', line);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${error.message || 'Unknown error occurred'}`,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
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
          <form onSubmit={handleSubmit} className="flex gap-2">
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