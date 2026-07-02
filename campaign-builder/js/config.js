// API Configuration — gọi qua API Gateway (CORS + JWT)
// Nếu mở file trực tiếp (file://) gặp CORS: chạy serve.ps1 rồi mở http://localhost:5500
const API_BASE_URL = 'http://localhost:8080';
const KEYCLOAK_TOKEN_URL = 'http://localhost:8080/realms/ecommerce-realm/protocol/openid-connect/token';
const KEYCLOAK_CLIENT_ID = 'ecommerce-frontend';
const TOKEN_STORAGE_KEY = 'campaign_builder_access_token';

// Metadata của các loại node bằng tiếng Việt
const NODE_TYPES = {
    // Triggers (Sự kiện bắt đầu)
    'Trigger_Event_NewUser': { category: 'trigger', name: 'Sự kiện: Đăng ký mới', icon: '👤', defaultProps: {} },
    'Trigger_Event_OrderSuccess': { category: 'trigger', name: 'Sự kiện: Đơn hàng thành công', icon: '🛒', defaultProps: { minOrderValue: 100000 } },
    'Trigger_Event_ReviewProduct': { category: 'trigger', name: 'Sự kiện: Đánh giá sản phẩm', icon: '⭐', defaultProps: { minRating: 5 } },
    'Trigger_Timer_Schedule': { category: 'trigger', name: 'Sự kiện: Hẹn giờ định kỳ', icon: '⏰', defaultProps: { cronExpression: '0 0 12 * * ?' } },
    
    // Conditions (Khối điều kiện rẽ nhánh)
    'Condition_MemberRank': { category: 'condition', name: 'Điều kiện: Hạng thành viên', icon: '👑', defaultProps: { allowedRanks: ['GOLD', 'VIP'] } },
    'Condition_TotalSpending': { category: 'condition', name: 'Điều kiện: Tổng chi tiêu tháng', icon: '💰', defaultProps: { minSpendingAmount: 5000000, daysLookback: 30 } },
    'Condition_Location': { category: 'condition', name: 'Điều kiện: Lọc tỉnh/thành', icon: '📍', defaultProps: { targetProvinces: ['Hanoi', 'Ho Chi Minh'] } },
    'Condition_ContainsCategory': { category: 'condition', name: 'Điều kiện: Có danh mục sản phẩm', icon: '🏷️', defaultProps: { targetIds: ['101', '102'] } },
    'Condition_ContainsProduct': { category: 'condition', name: 'Điều kiện: Có sản phẩm', icon: '📦', defaultProps: { targetIds: ['prod-001'] } },
    'Condition_AntiFraudScore': { category: 'condition', name: 'Điều kiện: Chống gian lận', icon: '🛡️', defaultProps: { maxRiskScore: 50 } },
    
    // Actions (Hành động ưu đãi)
    'Action_IssueVoucher_Percent': { category: 'action', name: 'Hành động: Tặng voucher %', icon: '🎟️', defaultProps: { discountPercent: 10, maxDiscountAmount: 50000, expireDays: 7 } },
    'Action_IssueVoucher_Fixed': { category: 'action', name: 'Hành động: Tặng voucher giảm tiền', icon: '💵', defaultProps: { discountAmount: 20000, minOrderValue: 150000, expireDays: 7 } },
    'Action_IssueVoucher_Freeship': { category: 'action', name: 'Hành động: Tặng voucher Freeship', icon: '🚚', defaultProps: { maxShippingDiscount: 30000, expireDays: 7 } },
    'Action_Upgrade_MemberRank': { category: 'action', name: 'Hành động: Nâng hạng hội viên', icon: '📈', defaultProps: { targetTier: 'GOLD' } },
    'Action_Loyalty_Point': { category: 'action', name: 'Hành động: Tặng/Trừ điểm thưởng', icon: '💎', defaultProps: { pointAmount: 100, calculationMode: 'FIXED' } },
    'Action_Send_Email': { category: 'action', name: 'Hành động: Gửi Email thông báo', icon: '✉️', defaultProps: { templateId: 'welcome_template', rawContent: '' } },
    'Action_Send_SMS': { category: 'action', name: 'Hành động: Gửi SMS thông báo', icon: '💬', defaultProps: { templateId: 'sms_otp_template', rawContent: '' } },
    
    // End
    'End_Event': { category: 'end', name: 'Kết thúc', icon: '🏁' }
};
