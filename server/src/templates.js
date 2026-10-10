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

export function sanitizeContent(templateId, input) {
  const template = templateById(templateId);
  if (!template) return null;
  const source = input && typeof input === 'object' ? input : template.defaults;
  const rawItems = Array.isArray(source.items) ? source.items.slice(0, 12) : template.defaults.items;
  const items = rawItems.map((item) => ({
    name: clip(item?.name, 48),
    price: clip(item?.price, 18),
    note: clip(item?.note, 48),
    badge: clip(item?.badge, 16),
  })).filter((item) => item.name || item.price);
  const fallback = template.defaults;
  const background = String(source.backgroundMediaId || '');
  return {
    headline: clip(source.headline, 60) || fallback.headline,
    subtitle: clip(source.subtitle, 90),
    backgroundMediaId: /^[0-9a-f-]{36}$/i.test(background) ? background : '',
    items: items.length ? items : fallback.items.map((item) => ({ ...item })),
  };
}
