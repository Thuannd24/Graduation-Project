// ─────────────────────────────────────────────────────────────────────────────
// Node type metadata & shared constants for the campaign builder
// (identical to standalone campaign-builder/js/config.js)
// ─────────────────────────────────────────────────────────────────────────────

export const NODE_TYPES = {
  Trigger_Event_NewUser:        { cat: "trigger",   name: "Đăng ký mới",          def: {} },
  Trigger_Event_OrderSuccess:   { cat: "trigger",   name: "Đơn hàng thành công", def: { minOrderValue: 100000 } },
  Trigger_Event_ReviewProduct:  { cat: "trigger",   name: "Đánh giá sản phẩm",   def: { minRating: 5 } },
  Trigger_Timer_Schedule:       { cat: "trigger",   name: "Hẹn giờ định kỳ",     def: { cronExpression: "0 0 12 * * ?", scheduleFrequency: "daily", scheduleHour: 12 } },
  Condition_MemberRank:         { cat: "condition", name: "Hạng thành viên",   def: { allowedRanks: ["MEMBER", "SILVER", "GOLD", "VIP"] } },
  Condition_TotalSpending:      { cat: "condition", name: "Tổng chi tiêu", def: { minSpendingAmount: 5000000, daysLookback: 30 } },
  Condition_Location:           { cat: "condition", name: "Lọc tỉnh/thành",    def: { targetProvinces: [] } },
  Condition_ContainsCategory:   { cat: "condition", name: "Có danh mục SP", def: { targetIds: [] } },
  Condition_ContainsProduct:    { cat: "condition", name: "Có sản phẩm",       def: { targetIds: [] } },
  Condition_AntiFraudScore:     { cat: "condition", name: "Chống gian lận",    def: { maxRiskScore: 50 } },
  Action_IssueVoucher_Percent:  { cat: "action",    name: "Tặng voucher %",    def: { discountPercent: 10, maxDiscountAmount: 50000, expireDays: 7 } },
  Action_IssueVoucher_Fixed:    { cat: "action",    name: "Voucher giảm tiền", def: { discountAmount: 20000, minOrderValue: 150000, expireDays: 7 } },
  Action_IssueVoucher_Freeship: { cat: "action",    name: "Voucher Freeship",  def: { maxShippingDiscount: 30000, expireDays: 7 } },
  Action_Upgrade_MemberRank:    { cat: "action",    name: "Nâng hạng hội viên", def: { targetTier: "GOLD" } },
  Action_Loyalty_Point:         { cat: "action",    name: "Tặng điểm thưởng",  def: { pointAmount: 100, calculationMode: "FIXED" } },
  Action_Send_Email:            { cat: "action",    name: "Gửi Email",         def: { templateId: "welcome_template", rawContent: "" } }
};

export const MEMBER_RANKS = [
  { value: "MEMBER", label: "MEMBER — Thành viên" },
  { value: "SILVER", label: "SILVER — Bạc" },
  { value: "GOLD", label: "GOLD — Vàng" },
  { value: "VIP", label: "VIP — Cao cấp" }
];

export const UPGRADE_TIERS = [
  { value: "SILVER", label: "SILVER — Bạc" },
  { value: "GOLD", label: "GOLD — Vàng" },
  { value: "VIP", label: "VIP — Cao cấp" }
];

export const CAT_NAMES = {
  trigger:   "Sự Kiện Kích Hoạt (Trigger)",
  condition: "Điều Kiện Phân Nhánh",
  action:    "Hành Động Nhận Thưởng"
};

export const CAT_DOTS = {
  trigger:   "cb-dot-trigger",
  condition: "cb-dot-condition",
  action:    "cb-dot-action"
};

export const CAT_KEYS = ["trigger", "condition", "action"];

// Camunda BPMN diagram spacing when sending x/y to backend
export const CANVAS_X_STEP   = 220;
export const CANVAS_Y_STEP   = 160;
export const CANVAS_X_ORIGIN = 100;
export const CANVAS_Y_ORIGIN = 80;

export const DEFAULT_NODES = [
  { id: "start", name: "Bắt đầu", type: "Trigger_Event_NewUser", properties: {} },
  { id: "end",   name: "Kết thúc", type: "End_Event", properties: {} }
];

export const DEFAULT_EDGES = [
  { id: "edge_start_to_end", source: "start", target: "end", isDefault: false, properties: {} }
];
