import { NODE_TYPES } from "../constants.js";

export function getTriggerLabel(type) {
  const map = {
    Trigger_Event_NewUser: "Đăng ký mới",
    Trigger_Event_OrderSuccess: "Đơn hàng thành công",
    Trigger_Event_ReviewProduct: "Đánh giá sản phẩm",
    Trigger_Timer_Schedule: "Hẹn giờ định kỳ"
  };
  return map[type] || "Trigger";
}

export function stripNodeDisplayName(name) {
  if (!name) return "";
  return name.replace(/^(Sự kiện|Điều kiện|Hành động):\s*/i, "").trim();
}

export function getNodeCategoryLabel(type) {
  const meta = NODE_TYPES[type];
  if (!meta) return type;
  return stripNodeDisplayName(meta.name) || meta.name;
}

export function getNodeSummary(node) {
  const p = node.properties || {};
  switch (node.type) {
    case "Trigger_Event_OrderSuccess":
      return p.minOrderValue ? `Đơn tối thiểu ${Number(p.minOrderValue).toLocaleString("vi-VN")}đ` : "";
    case "Trigger_Event_ReviewProduct":
      return p.minRating ? `Từ ${p.minRating} sao` : "";
    case "Trigger_Timer_Schedule": {
      const h = p.scheduleHour ?? 12;
      return `Chạy lúc ${String(h).padStart(2, "0")}:00`;
    }
    case "Condition_MemberRank":
      return "Phân nhánh theo hạng thành viên";
    case "Condition_TotalSpending":
      return "Phân nhánh theo tổng chi tiêu";
    case "Condition_Location":
      return "Phân nhánh theo tỉnh/thành";
    case "Condition_ContainsCategory":
      return "Phân nhánh theo danh mục SP";
    case "Condition_ContainsProduct":
      return "Phân nhánh theo sản phẩm";
    case "Condition_AntiFraudScore":
      return "Phân nhánh chống gian lận";
    case "Action_IssueVoucher_Percent":
      return p.discountPercent ? `Giảm ${p.discountPercent}%` : "";
    case "Action_IssueVoucher_Fixed":
      return p.discountAmount ? `Giảm ${Number(p.discountAmount).toLocaleString("vi-VN")}đ` : "";
    case "Action_IssueVoucher_Freeship":
      return "Miễn phí vận chuyển";
    case "Action_Upgrade_MemberRank":
      return p.targetTier ? `Nâng lên ${p.targetTier}` : "";
    case "Action_Loyalty_Point":
      return p.calculationMode === "ORDER_SPEND" ? "Tặng điểm theo đơn" : `Tặng ${p.pointAmount || 0} điểm`;
    case "Action_Send_Email":
      return p.templateId ? "Gửi email mẫu" : "Gửi email tùy chỉnh";
    default:
      return "";
  }
}
