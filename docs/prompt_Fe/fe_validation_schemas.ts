import { z } from 'zod';

/**
 * Zod validation schemas matching Backend Spring Boot annotations.
 * Use these schemas in React Hook Form / Formik / Vanilla JS to validate data
 * on the Frontend before hitting the microservices.
 */

// ==========================================
// 1. AUTHENTICATION & USER SERVICE
// ==========================================

export const UpdateProfileSchema = z.object({
  fullName: z
    .string()
    .max(100, { message: 'Họ và tên không được vượt quá 100 ký tự' })
    .optional(),
  phoneNumber: z
    .string()
    .max(20, { message: 'Số điện thoại không được vượt quá 20 ký tự' })
    .regex(/^[0-9+()#.\s/\\-]*$/, { message: 'Số điện thoại không hợp lệ' })
    .optional(),
  avatarUrl: z.string().url({ message: 'Đường dẫn ảnh đại diện không hợp lệ' }).optional(),
});

export const AddressSchema = z.object({
  recipientName: z
    .string()
    .trim()
    .min(1, { message: 'Tên người nhận không được để trống' })
    .max(100, { message: 'Tên người nhận quá dài' }),
  phoneNumber: z
    .string()
    .trim()
    .min(1, { message: 'Số điện thoại không được để trống' })
    .regex(/^(0|\+84)[35789][0-9]{8}$/, { message: 'Số điện thoại Việt Nam không hợp lệ' }),
  province: z
    .string()
    .trim()
    .min(1, { message: 'Tỉnh/Thành phố không được để trống' }),
  districtWard: z
    .string()
    .trim()
    .min(1, { message: 'Quận/Huyện/Phường/Xã không được để trống' }),
  detailAddress: z
    .string()
    .trim()
    .min(1, { message: 'Địa chỉ chi tiết không được để trống' })
    .max(255, { message: 'Địa chỉ chi tiết quá dài' }),
  isDefault: z.boolean().default(false),
});

export const BlacklistSchema = z.object({
  blacklisted: z.boolean({ required_error: 'Trạng thái khóa bắt buộc nhập' }),
  reason: z.string().trim().optional(),
});

// ==========================================
// 2. PRODUCT SERVICE (CATALOG & WISH LIST)
// ==========================================

export const CategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Tên danh mục không được để trống' })
    .max(100, { message: 'Tên danh mục không được vượt quá 100 ký tự' }),
  slug: z
    .string()
    .trim()
    .min(1, { message: 'Slug không được để trống' })
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Slug chỉ chứa chữ thường, số và gạch ngang (dạng: dien-thoai)' }),
  parentId: z.number().nullable().optional(),
  imageUrl: z.string().url({ message: 'URL ảnh không hợp lệ' }).optional().or(z.literal('')),
  sortOrder: z.number().int().nonnegative().optional().default(0),
  active: z.boolean().default(true),
});

export const BrandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Tên thương hiệu không được để trống' }),
  slug: z
    .string()
    .trim()
    .min(1, { message: 'Slug không được để trống' })
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Slug không hợp lệ' }),
  logoUrl: z.string().url({ message: 'URL logo không hợp lệ' }).optional().or(z.literal('')),
  description: z.string().optional(),
  active: z.boolean().default(true),
});

export const ProductVariantSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, { message: 'SKU không được để trống' }),
  variantAttr: z.record(z.string()).or(z.string()), // Attributes mapping Color/Storage
  price: z
    .number({ invalid_type_error: 'Giá bán phải là số' })
    .nonnegative({ message: 'Giá bán không được phép âm' }),
  costPrice: z
    .number()
    .nonnegative({ message: 'Giá gốc không được phép âm' })
    .optional(),
  weight: z
    .number()
    .positive({ message: 'Khối lượng phải lớn hơn 0' })
    .optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  active: z.boolean().default(true),
});

export const ProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Tên sản phẩm không được để trống' }),
  slug: z
    .string()
    .trim()
    .min(1, { message: 'Slug không được để trống' })
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Slug không hợp lệ' }),
  description: z.string().optional(),
  attributes: z.record(z.any()).or(z.string()).optional(),
  price: z
    .number({ required_error: 'Giá bán là bắt buộc' })
    .nonnegative({ message: 'Giá bán không được phép âm' }),
  costPrice: z
    .number()
    .nonnegative({ message: 'Giá gốc không được phép âm' })
    .optional(),
  salePrice: z
    .number()
    .nonnegative({ message: 'Giá khuyến mãi không được phép âm' })
    .optional(),
  weight: z.number().positive({ message: 'Khối lượng (gram) phải lớn hơn 0' }).optional(),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  categoryId: z.number({ required_error: 'Danh mục sản phẩm là bắt buộc' }),
  brandId: z.number().optional(),
  imageUrl: z.string().url({ message: 'Ảnh chính không hợp lệ' }).optional().or(z.literal('')),
  images: z.array(z.string().url()).optional().default([]),
  status: z.enum(['DRAFT', 'PUBLISHED', 'OUT_OF_STOCK', 'ARCHIVED']),
  warrantyPeriod: z.number().int().nonnegative().optional(),
  warrantyPolicy: z.string().optional(),
  active: z.boolean().default(true),
  variants: z.array(ProductVariantSchema).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
});

export const ReviewSchema = z.object({
  productId: z.number(),
  rating: z
    .number()
    .int()
    .min(1, { message: 'Đánh giá tối thiểu là 1 sao' })
    .max(5, { message: 'Đánh giá tối đa là 5 sao' }),
  comment: z
    .string()
    .trim()
    .min(10, { message: 'Nội dung bình luận phải có ít nhất 10 ký tự' }),
  imageUrls: z.array(z.string().url()).optional().default([]),
});

// ==========================================
// 3. CART & ORDER SERVICE
// ==========================================

export const CartItemSchema = z.object({
  productId: z.number({ required_error: 'Product ID là bắt buộc' }),
  variantId: z.number().optional(),
  quantity: z
    .number({ required_error: 'Số lượng là bắt buộc' })
    .int()
    .min(1, { message: 'Số lượng mua tối thiểu là 1' }),
});

export const CheckoutSchema = z.object({
  shippingAddress: z
    .string()
    .trim()
    .min(5, { message: 'Địa chỉ giao hàng phải có ít nhất 5 ký tự' }),
  phoneNumber: z
    .string()
    .trim()
    .min(1, { message: 'Số điện thoại liên hệ là bắt buộc' })
    .regex(/^(0|\+84)[35789][0-9]{8}$/, { message: 'Số điện thoại không đúng định dạng Việt Nam' }),
  couponCode: z.string().trim().optional().or(z.literal('')),
  note: z.string().trim().max(500, { message: 'Ghi chú không được vượt quá 500 ký tự' }).optional().or(z.literal('')),
});

// ==========================================
// 4. INVENTORY SERVICE
// ==========================================

export const InventoryUpdateSchema = z.object({
  quantity: z
    .number({ required_error: 'Số lượng tồn kho là bắt buộc' })
    .int()
    .nonnegative({ message: 'Số lượng không được âm' }),
});

export const RestockSchema = z.object({
  quantity: z
    .number({ required_error: 'Số lượng nhập kho là bắt buộc' })
    .int()
    .min(1, { message: 'Số lượng nhập phải lớn hơn hoặc bằng 1' }),
  supplier: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

// ==========================================
// 5. PAYMENT SERVICE
// ==========================================

export const PaymentInitiateSchema = z.object({
  orderId: z.number({ required_error: 'Order ID là bắt buộc' }),
  amount: z.number().positive().optional(),
  paymentMethod: z.enum(['COD', 'VNPAY'], { required_error: 'Phương thức thanh toán là bắt buộc' }),
});

export const RefundSchema = z.object({
  paymentId: z.number({ required_error: 'Payment ID là bắt buộc' }),
  amount: z
    .number({ required_error: 'Số tiền hoàn là bắt buộc' })
    .positive({ message: 'Số tiền hoàn trả phải lớn hơn 0' }),
  reason: z
    .string()
    .trim()
    .min(5, { message: 'Lý do hoàn trả phải từ 5 ký tự trở lên' }),
});

// ==========================================
// 6. NOTIFICATION SERVICE
// ==========================================

export const FCMTokenSchema = z.object({
  fcmToken: z.string().trim().min(1, { message: 'FCM Token không được để trống' }),
  platform: z.enum(['WEB', 'ANDROID', 'IOS']),
  deviceId: z.string().trim().optional(),
});
