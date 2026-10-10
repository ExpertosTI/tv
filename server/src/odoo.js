function clip(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function priceLabel(product) {
  if (product?.priceLabel) return clip(product.priceLabel, 18);
  if (typeof product?.price === 'number' && Number.isFinite(product.price)) {
    const currency = clip(product.currency || 'RD$', 6) || 'RD$';
    const amount = Number.isInteger(product.price) ? String(product.price) : product.price.toFixed(2);
    return clip(`${currency} ${amount}`, 18);
  }
  return clip(product?.price, 18);
}

export function safeImageUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || url.username || url.password) return '';
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return '';
  if (host.includes(':')) return '';
  const parts = host.split('.').map(Number);
  const privateRange = parts.length === 4 && parts.every((part) => part >= 0 && part <= 255) && (
    parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
  );
  if (privateRange) return '';
  return url.toString();
}

export function menuFromOdoo(body) {
  const source = body && typeof body === 'object' ? body : {};
  const incoming = Array.isArray(source.categories) ? source.categories.slice(0, 8) : [];
  const categories = incoming.map((category) => {
    const products = Array.isArray(category?.products) ? category.products : category?.items;
    const items = (Array.isArray(products) ? products : []).slice(0, 12).map((product) => ({
      name: clip(product?.name, 48),
      price: priceLabel(product),
      note: clip(product?.description || product?.note, 48),
      badge: clip(product?.badge, 16),
      imageUrl: safeImageUrl(product?.imageUrl || product?.image),
    })).filter((item) => item.name);
    return { name: clip(category?.name, 32), items };
  }).filter((category) => category.name && category.items.length);
  if (!categories.length) return null;
  return {
    headline: clip(source.headline || source.menuName || source.name, 60) || 'La carta',
    subtitle: clip(source.subtitle, 90),
    categories,
  };
}
