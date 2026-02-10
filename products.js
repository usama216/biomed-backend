// Static products data (same as frontend)
export const products = [
  { id: 'prod-1', name: 'Magioo Magnesium Glycinate (1000mg)', originalPrice: 2390, discountedPrice: 2390, image: '/assets/new-products/product-1.jpeg' },
  { id: 'prod-2', name: 'Tablet Ostical-D 30s', originalPrice: 1120, discountedPrice: 1120, image: '/assets/new-products/product-2.jpeg' },
  { id: 'prod-3', name: 'Tablet Zincoo 50mg', originalPrice: 950, discountedPrice: 950, image: '/assets/new-products/product-3.jpeg' },
  { id: 'prod-4', name: 'Glutamed capsule 30s', originalPrice: 4300, discountedPrice: 4300, image: '/assets/new-products/product-4.jpeg' },
  { id: 'prod-5', name: 'Bemega (Omega-3 500mg) Capsule – BioMed Innovation', originalPrice: 1590, discountedPrice: 1590, image: '/assets/new-products/product-5.jpeg' },
  { id: 'prod-6', name: 'Bio-12 Tablets (Mecobalamin 2000mcg)', originalPrice: 1420, discountedPrice: 1420, image: '/assets/new-products/product-6.jpeg' },
  { id: 'prod-7', name: 'Nurose Collagen capsules', originalPrice: 1990, discountedPrice: 1990, image: '/assets/new-products/product-7.jpeg' },
  { id: 'prod-8', name: 'NORO tablet 20s', originalPrice: 1400, discountedPrice: 1400, image: '/assets/new-products/product-8.jpeg' },
  { id: 'prod-9', name: 'VNUR MEN Once a Day Multi – Dietary Supplement', originalPrice: 1890, discountedPrice: 1890, image: '/assets/new-products/product-9.jpeg' },
  { id: 'prod-10', name: 'VNUR WOMEN tablets 30s', originalPrice: 1890, discountedPrice: 1890, image: '/assets/new-products/product-10.jpeg' },
  { id: 'prod-11', name: 'Teenur tablet 30s', originalPrice: 1590, discountedPrice: 1590, image: '/assets/new-products/product-11.jpeg' },
  { id: 'prod-12', name: 'X‑NUR 30s tablet', originalPrice: 2990, discountedPrice: 2990, image: '/assets/new-products/product-12.jpeg' },
  { id: 'prod-13', name: 'Ostical-D Syrup', originalPrice: 780, discountedPrice: 780, image: '/assets/new-products/product-13.jpeg' },
  { id: 'prod-14', name: 'DeAll softgel Capsules 1s', originalPrice: 435, discountedPrice: 435, image: '/assets/new-products/product-14.jpeg' }
];

export function getProductById(id) {
  return products.find(p => p.id === id);
}
