import Icon from "../../../components/common/Icon.jsx";

const STEPS = [
  { key: 1, label: "Giỏ hàng", icon: "shopping_cart" },
  { key: 2, label: "Thông tin giao nhận", icon: "local_shipping" },
  { key: 3, label: "Thanh toán", icon: "check_circle" },
];

/**
 * Thanh trạng thái 3 bước (Giỏ hàng → Thông tin giao nhận → Thanh toán)
 * dùng chung style với OrderDetailPage.
 */
export default function CheckoutSteps({ currentStep = 1, completed = false }) {
  const progressWidth = completed
    ? "calc(100% - 2.5rem)"
    : currentStep === 2
      ? "calc(50% - 1.25rem)"
      : "0%";

  return (
    <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.015)]">
      <div className="relative flex items-center justify-between w-full max-w-3xl mx-auto">
        {/* Background Line */}
        <div className="absolute left-[20px] right-[20px] top-[15px] h-[3px] bg-slate-200 dark:bg-slate-800 z-0 rounded-full" />

        {/* Dynamic Progress Line */}
        <div
          className={`absolute left-[20px] top-[15px] h-[3px] transition-all duration-500 z-0 rounded-full ${
            completed ? "bg-emerald-600" : "bg-primary"
          }`}
          style={{ width: progressWidth }}
        />

        {STEPS.map((step) => {
          const isDoneOrActive = completed || step.key <= currentStep;
          const isSuccessFinal = completed && step.key === 3;

          const circleClass = isSuccessFinal
            ? "bg-emerald-600 border-emerald-600 text-white shadow-[0_0_10px_rgba(16,185,129,0.25)]"
            : isDoneOrActive
              ? "bg-primary border-primary text-white shadow-[0_0_10px_rgba(239,68,68,0.25)]"
              : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-400";

          return (
            <div key={step.key} className="flex flex-col items-center text-center relative z-10">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${circleClass}`}>
                <Icon name={step.icon} className="text-xs" />
              </div>
              <span
                className={`text-[10px] font-bold mt-2 block whitespace-nowrap ${
                  isDoneOrActive ? "text-slate-700 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {step.key === 3 && completed ? "Thành công" : step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

