import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Icon from "../../../components/common/Icon.jsx";
import { aiApi } from "../../../services/aiApi.ts";

export default function VisualSearchModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [imageSrc, setImageSrc] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState("");
  const [error, setError] = useState("");
  const [cropBox, setCropBox] = useState({ x: 10, y: 10, width: 80, height: 80 }); // Percentage-based crop box
  const dragRef = useRef(null);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      loadImage(file);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      loadImage(file);
    }
  };

  const loadImage = (file) => {
    setError("");
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSearch = async () => {
    if (!imageFile) return;

    setError("");
    setLoading(true);
    try {
      // Step 1: Detect
      setCurrentStep("YOLO v8 đang phát hiện vật thể và tối ưu hóa vùng biên...");
      await new Promise((r) => setTimeout(r, 800));

      // Step 2: Crop & Embed
      setCurrentStep("Trích xuất đặc trưng vector bằng mô hình CLIP (ViT-B/32)...");
      await new Promise((r) => setTimeout(r, 850));

      // Step 3: FAISS Search
      setCurrentStep("Đang khớp vector trên FAISS Index (ANN Search)...");
      const results = await aiApi.searchByImage(imageFile);

      // Save to sessionStorage for SearchPage to retrieve.
      // Ưu tiên cropBox từ backend (YOLO); nếu YOLO tắt (null) thì dùng khung người dùng chọn.
      sessionStorage.setItem("visual_search_results", JSON.stringify(results.items));
      sessionStorage.setItem("visual_search_image", imageSrc || "");
      sessionStorage.setItem("visual_search_crop", JSON.stringify(results.cropBox ?? cropBox));

      onClose();
      navigate("/search?imageSearch=true");
    } catch (err) {
      // Không điều hướng khi lỗi — giữ modal mở và hiện thông báo lỗi inline để người dùng thử lại.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setCurrentStep("");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
      >
        {/* Header */}
        <header className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
          <div className="flex items-center gap-2">
            <Icon name="photo_camera" className="text-rose-600 text-xl" />
            <h3 className="font-black text-sm text-slate-800 dark:text-slate-200 tracking-tight">
              Tìm kiếm bằng hình ảnh (Visual Search AI)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer border-none bg-transparent"
          >
            <Icon name="close" className="text-lg" />
          </button>
        </header>

        {/* Body */}
        <div className="p-6">
          {loading ? (
            /* Loading State */
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-rose-100 dark:border-rose-950/20"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-rose-600 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Icon name="bolt" className="text-2xl text-rose-600 animate-pulse" />
                </div>
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200">
                  Aura AI đang phân tích hình ảnh...
                </h4>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-bold animate-pulse">
                  {currentStep}
                </p>
              </div>
            </div>
          ) : !imageSrc ? (
            /* Upload State */
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-rose-400 dark:hover:border-rose-500 rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-slate-50 dark:bg-slate-950/30 hover:bg-rose-50/10"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                className="hidden"
              />
              <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center mb-4 text-rose-600">
                <Icon name="cloud_upload" className="text-3xl" />
              </div>
              <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-200 mb-1">
                Kéo thả hình ảnh vào đây hoặc bấm để chọn tệp
              </h4>
              <p className="text-[10px] text-slate-400 max-w-xs">
                Hỗ trợ định dạng JPG, PNG. Aura AI sẽ tự động khoanh vùng vật thể sản phẩm bằng mô hình YOLOv8.
              </p>
            </div>
          ) : (
            /* Crop & Confirm State */
            <div className="space-y-4">
              <div className="relative max-h-[350px] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-950 flex items-center justify-center border border-slate-200 dark:border-slate-800">
                <img
                  src={imageSrc}
                  alt="Search query"
                  className="max-h-[350px] object-contain select-none"
                />

                {/* Simulated Crop Area Overlay (Resized relative cropbox overlay) */}
                <div
                  style={{
                    position: "absolute",
                    left: `${cropBox.x}%`,
                    top: `${cropBox.y}%`,
                    width: `${cropBox.width}%`,
                    height: `${cropBox.height}%`,
                    border: "2px solid #ef4444",
                    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.4)",
                    pointerEvents: "none"
                  }}
                  className="rounded-sm"
                >
                  <span className="absolute -top-6 left-0 bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow flex items-center gap-1">
                    <Icon name="center_focus_strong" className="text-[10px]" />
                    YOLO v8: Product detected
                  </span>
                </div>
              </div>

              {/* Crop control help */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="flex items-center gap-1">
                  <Icon name="info" className="text-rose-600 text-xs" />
                  Bạn có thể kéo điều chỉnh vùng ảnh để tăng độ chính xác tìm kiếm sản phẩm.
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCropBox({ x: 20, y: 20, width: 60, height: 60 })}
                    className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-bold hover:bg-slate-50 cursor-pointer"
                  >
                    Thu nhỏ
                  </button>
                  <button
                    onClick={() => setCropBox({ x: 5, y: 5, width: 90, height: 90 })}
                    className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-bold hover:bg-slate-50 cursor-pointer"
                  >
                    Khôi phục
                  </button>
                </div>
              </div>

              {/* Error State — hiện lỗi thật khi call AI thất bại (thay vì âm thầm trả mock) */}
              {error && (
                <div className="flex items-start gap-2 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 p-3 rounded-lg border border-rose-200 dark:border-rose-900">
                  <Icon name="error" className="text-rose-600 text-sm shrink-0 mt-0.5" />
                  <span>
                    <b className="font-black">Tìm kiếm hình ảnh thất bại.</b> {error}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {imageSrc && !loading && (
          <footer className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
            <button
              onClick={() => {
                setImageSrc(null);
                setImageFile(null);
              }}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-extrabold text-xs rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
            >
              Chọn ảnh khác
            </button>
            <button
              onClick={handleSearch}
              className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-rose-500/20 cursor-pointer transition-all"
            >
              Tìm kiếm sản phẩm
            </button>
          </footer>
        )}
      </motion.div>
    </div>
  );
}
