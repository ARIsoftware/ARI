"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect } from "react";

export function ChatInterfaceDebug() {
  const chatData = useChat({
    api: "/api/chat",
  });

  // Log what useChat returns
  useEffect(() => {
    console.log("useChat returned:", chatData);
    console.log("input value:", chatData.input);
    console.log("handleInputChange type:", typeof chatData.handleInputChange);
    console.log("handleSubmit type:", typeof chatData.handleSubmit);
    console.log("messages:", chatData.messages);
  }, [chatData]);

  // Simple test with local state first
  const [localInput, setLocalInput] = React.useState("");

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Debug Chat Interface</h2>
      
      {/* Test 1: Can we type in a regular input? */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Test 1: Regular Input (local state)</label>
        <input 
          type="text"
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="Can you type here?"
        />
        <p className="text-sm mt-1">Value: {localInput}</p>
      </div>

      {/* Test 2: What does useChat give us? */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Test 2: useChat Input</label>
        <input 
          type="text"
          value={chatData.input || ""}
          onChange={chatData.handleInputChange}
          className="w-full p-2 border rounded"
          placeholder="Can you type here?"
        />
        <p className="text-sm mt-1">Value: {chatData.input}</p>
      </div>

      {/* Test 3: Manual form */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Test 3: Form Submit</label>
        <form onSubmit={chatData.handleSubmit}>
          <input 
            type="text"
            value={chatData.input || ""}
            onChange={chatData.handleInputChange}
            className="w-full p-2 border rounded mb-2"
          />
          <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded">
            Submit
          </button>
        </form>
      </div>

      {/* Display messages */}
      <div className="mt-4">
        <h3 className="font-medium">Messages:</h3>
        <pre className="text-xs bg-gray-100 p-2 rounded">
          {JSON.stringify(chatData.messages, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// Import React properly
import * as React from "react";