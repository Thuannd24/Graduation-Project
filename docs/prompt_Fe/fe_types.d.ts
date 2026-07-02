/**
 * TypeScript Type Definitions for E-Commerce Microservices API Contract
 * Use these interfaces to validate request and response payloads on the Frontend.
 */

// General API response envelope wrapper
export interface ApiResponse<T> {
  code: 'SUCCESS' | 'ERROR' | 'VALIDATION_FAILED' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT';
  message: string;
  data: T;
}

// ==========================================
// 1. AUTHENTICATION & USER SERVICE
// ==========================================

export interface KeycloakTokenRequest {
  grant_type: 'password' | 'authorization_code' | 'refresh_token';
  client_id: 'ecommerce-frontend';
  username?: string;
  password?: string;
  code?: string;
  redirect_uri?: string;
  refresh_token?: string;
}

export interface KeycloakTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  refresh_token: string;
  token_type: string;
  'not-before-policy': number;
  session_state: string;
  scope: string;
}

export interface UserProfile {
  id: string; // UUID from Keycloak
  username: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  tier: string; // BRONZE, SILVER, GOLD, PLATINUM
  active: boolean;
  createdAt: string;
}

export interface UpdateProfileRequest {
  fullName?: string; // Max 100 characters
  phoneNumber?: string; // Max 20 characters
  avatarUrl?: string;
}

export interface AddressRequest {
  recipientName: string; // Not blank
  phoneNumber: string; // Not blank
  province: string; // Not blank
  districtWard: string; // Not blank
  detailAddress: string; // Not blank
  isDefault?: boolean;
}

export interface AddressResponse {
  id: number;
  userId: string;
  recipientName: string;
  phoneNumber: string;
  province: string;
  districtWard: string;
  detailAddress: string;
  isDefault: boolean;
  createdAt: string;
}

export interface BlacklistRequest {
  blacklisted: boolean;
  reason?: string;
}

// ==========================================
// 2. PRODUCT SERVICE (CATALOG & WISHLIST)
// ==========================================

export interface CategoryDto {
  id?: number;
  name: string; // Not blank
  slug: string; // Not blank
  parentId?: number | null;
  imageUrl?: string;
  sortOrder?: number;
  active?: boolean;
  children?: CategoryDto[];
}

export interface BrandDto {
  id?: number;
  name: string;
  slug: string;
  logoUrl?: string;
  description?: string;
  active?: boolean;
}

export interface ProductVariantDto {
  id?: number;
  productId?: number;
  sku: string; // Stock Keeping Unit
  variantAttr: string | Record<string, string>; // JSON representation
  price: number;
  costPrice?: number;
  weight?: number;
  imageUrl?: string;
  active?: boolean;
}

export interface ProductDto {
  id?: number;
  name: string; // Not blank
  slug: string; // Not blank
  description?: string;
  attributes?: string | Record<string, any>; // JSON metadata
  price: number; // Decimal >= 0
  costPrice?: number;
  salePrice?: number;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  categoryId: number; // Required
  brandId?: number;
  brand?: string;
  imageUrl?: string;
  images?: string[]; // Gallery URLs
  salesCount?: number;
  ratingAvg?: number;
  status: 'DRAFT' | 'PUBLISHED' | 'OUT_OF_STOCK' | 'ARCHIVED';
  warrantyPeriod?: number; // months
  warrantyPolicy?: string;
  active?: boolean;
  variants?: ProductVariantDto[];
  tags?: string[];
}

export interface ReviewRequest {
  productId: number;
  rating: number; // 1 to 5
  comment: string;
  imageUrls?: string[];
}

export interface ReviewResponse {
  id: number;
  productId: number;
  userId: string;
  username: string;
  rating: number;
  comment: string;
  imageUrls: string[];
  createdAt: string;
}

// ==========================================
// 3. CART & ORDER SERVICE
// ==========================================

export interface CartItemRequest {
  productId: number;
  variantId?: number;
  quantity: number; // Min 1
}

export interface CartItemResponse {
  productId: number;
  productName: string;
  productSlug: string;
  variantId?: number;
  sku?: string;
  variantAttr?: string | Record<string, string>;
  imageUrl?: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

export interface CartResponse {
  userId: string;
  items: CartItemResponse[];
  totalAmount: number;
  totalWeight: number; // weight in grams
}

export interface CheckoutRequest {
  shippingAddress: string; // Not blank
  phoneNumber: string; // Not blank
  couponCode?: string;
  note?: string;
}

export interface OrderItemResponse {
  id: number;
  productId: number;
  productName: string;
  variantId?: number;
  sku?: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

export interface OrderResponse {
  id: number;
  userId: string;
  status: 'PENDING' | 'AWAITING_PAYMENT' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  totalAmount: number;
  couponCode?: string;
  discountAmount: number;
  finalAmount: number;
  shippingAddress: string;
  phoneNumber: string;
  note?: string;
  trackingCode?: string;
  items: OrderItemResponse[];
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 4. INVENTORY SERVICE
// ==========================================

export interface InventoryResponse {
  productId: number;
  variantId?: number;
  quantity: number;
  safetyStock: number;
  updatedAt: string;
}

export interface InventoryUpdateRequest {
  quantity: number; // >= 0
}

export interface RestockRequest {
  quantity: number; // >= 1
  supplier?: string;
  note?: string;
}

export interface InventoryTransactionResponse {
  id: number;
  productId: number;
  variantId?: number;
  transactionType: 'DEDUCT' | 'RELEASE' | 'RESTOCK' | 'ADJUST';
  quantityChanged: number;
  orderId?: number;
  supplier?: string;
  note?: string;
  createdAt: string;
}

// ==========================================
// 5. PAYMENT SERVICE
// ==========================================

export interface PaymentInitiateRequest {
  orderId: number;
  amount?: number;
  paymentMethod: 'COD' | 'VNPAY';
  ipAddress?: string;
  userId?: string;
  email?: string;
}

export interface PaymentInitiateResponse {
  paymentId: number;
  orderId: number;
  paymentMethod: string;
  amount: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  paymentUrl?: string; // Populated if paymentMethod is VNPAY
  createdAt: string;
}

export interface RefundRequest {
  paymentId: number;
  amount: number; // Positive
  reason: string; // Not blank
}

// ==========================================
// 6. PROMOTION SERVICE (CAMUNDA WORKFLOWS)
// ==========================================

export interface WorkflowNode {
  id: string;
  type: string;
  data: Record<string, any>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

export interface WorkflowGraphDto {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface ValidationErrorDetail {
  elementId: string;
  fieldName?: string;
  errorMessage: string;
}

export interface ValidationResultDto {
  valid: boolean;
  summary: string;
  errors: ValidationErrorDetail[];
}

export interface CampaignDto {
  id?: number;
  name: string;
  processKey: string;
  description?: string;
  workflowJson?: string; // WorkflowGraphDto serialized
  bpmnXml?: string;
  active: boolean;
  createdAt?: string;
}

// ==========================================
// 7. NOTIFICATION SERVICE
// ==========================================

export interface FCMTokenRequest {
  fcmToken: string;
  platform: 'WEB' | 'ANDROID' | 'IOS';
  deviceId?: string;
}

export interface NotificationDto {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: 'ORDER_STATUS' | 'PAYMENT' | 'PROMOTION' | 'SYSTEM';
  read: boolean;
  createdAt: string;
}
