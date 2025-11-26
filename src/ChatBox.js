import React, { useState, useRef, useEffect } from "react";

function ChatBox({ messages, onSend, isLoading }) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const adjustTextareaHeight = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const nextHeight = Math.min(textareaRef.current.scrollHeight, 220);
    textareaRef.current.style.height = `${nextHeight}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSend(input);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        borderTop: "1px solid #ddd",
        padding: "10px 0",
        backgroundColor: "#f9f9fb",
      }}
      onMouseDown={(e) => e.stopPropagation()} // Prevent clearing selections
    >
      {/* Chat messages */}
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "0 16px 8px 16px",
          maxHeight: "200px",
          overflowY: "auto",
          fontSize: "0.9rem",
        }}
      >
        {messages.map((m) => (
          <div key={m.id} style={{ display: "flex", marginBottom: "6px" }}>
            <div
              style={{
                fontWeight: "600",
                marginRight: "6px",
                textTransform: "capitalize",
                color: m.role === "user" ? "#444" : "#0b7285",
              }}
            >
              {m.role === "user" ? "You" : "Assistant"}:
            </div>
            <div>{m.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "0 16px 10px 16px",
        }}
      >
        {/* 🔵 Loading indicator with spinner */}
        {isLoading && (
          <div
            style={{
              marginBottom: "6px",
              fontSize: "0.85rem",
              color: "#666",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {/* Spinner */}
            <div
              style={{
                width: "14px",
                height: "14px",
                border: "2px solid #0b7285",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />

            Assistant is thinking…
          </div>
        )}

        {/* Input box */}
        <div
          style={{
            border: "1px solid #ccc",
            borderRadius: "999px",
            padding: "8px 12px",
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            backgroundColor: "white",
            opacity: isLoading ? 0.9 : 1,
          }}
        >
          {/* Placeholder mic icon */}
          <button
            type="button"
            disabled
            style={{
              border: "none",
              background: "transparent",
              cursor: "default",
              fontSize: "18px",
              opacity: 0.3,
            }}
          >
            🎤
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message to refine your workplan..."
            disabled={isLoading}
            style={{
              flex: 1,
              border: "none",
              resize: "none",
              outline: "none",
              fontSize: "0.95rem",
              minHeight: "32px",
              lineHeight: "1.3",
              overflowY: "auto",
              backgroundColor: isLoading ? "#f3f3f3" : "white",
            }}
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            style={{
              borderRadius: "999px",
              border: "none",
              padding: "6px 14px",
              backgroundColor:
                isLoading || !input.trim() ? "#ccc" : "#0b7285",
              color: "white",
              cursor:
                isLoading || !input.trim() ? "default" : "pointer",
              fontSize: "0.9rem",
              fontWeight: 500,
            }}
          >
            {isLoading ? "..." : "Send"}
          </button>
        </div>

        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>

        <div
          style={{
            marginTop: "4px",
            fontSize: "0.75rem",
            color: "#777",
          }}
        >
          Press Enter to send, Shift+Enter for a new line.
        </div>
      </div>
    </div>
  );
}

export default ChatBox;
