// Ánh xạ dữ liệu THẬT của Olist (schema riêng, không liên quan gì tới TechStore) sang đúng schema
// đang dùng trong ecommerce_user_db/ecommerce_product_db/ecommerce_order_db.
//
// Quyết định ánh xạ quan trọng (ghi lại lý do, không tự ý đoán):
// - order_status: Olist có 8 trạng thái (created/approved/processing/invoiced/shipped/delivered/
//   unavailable/canceled). Project chỉ có DELIVERED/CANCELLED. CHỈ giữ 2 trạng thái map thẳng được
//   (delivered->DELIVERED, canceled->CANCELLED), BỎ 6 trạng thái trung gian còn lại — vì gán bừa
//   "processing" thành DELIVERED hay CANCELLED đều là bịa, thà mất dữ liệu còn hơn bịa nhãn.
// - Olist KHÔNG có tên sản phẩm thật (products.csv chỉ có category + kích thước vật lý) -> tên
//   hiển thị phải tổng hợp từ category + id, KHÔNG bịa tên sản phẩm cụ thể.
// - Olist KHÔNG có discount/coupon ở cấp đơn hàng -> discount_amount = 0, coupon_code = null
//   (không suy diễn thêm).
// - Giá gốc BRL nhân với BRL_TO_VND_RATE (xem .env.example) chỉ để hiển thị hợp lý dưới cột tiền
//   tệ VND — không ảnh hưởng phân bố tương đối dùng để train (xem ghi chú trong .env.example).
import crypto from "node:crypto";

const KEPT_ORDER_STATUS = { delivered: "DELIVERED", canceled: "CANCELLED" };
const SYNTHETIC_EMAIL_DOMAIN = "olist.import";

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Chọn ngẫu nhiên N customer_unique_id (trong số có ít nhất 1 đơn giữ lại) — dùng khi muốn import
 * 1 mẫu THẬT thay vì toàn bộ ~96k khách hàng (chạy nhanh hơn, vẫn là dữ liệu thật, không fabricate). */
function sampleCustomerIds(rng_seed, allIds, n) {
  if (n == null || n >= allIds.length) return new Set(allIds);
  // Fisher-Yates dùng Math.random() — KHÔNG cần reproducible tuyệt đối như tools/data-seed vì nội
  // dung mỗi khách hàng đều là dữ liệu THẬT như nhau, chỉ khác là lần chạy sau có thể chọn khác.
  const pool = [...allIds];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return new Set(pool.slice(0, n));
}

export function buildImportPlan(dataset, { brlToVndRate = 6000, maxCustomers = null } = {}) {
  const { customers, orders, orderItems, reviews, products, categoryTranslation } = dataset;

  const customerIdToUniqueId = new Map(customers.map((c) => [c.customer_id, c.customer_unique_id]));

  const keptOrders = orders.filter((o) => KEPT_ORDER_STATUS[o.order_status]);

  const uniqueCustomerIdsWithOrder = [
    ...new Set(keptOrders.map((o) => customerIdToUniqueId.get(o.customer_id)).filter(Boolean)),
  ];
  const chosenCustomerIds = sampleCustomerIds(null, uniqueCustomerIdsWithOrder, maxCustomers);

  const userIdByCustomerUniqueId = new Map();
  for (const uniqueId of chosenCustomerIds) {
    userIdByCustomerUniqueId.set(uniqueId, crypto.randomUUID());
  }

  const filteredOrders = keptOrders.filter((o) =>
    chosenCustomerIds.has(customerIdToUniqueId.get(o.customer_id))
  );
  const filteredOrderIds = new Set(filteredOrders.map((o) => o.order_id));

  const itemsByOrderId = new Map();
  for (const item of orderItems) {
    if (!filteredOrderIds.has(item.order_id)) continue;
    if (!itemsByOrderId.has(item.order_id)) itemsByOrderId.set(item.order_id, []);
    itemsByOrderId.get(item.order_id).push(item);
  }

  // Chỉ import đúng sản phẩm THẬT SỰ được tham chiếu bởi đơn hàng đã chọn (không kéo cả ~33k sản
  // phẩm của toàn dataset nếu đang chạy với --customers giới hạn).
  const referencedProductIds = new Set(
    [...itemsByOrderId.values()].flat().map((i) => i.product_id)
  );
  const productById = new Map(products.filter((p) => referencedProductIds.has(p.product_id)).map((p) => [p.product_id, p]));
  const categoryNameMap = new Map(
    categoryTranslation.map((c) => [c.product_category_name, c.product_category_name_english])
  );

  // Category: gom theo tên tiếng Anh đã dịch (fallback về tên gốc nếu thiếu bản dịch).
  const categoryEnglishNames = new Set();
  for (const p of productById.values()) {
    const raw = p.product_category_name || "unknown";
    categoryEnglishNames.add(categoryNameMap.get(raw) || raw);
  }
  const categories = [...categoryEnglishNames].map((name) => ({
    name: `Olist: ${name.replace(/_/g, " ")}`,
    slug: `olist-${slugify(name)}`,
  }));
  const categorySlugByEnglishName = new Map(
    [...categoryEnglishNames].map((name) => [name, `olist-${slugify(name)}`])
  );

  // Price catalogue: giá hiển thị = trung bình giá đã bán thật của sản phẩm đó (không bịa).
  const priceSumByProduct = new Map();
  const priceCountByProduct = new Map();
  for (const items of itemsByOrderId.values()) {
    for (const item of items) {
      const price = Number(item.price) || 0;
      priceSumByProduct.set(item.product_id, (priceSumByProduct.get(item.product_id) || 0) + price);
      priceCountByProduct.set(item.product_id, (priceCountByProduct.get(item.product_id) || 0) + 1);
    }
  }

  const productsToInsert = [...productById.entries()].map(([productId, p]) => {
    const rawCategory = p.product_category_name || "unknown";
    const englishName = categoryNameMap.get(rawCategory) || rawCategory;
    const avgPriceBrl = priceSumByProduct.get(productId) / (priceCountByProduct.get(productId) || 1);
    return {
      olistProductId: productId,
      name: `${englishName.replace(/_/g, " ")} (Olist #${productId.slice(0, 8)})`,
      slug: `olist-${productId}`,
      categorySlug: categorySlugByEnglishName.get(englishName),
      price: Math.round(avgPriceBrl * brlToVndRate),
      weight: p.product_weight_g ? Number(p.product_weight_g) / 1000 : null,
    };
  });

  const usersToInsert = [...chosenCustomerIds].map((uniqueId) => ({
    keycloakUserId: userIdByCustomerUniqueId.get(uniqueId),
    username: `olist_${uniqueId.slice(0, 12)}`,
    email: `olist_${uniqueId.slice(0, 12)}@${SYNTHETIC_EMAIL_DOMAIN}`,
    fullName: `Olist Customer ${uniqueId.slice(0, 8)}`,
  }));

  const ordersToInsert = filteredOrders.map((o) => {
    const items = itemsByOrderId.get(o.order_id) || [];
    const totalBrl = items.reduce((sum, i) => sum + (Number(i.price) || 0) + (Number(i.freight_value) || 0), 0);
    return {
      olistOrderId: o.order_id,
      userId: userIdByCustomerUniqueId.get(customerIdToUniqueId.get(o.customer_id)),
      status: KEPT_ORDER_STATUS[o.order_status],
      createdAt: o.order_purchase_timestamp,
      totalAmount: Math.round(totalBrl * brlToVndRate),
      items: items.map((i) => ({
        productSlug: `olist-${i.product_id}`,
        unitPrice: Math.round((Number(i.price) || 0) * brlToVndRate),
        quantity: 1, // Olist ghi 1 dòng/1 đơn vị sản phẩm (order_item_id tăng dần thay vì quantity)
      })),
    };
  });

  const reviewsToInsert = reviews
    .filter((r) => filteredOrderIds.has(r.order_id) && itemsByOrderId.has(r.order_id))
    .map((r) => ({
      olistOrderId: r.order_id,
      productSlug: `olist-${itemsByOrderId.get(r.order_id)[0].product_id}`,
      rating: Math.max(1, Math.min(5, Number(r.review_score) || 5)),
      comment: r.review_comment_message ? r.review_comment_message.trim() || null : null,
      createdAt: r.review_creation_date,
    }));

  return { categories, productsToInsert, usersToInsert, ordersToInsert, reviewsToInsert };
}

export { SYNTHETIC_EMAIL_DOMAIN };
