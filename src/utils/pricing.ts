export function getVariantPrice(
  product: { price: string | number; salePrice?: string | number | null },
  variant?: {
    price?: string | number | null;
    salePrice?: string | number | null;
  } | null
): number {
  if (variant) {
    if (variant.salePrice != null && variant.salePrice !== "") {
      return Number(variant.salePrice);
    }
    if (variant.price != null && variant.price !== "") {
      return Number(variant.price);
    }
  }

  if (product.salePrice != null && product.salePrice !== "") {
    return Number(product.salePrice);
  }

  return Number(product.price);
}

export function formatVariantLabel(attributes?: Record<string, string> | null): string {
  if (!attributes || Object.keys(attributes).length === 0) {
    return "";
  }

  return Object.entries(attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}
