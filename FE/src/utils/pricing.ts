export interface RawProductPrices {
  price?: number | string | null;
  salePrice?: number | string | null;
  oldPrice?: number | string | null;
  originalPrice?: number | string | null;
}

export interface ResolvedProductPrices {
  /** Giá niêm yết từ BE (field price) */
  listPrice: number;
  /** Giá khuyến mãi hợp lệ */
  salePrice?: number;
  /** Giá hiển thị / khách trả */
  price: number;
  /** Giá gạch ngang khi đang giảm */
  oldPrice?: number;
}

export function resolveProductPrices(raw: RawProductPrices): ResolvedProductPrices {
  const listPrice = Number(raw.price ?? 0);
  const rawSale =
    raw.salePrice != null && raw.salePrice !== "" ? Number(raw.salePrice) : undefined;
  const hasDiscount =
    rawSale != null && !Number.isNaN(rawSale) && rawSale > 0 && rawSale < listPrice;

  return {
    listPrice,
    salePrice: hasDiscount ? rawSale : undefined,
    price: hasDiscount ? rawSale! : listPrice,
    oldPrice: hasDiscount ? listPrice : undefined,
  };
}

export function validateProductPricing(
  listPriceInput: number | string,
  salePriceInput?: number | string | null
): string | null {
  const listPrice = Number(listPriceInput);
  if (!listPrice || Number.isNaN(listPrice) || listPrice <= 0) {
    return "Giá niêm yết phải lớn hơn 0";
  }

  if (salePriceInput == null || salePriceInput === "") {
    return null;
  }

  const salePrice = Number(salePriceInput);
  if (Number.isNaN(salePrice) || salePrice <= 0) {
    return "Giá khuyến mãi phải lớn hơn 0";
  }
  if (salePrice >= listPrice) {
    return "Giá khuyến mãi phải nhỏ hơn giá niêm yết";
  }

  return null;
}

export function buildSalePricePayload(
  listPriceInput: number | string,
  salePriceInput?: number | string | null
): number | null {
  const listPrice = Number(listPriceInput);
  if (salePriceInput == null || salePriceInput === "") {
    return null;
  }
  const salePrice = Number(salePriceInput);
  if (Number.isNaN(salePrice) || salePrice <= 0 || salePrice >= listPrice) {
    return null;
  }
  return salePrice;
}
