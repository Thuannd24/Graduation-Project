import React from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export default function FramerButton({
  children,
  onClick,
  type = "button",
  variant = "primary", // 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
  size = "md", // 'sm' | 'md' | 'lg'
  isLoading = false,
  disabled = false,
  icon: IconComponent,
  className = "",
  ...props
}) {
  // Styles mapping
  const baseStyles = "inline-flex items-center justify-center font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 duration-200 select-none";
  
  const variants = {
    primary: "bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white shadow-lg shadow-teal-500/10 focus:ring-teal-500",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 focus:ring-slate-600",
    outline: "bg-transparent border border-teal-500 hover:bg-teal-500/10 text-teal-400 focus:ring-teal-500",
    danger: "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-red-500/10 focus:ring-red-500",
    ghost: "bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-100 focus:ring-slate-700"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs gap-xs",
    md: "px-4 py-2 text-sm gap-sm",
    lg: "px-6 py-3 text-base gap-md"
  };

  const isDisabled = disabled || isLoading;

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${isDisabled ? "opacity-50 cursor-not-allowed pointer-events-none" : ""} ${className}`}
      whileHover={!isDisabled ? { scale: 1.02, y: -1 } : {}}
      whileTap={!isDisabled ? { scale: 0.98, y: 0 } : {}}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : IconComponent ? (
        <IconComponent className="w-4 h-4 shrink-0" />
      ) : null}
      <span>{children}</span>
    </motion.button>
  );
}
