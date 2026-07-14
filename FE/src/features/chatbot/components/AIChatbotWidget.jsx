import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "../../../components/common/Icon.jsx";
import { aiApi } from "../../../services/aiApi.ts";
import { formatVnd } from "../../../utils/format.js";

// Import transparent robot poses
import robot1 from "../../../assets/images/robot1.png";
import robot2 from "../../../assets/images/robot2.png";
import robot3 from "../../../assets/images/robot3.png";

/* ===================== Animated Robot Mascot ===================== */
function AnimatedRobotMascot({ waving = true, size = 56 }) {
  const [frame, setFrame] = useState(1); // Default to middle winking pose (robot2)

  useEffect(() => {
    if (!waving) {
      setFrame(1);
      return;
    }

    // Cycle through poses: robot1 (Left Wave) -> robot2 (Wink) -> robot3 (Both Wave) -> robot2 (Wink)
    const sequence = [0, 1, 2, 1];
    let seqIdx = 0;

    const interval = setInterval(() => {
      setFrame(sequence[seqIdx]);
      seqIdx = (seqIdx + 1) % sequence.length;
    }, 3000);

    return () => clearInterval(interval);
  }, [waving]);

  const images = [robot1, robot2, robot3];

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      className="bg-transparent select-none pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        <motion.img
          key={frame}
          src={images[frame]}
          alt="Aura Robot Mascot"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            position: "absolute",
          }}
        />
      </AnimatePresence>
    </div>
  );
}

const STARTER_PROMPTS = [
  { text: "Tư vấn iPhone giá tốt nhất", icon: "phone_iphone" },
  { text: "Chính sách bảo hành ra sao?", icon: "shield" },
  { text: "Tìm laptop tầm trung", icon: "laptop_mac" },
  { text: "Yêu cầu gặp nhân viên trực tuyến", icon: "support_agent" }
];

export default function AIChatbotWidget() {
  const location = useLocation();
  const [popupText, setPopupText] = useState("AuraTech xin chào! 👋");
  const [isOpen, setIsOpen] = useState(false);
  const [showPopup, setShowPopup] = useState(true);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [isEscalated, setIsEscalated] = useState(false);
  const [sessionId] = useState(() => "session_" + Math.random().toString(36).substr(2, 9));
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize with greeting message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          sender: "assistant",
          text: "Xin chào! Tôi là Aura AI - Trợ lý mua sắm thông minh của bạn. Tôi có thể tư vấn cấu hình sản phẩm, chính sách bảo hành, hoặc tìm sản phẩm theo hình ảnh. Bạn cần tôi hỗ trợ gì hôm nay?",
          timestamp: new Date()
        }
      ]);
    }
  }, [messages]);

  // Scroll to bottom when new message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Listen to route changes to show login prompt or standard prompt
  useEffect(() => {
    if (location.pathname === "/login") {
      setPopupText("Đăng nhập nhận ưu đãi Aura Member! 🎁");
      setShowPopup(true);
      
      const timer = setTimeout(() => {
        setShowPopup(false);
      }, 3500); // Dismiss quickly in 3.5 seconds
      
      return () => clearTimeout(timer);
    } else {
      setPopupText("AuraTech xin chào! 👋");
      
      // Auto-dismiss after 12s on other pages
      const timer = setTimeout(() => {
        setShowPopup(false);
      }, 12000);
      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  // Syncer for escalated customer session
  useEffect(() => {
    if (!isEscalated) return;

    // Check if session needs to be registered
    const activeSessions = JSON.parse(localStorage.getItem("aura_escalated_sessions") || "[]");
    if (!activeSessions.includes(sessionId)) {
      activeSessions.push(sessionId);
      localStorage.setItem("aura_escalated_sessions", JSON.stringify(activeSessions));
    }

    const syncInterval = setInterval(() => {
      const chatData = JSON.parse(localStorage.getItem("aura_chat_session_" + sessionId) || "null");
      if (chatData) {
        // If staff closed the chat session
        if (!chatData.isEscalated) {
          setIsEscalated(false);
          setMessages(chatData.messages);
          return;
        }

        // Sync messages from staff/system
        if (chatData.messages.length !== messages.length) {
          setMessages(chatData.messages);
        }
      }
    }, 1200);

    return () => clearInterval(syncInterval);
  }, [isEscalated, sessionId, messages.length]);

  const handleSend = async (textToSend, imageBase64) => {
    if (!textToSend.trim() && !imageBase64) return;

    const userMsg = {
      id: "msg_" + Date.now(),
      sender: "user",
      text: textToSend || "Đã gửi một hình ảnh",
      timestamp: new Date()
    };

    setInputValue("");

    // 1. If chat is escalated, bypass AI and send directly to staff
    if (isEscalated) {
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      const chatData = JSON.parse(localStorage.getItem("aura_chat_session_" + sessionId) || "null");
      if (chatData) {
        localStorage.setItem(
          "aura_chat_session_" + sessionId,
          JSON.stringify({
            ...chatData,
            messages: updatedMessages,
            lastUpdated: Date.now()
          })
        );
      }
      return;
    }

    // 2. Direct manual trigger to call staff
    if (textToSend.trim() === "Yêu cầu gặp nhân viên trực tuyến") {
      setIsEscalated(true);
      const systemMsg = {
        id: "sys_" + Date.now(),
        sender: "system",
        text: "Đang kết nối với nhân viên hỗ trợ...",
        timestamp: new Date()
      };
      const updatedMessages = [...messages, userMsg, systemMsg];
      setMessages(updatedMessages);

      const activeSessions = JSON.parse(localStorage.getItem("aura_escalated_sessions") || "[]");
      if (!activeSessions.includes(sessionId)) {
        activeSessions.push(sessionId);
        localStorage.setItem("aura_escalated_sessions", JSON.stringify(activeSessions));
      }
      localStorage.setItem(
        "aura_chat_session_" + sessionId,
        JSON.stringify({
          isEscalated: true,
          messages: updatedMessages,
          lastUpdated: Date.now()
        })
      );
      return;
    }

    // 3. Normal AI Chat workflow
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const response = await aiApi.sendMessage(textToSend, imageBase64, sessionId);

      const assistantMsg = {
        id: "msg_" + (Date.now() + 1),
        sender: "assistant",
        text: response.message,
        timestamp: new Date(),
        products: response.products
      };

      if (response.intent === "escalate") {
        setIsEscalated(true);
        assistantMsg.isEscalated = true;

        // Auto-register in localStorage
        const activeSessions = JSON.parse(localStorage.getItem("aura_escalated_sessions") || "[]");
        if (!activeSessions.includes(sessionId)) {
          activeSessions.push(sessionId);
          localStorage.setItem("aura_escalated_sessions", JSON.stringify(activeSessions));
        }
        localStorage.setItem(
          "aura_chat_session_" + sessionId,
          JSON.stringify({
            isEscalated: true,
            messages: [...messages, userMsg, assistantMsg],
            lastUpdated: Date.now()
          })
        );
      }

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: "msg_err",
          sender: "system",
          text: "Đã xảy ra lỗi kết nối với máy chủ AI. Vui lòng thử lại sau.",
          timestamp: new Date()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      // Simulate visual search triggering within chat
      handleSend("Tìm kiếm sản phẩm tương tự từ hình ảnh tải lên này", reader.result);
    };
    reader.readAsDataURL(file);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const resetChat = () => {
    setIsEscalated(false);
    setMessages([
      {
        id: "welcome_" + Date.now(),
        sender: "assistant",
        text: "Hội thoại đã được làm mới. Tôi là Aura AI, tôi có thể hỗ trợ gì cho bạn?",
        timestamp: new Date()
      }
    ]);
  };

  const openChatFromPopup = () => {
    setIsOpen(true);
    setShowPopup(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* 1. Welcoming Speech Bubble (Only show when chat is closed and showPopup is active) */}
      <AnimatePresence>
        {!isOpen && showPopup && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 15 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            onClick={openChatFromPopup}
            className="absolute bottom-28 right-2 mb-3 w-52 bg-[#fdfbf7] dark:bg-[#1a1715] text-[#c82229] dark:text-rose-400 p-2.5 rounded-2xl shadow-xl border border-[#e6dfd0] dark:border-[#2a2522] flex items-center justify-between gap-2.5 z-50 cursor-pointer hover:scale-102 transition-all group"
          >
            <div className="flex-1 min-w-0 pr-1 text-center">
              <p className="text-[13.5px] font-black text-[#c82229] dark:text-rose-400 leading-normal m-0">
                {popupText}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPopup(false);
              }}
              className="text-[#968e7d] hover:text-[#c82229] dark:hover:text-rose-400 bg-transparent border-none cursor-pointer p-0.5 shrink-0"
              title="Đóng thông báo"
            >
              <Icon name="close" className="text-xs" />
            </button>
            {/* Pop-up triangle anchor */}
            <div className="absolute -bottom-1.5 right-10 w-3 h-3 bg-[#fdfbf7] dark:bg-[#1a1715] border-r border-b border-[#e6dfd0] dark:border-[#2a2522] transform rotate-45"></div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Chat Widget Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-[320px] sm:w-[350px] h-[480px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden mb-4 mr-0 sm:mr-2"
          >
            {/* Header */}
            <header className="bg-gradient-to-r from-[#c82229] to-[#ec5158] text-white p-3.5 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center border border-white/30 overflow-hidden relative">
                  <img src={robot3} alt="Robot Avatar" className="w-7 h-7 object-contain" />
                </div>
                <div>
                  <h3 className="font-extrabold text-xs tracking-tight">Aura AI Assistant</h3>
                  <p className="text-[9px] text-white/80 font-medium">
                    {isEscalated ? "Hỗ trợ trực tiếp bởi Nhân Viên" : "Trực tuyến • Phản hồi tức thì"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetChat}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer border-none bg-transparent"
                  title="Làm mới hội thoại"
                >
                  <Icon name="refresh" className="text-sm" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer border-none bg-transparent"
                  title="Thu nhỏ"
                >
                  <Icon name="close" className="text-sm" />
                </button>
              </div>
            </header>

            {/* Escalation Notification Bar */}
            {isEscalated && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/30 px-4 py-2 flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                  <Icon name="support_agent" className="text-xs" />
                  Đã chuyển giao tư vấn viên trực tiếp
                </span>
                <button
                  onClick={() => setIsEscalated(false)}
                  className="text-[9px] text-rose-600 dark:text-rose-400 font-bold hover:underline bg-transparent border-none cursor-pointer"
                >
                  Bật lại AI
                </button>
              </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/40">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                      msg.sender === "user"
                        ? "bg-rose-600 text-white rounded-br-none"
                        : msg.sender === "system"
                        ? "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-center mx-auto"
                        : "bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none"
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                    {/* Recommendation Products */}
                    {msg.products && msg.products.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                          Sản phẩm gợi ý:
                        </p>
                        {msg.products.map((prod) => (
                          <div
                            key={prod.id}
                            className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl hover:shadow-sm transition-all"
                          >
                            <img
                              src={prod.image}
                              alt={prod.name}
                              className="w-12 h-12 object-contain bg-white dark:bg-slate-950 rounded-lg p-1 border border-slate-100 dark:border-slate-800 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className="font-extrabold text-[10px] text-slate-800 dark:text-slate-200 truncate">
                                {prod.name}
                              </h4>
                              <p className="text-[10px] text-rose-600 dark:text-rose-400 font-extrabold mt-0.5">
                                {formatVnd(prod.price)}
                              </p>
                              {prod.matchScore && (
                                <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-1 py-0.5 rounded mt-1 inline-block">
                                  Độ khớp: {prod.matchScore}%
                                </span>
                              )}
                            </div>
                            <Link
                              to={`/product/${prod.id}`}
                              onClick={() => setIsOpen(false)}
                              className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg transition-all shrink-0"
                              title="Xem chi tiết"
                            >
                              <Icon name="arrow_forward" className="text-xs" />
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Bot loading state */}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Starter Prompts */}
            {messages.length === 1 && !loading && (
              <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
                {STARTER_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(prompt.text)}
                    className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-950 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 text-left border border-slate-100 dark:border-slate-800 rounded-xl transition-all text-[10px] text-slate-600 dark:text-slate-400 font-extrabold cursor-pointer"
                  >
                    <Icon name={prompt.icon} className="text-xs text-rose-600" />
                    <span className="truncate">{prompt.text}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Input Bar */}
            <footer className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={triggerFileInput}
                className="w-9 h-9 flex items-center justify-center bg-slate-100 hover:bg-rose-100 hover:text-rose-600 text-slate-500 rounded-full cursor-pointer transition-colors border-none shrink-0"
                title="Tải ảnh tìm kiếm"
              >
                <Icon name="photo_camera" className="text-sm" />
              </button>

              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend(inputValue)}
                placeholder="Nhập nội dung tin nhắn..."
                className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-full px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-rose-500/20 transition-all dark:text-white"
              />

              <button
                type="button"
                onClick={() => handleSend(inputValue)}
                className="w-9 h-9 flex items-center justify-center bg-rose-600 hover:bg-rose-700 text-white rounded-full cursor-pointer transition-colors border-none shrink-0"
                title="Gửi"
              >
                <Icon name="send" className="text-sm" />
              </button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Floating Robot Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-24 h-24 bg-transparent flex items-center justify-center border-none cursor-pointer hover:scale-105 active:scale-95 transition-all select-none relative group overflow-visible"
        title="Trợ lý Aura AI"
      >
        <AnimatedRobotMascot waving={!isOpen} size={96} />
        <span className="absolute top-2.5 right-2.5 w-3.5 h-3.5 bg-emerald-400 border-2 border-white dark:border-slate-950 rounded-full"></span>
        <span className="absolute right-28 scale-0 group-hover:scale-100 transition-all bg-slate-950 text-white text-[10px] font-black px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-md">
          Chat với Trợ lý AI
        </span>
      </button>
    </div>
  );
}
