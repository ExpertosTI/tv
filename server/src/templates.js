const FONTS = ['sans', 'serif', 'display', 'mono', 'rounded', 'condensed'];

function dish(name, price, note, badge = '') {
  return { name, price, note, badge };
}

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
  {
    id: 'promo',
    name: 'Promo',
    blurb: 'El anuncio grande encima del video o la foto.',
    defaults: menu('2x1 hasta las 6', 'Solo hoy en el local', [
      dish('Combo familiar', 'RD$ 690', 'Pizza y refresco', 'Hoy'),
      dish('Postre', 'RD$ 0', 'De cortesía', '2x1'),
    ]),
  },
  {
    id: 'ticker',
    name: 'Cinta de ofertas',
    blurb: 'Los precios recorren la pantalla sobre el fondo.',
    defaults: menu('Ofertas de la semana', 'Pasa el video y lee la cinta', [
      dish('Arroz 5 lb', 'RD$ 245', 'Marca de la casa'),
      dish('Aceite', 'RD$ 310', '1 litro'),
      dish('Huevos', 'RD$ 180', 'Cubeta'),
      dish('Pollo', 'RD$ 89', 'La libra'),
    ]),
  },
  {
    id: 'duo',
    name: 'Dos columnas',
    blurb: 'La carta partida en dos, legible en TV y tablet.',
    defaults: menu('Menú del día', 'Almuerzo y cena', [
      dish('Sopa', 'RD$ 180', 'Del día'),
      dish('Pollo', 'RD$ 420', 'Guisado'),
      dish('Pescado', 'RD$ 540', 'Frito o plancha'),
      dish('Jugo', 'RD$ 90', 'Natural'),
    ]),
  },
  {
    id: 'foco',
    name: 'Foco',
    blurb: 'Un producto a la vez, enorme, sobre la imagen.',
    defaults: menu('Prueba esto', 'Rota solo', [
      dish('Burger', 'RD$ 390', 'Doble carne', 'Top'),
      dish('Papas', 'RD$ 140', 'Grandes'),
      dish('Malteada', 'RD$ 180', 'Vainilla'),
    ]),
  },
  {
    id: 'pizarra',
    name: 'Pizarra',
    blurb: 'Como la pizarra del café, con tu foto detrás.',
    defaults: menu('Escrito hoy', 'Se borra y se vuelve a poner', [
      dish('Café', 'RD$ 80', 'Taza'),
      dish('Tostada', 'RD$ 120', 'Aguacate'),
      dish('Jugo verde', 'RD$ 160', 'Sin azúcar'),
    ]),
  },
  {
    id: 'luxe',
    name: 'Carta fina',
    blurb: 'Restaurante: nombres serios y el precio a la derecha.',
    defaults: menu('Cena', 'Reserva en puerta', [
      dish('Entrada', 'RD$ 480', 'Del chef'),
      dish('Principal', 'RD$ 980', 'Corte del día'),
      dish('Copa', 'RD$ 320', 'Casa'),
    ]),
  },
  {
    id: 'barra',
    name: 'Barra',
    blurb: 'Tragos en fichas horizontales sobre el video.',
    defaults: menu('Barra abierta', 'Pide al bartender', [
      dish('Cerveza', 'RD$ 150', 'Nacional'),
      dish('Ron', 'RD$ 180', 'En las rocas'),
      dish('Cóctel', 'RD$ 280', 'De la casa', 'Nuevo'),
      dish('Agua', 'RD$ 60', 'Botella'),
    ]),
  },
  {
    id: 'mercado',
    name: 'Mercado',
    blurb: 'Etiquetas de precio para colmado o supermercado.',
    defaults: menu('Precios claros', 'Esta semana', [
      dish('Leche', 'RD$ 75', 'Litro'),
      dish('Pan', 'RD$ 40', 'Unidad'),
      dish('Queso', 'RD$ 220', 'Libra'),
      dish('Detergente', 'RD$ 165', '500 g'),
    ]),
  },
  {
    id: 'salon',
    name: 'Salón',
    blurb: 'Servicios de belleza, spa o barbería.',
    defaults: menu('Servicios', 'Sin cita o con cita', [
      dish('Corte', 'RD$ 400', '30 min'),
      dish('Color', 'RD$ 1800', 'Consulta'),
      dish('Barba', 'RD$ 250', 'Toalla caliente'),
      dish('Manicure', 'RD$ 500', 'Clásica'),
    ]),
  },
  {
    id: 'hotel',
    name: 'Hotel',
    blurb: 'Tarifas de habitación o paquetes.',
    defaults: menu('Tarifas de hoy', 'Desayuno incluido', [
      dish('Estándar', 'RD$ 4500', 'Dos personas'),
      dish('Superior', 'RD$ 6200', 'Vista'),
      dish('Suite', 'RD$ 9800', 'Sala'),
    ]),
  },
  {
    id: 'botica',
    name: 'Farmacia',
    blurb: 'Promos de farmacia, ópticas o clínicas.',
    defaults: menu('Promociones', 'Pregunta en el mostrador', [
      dish('Vitaminas', 'RD$ 390', 'Frasco'),
      dish('Protector', 'RD$ 450', 'FPS 50', '2x1'),
      dish('Presión', 'Gratis', 'Toma de hoy'),
    ]),
  },
  {
    id: 'club',
    name: 'Planes',
    blurb: 'Membresías de gimnasio, academia o club.',
    defaults: menu('Elige tu plan', 'Empieza esta semana', [
      dish('Mes', 'RD$ 1500', 'Área de pesas'),
      dish('Trimestre', 'RD$ 3900', 'Clases incluidas', 'Ahorra'),
      dish('Día', 'RD$ 250', 'Pase'),
    ]),
  },
  {
    id: 'helado',
    name: 'Sabores',
    blurb: 'Heladería, postres o jugos en tarjetas.',
    defaults: menu('Sabores de hoy', 'Copa, cono o vaso', [
      dish('Chocolate', 'RD$ 120', 'Dos bolas'),
      dish('Fresa', 'RD$ 120', 'Dos bolas'),
      dish('Coco', 'RD$ 140', 'Especial', 'Nuevo'),
    ]),
  },
  {
    id: 'noche',
    name: 'Evento',
    blurb: 'Fiesta, concierto o noche temática.',
    defaults: menu('Viernes de música', 'Puertas a las 9', [
      dish('Cover', 'RD$ 300', 'Antes de las 11'),
      dish('Mesa', 'RD$ 2500', 'Cuatro personas'),
      dish('Botella', 'RD$ 1800', 'Casa'),
    ]),
  },
];

function menu(headline, subtitle, items) {
  return { headline, subtitle, items };
}

function clip(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function templateById(id) {
  return TEMPLATES.find((item) => item.id === id) || null;
}

export function publicTemplates() {
  return TEMPLATES.map(({ id, name, blurb, defaults }) => ({ id, name, blurb, defaults }));
}

function videoLink(value) {
  const raw = String(value || '').trim().slice(0, 400);
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { return ''; }
  if (url.protocol !== 'https:' || url.username || url.password) return '';
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const hosts = ['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'vimeo.com', 'player.vimeo.com'];
  if (hosts.includes(host)) return url.toString();
  if (/\.(mp4|webm|m3u8)$/i.test(url.pathname)) return url.toString();
  return '';
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
    backgroundVideoUrl: videoLink(source.backgroundVideoUrl),
    font: FONTS.includes(source.font) ? source.font : 'sans',
    categories,
    items,
  };
}
