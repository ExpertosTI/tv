export const TEMPLATES = [
  {
    id: 'aurora',
    name: 'Aurora',
    blurb: 'Carta oscura. Los precios brillan y las filas entran una tras otra.',
    defaults: {
      headline: 'Café del día',
      subtitle: 'Recién hecho · pide en barra',
      items: [
        { name: 'Espresso', price: 'RD$ 90', note: 'Doble shot', badge: '' },
        { name: 'Cappuccino', price: 'RD$ 140', note: 'Leche vaporizada', badge: 'Favorito' },
        { name: 'Latte vainilla', price: 'RD$ 160', note: 'Caliente o frío', badge: '' },
        { name: 'Cold brew', price: 'RD$ 150', note: '12 horas', badge: 'Nuevo' },
        { name: 'Sándwich', price: 'RD$ 220', note: 'Jamón y queso', badge: '' },
        { name: 'Brownie', price: 'RD$ 120', note: 'Con nuez', badge: '' },
      ],
    },
  },
  {
    id: 'vitrina',
    name: 'Vitrina',
    blurb: 'Un producto grande que rota y el resto de la carta al lado.',
    defaults: {
      headline: 'Hoy en vitrina',
      subtitle: 'Cambia el destacado sin tocar la TV',
      items: [
        { name: 'Cheesecake', price: 'RD$ 180', note: 'Porción del día', badge: 'Destacado' },
        { name: 'Croissant', price: 'RD$ 95', note: 'Mantequilla', badge: '' },
        { name: 'Jugo natural', price: 'RD$ 110', note: 'Naranja o chinola', badge: '' },
        { name: 'Ensalada', price: 'RD$ 260', note: 'Con pollo', badge: '' },
        { name: 'Agua', price: 'RD$ 40', note: '500 ml', badge: '' },
      ],
    },
  },
  {
    id: 'cinta',
    name: 'Cinta',
    blurb: 'Lista clara y una cinta que recorre los precios por la pantalla.',
    defaults: {
      headline: 'Menú',
      subtitle: 'Precios de esta semana',
      items: [
        { name: 'Desayuno', price: 'RD$ 280', note: 'Café, jugo y pan', badge: '' },
        { name: 'Almuerzo', price: 'RD$ 350', note: 'Plato del día', badge: 'Hoy' },
        { name: 'Combo 2', price: 'RD$ 190', note: 'Bebida + snack', badge: '' },
        { name: 'Postre', price: 'RD$ 130', note: 'Pregunta el del día', badge: '' },
      ],
    },
  },
  {
    id: 'carta',
    name: 'Carta',
    blurb: 'Como el automenú: categorías, foto del plato y el precio en la tarjeta.',
    defaults: {
      headline: 'La carta',
      subtitle: 'Pide en barra',
      categories: [
        {
          name: 'Entradas',
          items: [
            { name: 'Ceviche', price: 'RD$ 450', note: 'Pescado del día', badge: '' },
            { name: 'Croquetas', price: 'RD$ 280', note: 'Cuatro unidades', badge: '' },
            { name: 'Ensalada', price: 'RD$ 320', note: 'Verde y cítrica', badge: '' },
          ],
        },
        {
          name: 'Platos',
          items: [
            { name: 'Pescado a la plancha', price: 'RD$ 890', note: 'Con vegetales', badge: 'Hoy' },
            { name: 'Pasta', price: 'RD$ 640', note: 'Salsa del día', badge: '' },
            { name: 'Risotto', price: 'RD$ 720', note: 'Hongos', badge: '' },
          ],
        },
        {
          name: 'Bebidas',
          items: [
            { name: 'Limonada', price: 'RD$ 140', note: 'Natural', badge: '' },
            { name: 'Vino copa', price: 'RD$ 280', note: 'Tinto o blanco', badge: '' },
            { name: 'Agua', price: 'RD$ 60', note: 'Con gas o sin gas', badge: '' },
          ],
        },
      ],
      items: [],
    },
  },
];

function clip(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function templateById(id) {
  return TEMPLATES.find((item) => item.id === id) || null;
}

export function publicTemplates() {
  return TEMPLATES.map(({ id, name, blurb }) => ({ id, name, blurb }));
}

function mediaId(value) {
  const id = String(value || '');
  return /^[0-9a-f-]{36}$/i.test(id) ? id : '';
}

function cleanItem(item) {
  return {
    name: clip(item?.name, 48),
    price: clip(item?.price, 18),
    note: clip(item?.note, 48),
    badge: clip(item?.badge, 16),
    imageMediaId: mediaId(item?.imageMediaId),
    category: clip(item?.category, 32),
  };
}

export function sanitizeContent(templateId, input) {
  const template = templateById(templateId);
  if (!template) return null;
  const source = input && typeof input === 'object' ? input : template.defaults;
  const fallback = template.defaults;
  const background = String(source.backgroundMediaId || '');
  const presentation = source.presentation === 'uno' ? 'uno' : 'rejilla';
  const interludeMediaIds = (Array.isArray(source.interludeMediaIds) ? source.interludeMediaIds : [])
    .map(mediaId)
    .filter(Boolean)
    .slice(0, 12);
  let categories = [];
  if (Array.isArray(source.categories)) {
    categories = source.categories.slice(0, 8).map((category) => {
      const products = Array.isArray(category?.items) ? category.items : category?.products;
      const items = (Array.isArray(products) ? products : []).slice(0, 12).map(cleanItem).filter((item) => item.name || item.price);
      return { name: clip(category?.name, 32), items };
    }).filter((category) => category.name && category.items.length);
  }
  let items = Array.isArray(source.items) ? source.items.slice(0, 48).map(cleanItem).filter((item) => item.name || item.price) : [];
  if (!categories.length && items.some((item) => item.category)) {
    const names = [];
    for (const item of items) {
      const name = item.category || 'Carta';
      if (!names.includes(name)) names.push(name);
    }
    categories = names.slice(0, 8).map((name) => ({
      name,
      items: items.filter((item) => (item.category || 'Carta') === name).slice(0, 12),
    }));
  }
  if (categories.length && !items.length) {
    items = categories.flatMap((category) => category.items.map((item) => ({ ...item, category: category.name })));
  }
  if (!items.length) items = (fallback.items || []).map((item) => ({ ...cleanItem(item) }));
  if (!categories.length && Array.isArray(fallback.categories)) {
    categories = fallback.categories.map((category) => ({
      name: category.name,
      items: category.items.map((item) => cleanItem(item)),
    }));
    items = categories.flatMap((category) => category.items.map((item) => ({ ...item, category: category.name })));
  }
  return {
    headline: clip(source.headline, 60) || fallback.headline,
    subtitle: clip(source.subtitle, 90),
    backgroundMediaId: mediaId(background),
    presentation,
    interludeMediaIds,
    categories,
    items,
  };
}
