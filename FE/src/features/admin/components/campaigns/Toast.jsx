import React from "react";

export default function Toast({ toast }) {
  if (!toast) return null;
  const variant = toast.type === "success" || toast.type === "error" ? " " + toast.type : "";
  return <div className={"cb-toast show" + variant}>{toast.msg}</div>;
}
