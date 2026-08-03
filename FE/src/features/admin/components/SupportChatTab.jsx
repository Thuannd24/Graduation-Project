import React, { useState, useEffect, useRef } from "react";
import Icon from "../../../components/common/Icon.jsx";
import { chatApi } from "../../../services/chatApi.ts";
import { createWebSocketClient } from "../../../services/websocketService.ts";
import keycloak from "../../../services/keycloak.js";

export default function SupportChatTab() {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedSession, setSelectedSession] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef(null);
  const stompClientRef = useRef(null);

  const staffId = keycloak.subject || "staff_dev";
  const staffName = keycloak.tokenParsed?.name || "Nhân viên hỗ trợ";

  // Function to load all escalated chat rooms from backend database
  const loadRooms = async () => {
    try {
      const waitingPage = await chatApi.getRoomsByStatus("WAITING", 0, 50);
      const activePage = await chatApi.getRoomsByStatus("ACTIVE", 0, 50);
      const allRooms = [...(waitingPage.content || []), ...(activePage.content || [])];
      
      // Sort by last message time or creation time (newest first)
      allRooms.sort((a, b) => {
        const timeA = new Date(a.lastMessageAt || a.createdAt).getTime();
        const timeB = new Date(b.lastMessageAt || b.createdAt).getTime();
        return timeB - timeA;
      });

      setSessions(allRooms);
    } catch (err) {
      console.error("Failed to load admin support chat rooms", err);
    }
  };

  // 1. Fetch initial rooms list and configure STOMP WebSocket connection
  useEffect(() => {
    loadRooms();

    // Establish WebSocket STOMP connection for real-time room list notifications
    const client = createWebSocketClient({
      onConnect: () => {
        console.log("WebSocket connected for support staff dashboard");
        // Subscribe to general rooms updates to reload rooms list dynamically
        client.subscribe("/topic/rooms.updates", (message) => {
          console.log("Rooms update received on admin panel, reloading list...");
          loadRooms();
        });
      }
    });

    client.activate();
    stompClientRef.current = client;

    // Polling backup to ensure new rooms show up even if WebSocket disconnects
    const pollInterval = setInterval(loadRooms, 5000);

    return () => {
      client.deactivate();
      stompClientRef.current = null;
      clearInterval(pollInterval);
    };
  }, []);

  // 2. Load selected session message history and subscribe to the specific room WebSocket
  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedSession(null);
      return;
    }

    const matchedRoom = sessions.find((s) => s.id === selectedSessionId);
    if (!matchedRoom) return;

    // Local subscription to the active chat room channel
    let stompSubscription = null;
    
    const loadMessages = async () => {
      try {
        const historyPage = await chatApi.getRoomMessages(selectedSessionId, 0, 100);
        const historyMsgs = (historyPage.content || [])
          .map((msg) => ({
            id: msg.id,
            sender: msg.senderId === matchedRoom.customerId ? "user" : "assistant",
            text: msg.content,
            timestamp: msg.createdAt
          }))
          .reverse();

        setSelectedSession({
          ...matchedRoom,
          messages: historyMsgs
        });

        // Setup STOMP subscription for live updates inside this room
        if (stompClientRef.current && stompClientRef.current.connected) {
          stompSubscription = stompClientRef.current.subscribe(
            `/topic/room/${selectedSessionId}`,
            (message) => {
              const payload = JSON.parse(message.body);
              const stompMsg = {
                id: payload.id,
                sender: payload.senderId === matchedRoom.customerId ? "user" : "assistant",
                text: payload.content,
                timestamp: payload.createdAt
              };

              setSelectedSession((prev) => {
                if (!prev || prev.id !== selectedSessionId) return prev;
                // Avoid duplicates
                if (prev.messages.some((m) => m.id === stompMsg.id)) return prev;
                return {
                  ...prev,
                  messages: [...prev.messages, stompMsg]
                };
              });
            }
          );
        }
      } catch (err) {
        console.error("Failed to load room messages history", err);
      }
    };

    loadMessages();

    return () => {
      if (stompSubscription) {
        stompSubscription.unsubscribe();
      }
    };
  }, [selectedSessionId, sessions]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedSession?.messages]);

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedSessionId) return;

    if (stompClientRef.current && stompClientRef.current.connected) {
      stompClientRef.current.publish({
        destination: "/app/chat.sendMessage",
        body: JSON.stringify({
          roomId: selectedSessionId,
          content: replyText.trim(),
          type: "TEXT"
        })
      });
      setReplyText("");
    } else {
      console.warn("WebSocket not connected. Reply message not sent.");
    }
  };

  const handleAcceptChat = async (roomId) => {
    try {
      const updated = await chatApi.assignRoom(roomId);
      await loadRooms();
      setSelectedSessionId(updated.id);
    } catch (err) {
      console.error("Failed to accept chat", err);
    }
  };

  const handleResolveChat = async (roomId) => {
    if (!window.confirm("Xác nhận đã giải quyết xong và đóng phiên chat trực tuyến này?")) return;

    try {
      await chatApi.closeRoom(roomId);
      await loadRooms();
      setSelectedSessionId("");
      setSelectedSession(null);
    } catch (err) {
      console.error("Failed to resolve chat", err);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  };

  const filteredSessions = sessions.filter(
    (s) =>
      s.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.lastMessage && s.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()))
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
                      <span className="text-xs font-black truncate text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        {session.customerName}
                        {session.status === "WAITING" ? (
                          <span className="text-[8px] bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded font-black shrink-0">Chờ</span>
                        ) : (
                          <span className="text-[8px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded font-black shrink-0">Trực</span>
                        )}
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium shrink-0">
                        {formatTime(session.lastMessageAt || session.createdAt)}
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
                      {selectedSession.customerName}
                    </h4>
                    <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">
                      Đang kết nối nhân viên • Yêu cầu hỗ trợ
                    </p>
                  </div>
                </div>

                {selectedSession.status === "WAITING" ? (
                  <button
                    onClick={() => handleAcceptChat(selectedSession.id)}
                    className="bg-[#c82229] hover:bg-[#a81a1f] text-white border-none rounded-xl px-4 py-2 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-105 active:scale-95 transition-all"
                    title="Tiếp nhận hỗ trợ cuộc chat này"
                  >
                    <Icon name="support_agent" className="text-sm" />
                    Tiếp Nhận Chat
                  </button>
                ) : (
                  <button
                    onClick={() => handleResolveChat(selectedSession.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-none rounded-xl px-4 py-2 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-105 active:scale-95 transition-all"
                    title="Đánh dấu đã tư vấn xong"
                  >
                    <Icon name="check_circle" className="text-sm" />
                    Giải Quyết Xong
                  </button>
                )}
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
