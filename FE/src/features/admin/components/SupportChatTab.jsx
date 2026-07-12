import React, { useState, useEffect, useRef } from "react";
import Icon from "../../../components/common/Icon.jsx";

export default function SupportChatTab() {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedSession, setSelectedSession] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef(null);

  // Initialize and poll localStorage for chat sync
  useEffect(() => {
    // 1. Initialize mock escalated sessions if localStorage is empty
    const initMockData = () => {
      const activeSessions = JSON.parse(localStorage.getItem("aura_escalated_sessions") || "[]");
      if (activeSessions.length === 0) {
        const mockSessions = ["session_iphone_user", "session_warranty_help", "session_guest_9918"];
        localStorage.setItem("aura_escalated_sessions", JSON.stringify(mockSessions));

        // Mock chat 1
        localStorage.setItem(
          "aura_chat_session_session_iphone_user",
          JSON.stringify({
            isEscalated: true,
            messages: [
              { id: "welcome", sender: "assistant", text: "Xin chào! Tôi có thể hỗ trợ gì cho bạn?", timestamp: new Date(Date.now() - 600000).toISOString() },
              { id: "msg_1", sender: "user", text: "Tôi muốn mua trả góp iPhone 16 Pro Max, thủ tục cần những gì và lãi suất thế nào?", timestamp: new Date(Date.now() - 500000).toISOString() },
              { id: "msg_2", sender: "assistant", text: "Dạ, để mua trả góp iPhone 16 Pro Max bạn có thể chọn qua công ty tài chính hoặc thẻ tín dụng...", timestamp: new Date(Date.now() - 400000).toISOString() },
              { id: "msg_3", sender: "user", text: "Tôi muốn gặp nhân viên để tư vấn trực tiếp hồ sơ công ty tài chính", timestamp: new Date(Date.now() - 300000).toISOString() }
            ],
            lastUpdated: Date.now() - 300000
          })
        );

        // Mock chat 2
        localStorage.setItem(
          "aura_chat_session_session_warranty_help",
          JSON.stringify({
            isEscalated: true,
            messages: [
              { id: "welcome", sender: "assistant", text: "Chào bạn, bạn cần hỗ trợ gì?", timestamp: new Date(Date.now() - 1200000).toISOString() },
              { id: "msg_1", sender: "user", text: "Máy Macbook mua được 3 tháng bị sọc màn hình thì bảo hành thế nào?", timestamp: new Date(Date.now() - 1000000).toISOString() },
              { id: "msg_2", sender: "user", text: "Yêu cầu gặp nhân viên tư vấn bảo hành trực tiếp", timestamp: new Date(Date.now() - 900000).toISOString() }
            ],
            lastUpdated: Date.now() - 900000
          })
        );

        // Mock chat 3
        localStorage.setItem(
          "aura_chat_session_session_guest_9918",
          JSON.stringify({
            isEscalated: true,
            messages: [
              { id: "welcome", sender: "assistant", text: "AuraTech xin chào! Tôi giúp gì được cho bạn?", timestamp: new Date(Date.now() - 2000000).toISOString() },
              { id: "msg_1", sender: "user", text: "Shop có sẵn laptop Asus ROG Zephyrus G14 ở chi nhánh HN không?", timestamp: new Date(Date.now() - 1800000).toISOString() }
            ],
            lastUpdated: Date.now() - 1800000
          })
        );
      }
    };

    initMockData();

    // 2. Poll function to read active chat sessions
    const fetchActiveChats = () => {
      const activeSessionIds = JSON.parse(localStorage.getItem("aura_escalated_sessions") || "[]");
      const loadedSessions = [];

      activeSessionIds.forEach((id) => {
        const chatData = JSON.parse(localStorage.getItem("aura_chat_session_" + id) || "null");
        if (chatData && chatData.isEscalated) {
          const lastMsg = chatData.messages[chatData.messages.length - 1];
          loadedSessions.push({
            id,
            lastMessage: lastMsg ? lastMsg.text : "Không có tin nhắn nào",
            timestamp: chatData.lastUpdated || Date.now(),
            messages: chatData.messages || [],
            isEscalated: chatData.isEscalated
          });
        }
      });

      // Sort by last updated time (newest first)
      loadedSessions.sort((a, b) => b.timestamp - a.timestamp);
      setSessions(loadedSessions);
    };

    fetchActiveChats();
    const interval = setInterval(fetchActiveChats, 1500);

    return () => clearInterval(interval);
  }, []);

  // Update selected session details when sessions list or selected ID changes
  useEffect(() => {
    if (selectedSessionId) {
      const matched = sessions.find((s) => s.id === selectedSessionId);
      if (matched) {
        setSelectedSession(matched);
      }
    } else {
      setSelectedSession(null);
    }
  }, [selectedSessionId, sessions]);

  // Scroll to bottom when message history opens or updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedSession?.messages]);

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedSessionId) return;

    const chatData = JSON.parse(localStorage.getItem("aura_chat_session_" + selectedSessionId) || "null");
    if (!chatData) return;

    const newMsg = {
      id: "staff_" + Date.now(),
      sender: "assistant", // Displays as assistant/staff in the customer UI
      text: replyText.trim(),
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...(chatData.messages || []), newMsg];
    const updatedData = {
      ...chatData,
      messages: updatedMessages,
      lastUpdated: Date.now()
    };

    localStorage.setItem("aura_chat_session_" + selectedSessionId, JSON.stringify(updatedData));
    setReplyText("");

    // Instant local UI state refresh
    setSessions((prev) =>
      prev.map((s) =>
        s.id === selectedSessionId
          ? { ...s, messages: updatedMessages, timestamp: updatedData.lastUpdated }
          : s
      )
    );
  };

  const handleResolveChat = (sessionIdToResolve) => {
    if (!window.confirm("Xác nhận đã giải quyết xong và đóng phiên chat trực tuyến này?")) return;

    // 1. Update session status to false in chat details
    const chatData = JSON.parse(localStorage.getItem("aura_chat_session_" + sessionIdToResolve) || "null");
    if (chatData) {
      const resolvedMsg = {
        id: "sys_" + Date.now(),
        sender: "system",
        text: "Hội thoại đã kết thúc và chuyển lại cho trợ lý AI quản lý.",
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(
        "aura_chat_session_" + sessionIdToResolve,
        JSON.stringify({
          ...chatData,
          isEscalated: false,
          messages: [...(chatData.messages || []), resolvedMsg],
          lastUpdated: Date.now()
        })
      );
    }

    // 2. Remove from active list
    const activeSessionIds = JSON.parse(localStorage.getItem("aura_escalated_sessions") || "[]");
    const updatedSessionIds = activeSessionIds.filter((id) => id !== sessionIdToResolve);
    localStorage.setItem("aura_escalated_sessions", JSON.stringify(updatedSessionIds));

    // Clear selection if resolving the active chat
    if (selectedSessionId === sessionIdToResolve) {
      setSelectedSessionId("");
      setSelectedSession(null);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  };

  const filteredSessions = sessions.filter(
    (s) =>
      s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 h-[calc(100vh-80px)] flex flex-col">
      {/* 1. Header & Stats Section */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Icon name="chat" className="text-rose-600 text-2xl" />
            Trực Tuyến Hỗ Trợ Khách Hàng
          </h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
            Phản hồi các yêu cầu cần tư vấn trực tiếp từ người dùng
          </p>
        </div>

        {/* Dynamic Small Stats Banner */}
        <div className="flex gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 flex items-center gap-3 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center text-emerald-600">
              <Icon name="chat" className="text-sm" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Yêu cầu mới</p>
              <h4 className="text-sm font-black text-slate-700 dark:text-slate-200">{sessions.length}</h4>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 flex items-center gap-3 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center text-rose-600">
              <Icon name="support_agent" className="text-sm" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Trạng thái</p>
              <h4 className="text-sm font-black text-slate-700 dark:text-slate-200">Hoạt động</h4>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex gap-5 min-h-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Left Sidebar - Escalated Chat List */}
        <div className="w-80 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm phiên hội thoại..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl pl-9 pr-4 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all dark:text-white"
              />
              <Icon name="search" className="absolute left-3 top-2.5 text-slate-400 text-sm" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-2 space-y-1">
            {filteredSessions.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-bold">
                Không tìm thấy hội thoại nào.
              </div>
            ) : (
              filteredSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl transition-all border-none text-left cursor-pointer ${
                    selectedSessionId === session.id
                      ? "bg-rose-50/70 dark:bg-rose-950/20 text-rose-600 border border-rose-100 dark:border-rose-950/30"
                      : "bg-transparent text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-950/50"
                  }`}
                >
                  {/* Robot head or user initial */}
                  <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center shrink-0 font-extrabold text-sm border border-rose-200 dark:border-rose-900/30">
                    <Icon name="person" className="text-lg" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-black truncate text-slate-800 dark:text-slate-200">
                        {session.id.replace("session_", "Khách hàng ")}
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium shrink-0">
                        {formatTime(session.timestamp)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate leading-relaxed">
                      {session.lastMessage}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Content - Chat Viewport */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950/10">
          {selectedSession ? (
            <>
              {/* Selected Conversation Header */}
              <div className="bg-white dark:bg-slate-900 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center text-emerald-600">
                    <Icon name="support_agent" className="text-lg" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-100">
                      {selectedSessionId.replace("session_", "Khách hàng ")}
                    </h4>
                    <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">
                      Đang kết nối nhân viên • Yêu cầu hỗ trợ
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleResolveChat(selectedSessionId)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white border-none rounded-xl px-4 py-2 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-105 active:scale-95 transition-all"
                  title="Đánh dấu đã tư vấn xong"
                >
                  <Icon name="check_circle" className="text-sm" />
                  Giải Quyết Xong
                </button>
              </div>

              {/* Chat Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedSession.messages.map((msg, index) => {
                  const isUser = msg.sender === "user";
                  const isSys = msg.sender === "system";

                  if (isSys) {
                    return (
                      <div key={msg.id || index} className="flex justify-center">
                        <span className="bg-slate-200/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded-lg px-3 py-1">
                          {msg.text}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id || index}
                      className={`flex ${isUser ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-xs shadow-sm flex flex-col gap-0.5 ${
                          isUser
                            ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-bl-none border border-slate-100 dark:border-slate-800"
                            : "bg-[#c82229] text-white rounded-br-none"
                        }`}
                      >
                        <p className="leading-relaxed whitespace-pre-wrap font-medium">{msg.text}</p>
                        <span
                          className={`text-[8px] self-end mt-1 font-bold ${
                            isUser ? "text-slate-400" : "text-white/70"
                          }`}
                        >
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Send Input Box */}
              <div className="bg-white dark:bg-slate-900 p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl px-3 py-2">
                  <input
                    type="text"
                    placeholder="Nhập nội dung phản hồi khách hàng..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                    className="flex-1 bg-transparent border-none outline-none text-xs dark:text-white pl-1"
                  />
                  <button
                    onClick={handleSendReply}
                    className="w-8 h-8 rounded-xl bg-[#c82229] hover:bg-[#a81a1f] text-white border-none flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-sm shrink-0"
                    title="Gửi"
                  >
                    <Icon name="send" className="text-xs" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/20 text-rose-500 flex items-center justify-center mb-4">
                <Icon name="support_agent" className="text-3xl animate-bounce" />
              </div>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 mb-1">
                Chưa Chọn Hợp Đồng Tư Vấn
              </h3>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                Vui lòng chọn một phiên yêu cầu tư vấn trực tuyến từ danh sách bên trái để bắt đầu hỗ trợ khách hàng.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
