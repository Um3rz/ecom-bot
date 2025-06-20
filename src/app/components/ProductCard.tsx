'use client';

import { Product } from '@/lib/types';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const price = product.priceRange.minVariantPrice;

  const handleProductClick = () => {
    console.log('Navigating to product:', product.handle);
  };

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors shadow-sm w-full max-w-md my-2"
      onClick={handleProductClick}
    >
      <div className="flex space-x-4 items-center">
        {product.featuredImage && (
          <div className="flex-shrink-0">
            <img
              src={product.featuredImage.url}
              alt={product.featuredImage.altText || product.title}
              className="w-20 h-20 object-cover rounded-md border"
              loading="lazy"
            />
          </div>
        )}
        <div className="flex-grow">
          <h3 className="font-semibold text-gray-800 text-sm truncate">
            {product.title}
          </h3>
          <p className="text-gray-600 text-sm mt-1">
            {price.amount} {price.currencyCode}
          </p>
          {product.availableForSale ? (
            <p className="text-xs text-green-600 font-medium mt-2">In Stock</p>
          ) : (
            <p className="text-xs text-red-600 font-medium mt-2">Out of Stock</p>
          )}
        </div>
      </div>
    </div>
  );
}