export interface Product {
    id: string;
    handle: string;
    title: string;
    description: string;
    productType: string;
    vendor: string;
    tags: string[];
    priceRange: {
      minVariantPrice: {
        amount: string;
        currencyCode: string;
      };
      maxVariantPrice: {
        amount: string;
        currencyCode: string;
      };
    };
    featuredImage?: {
      url: string;
      altText?: string;
    };
    availableForSale: boolean;
    inventory?: {
      quantity: number;
      policy: 'CONTINUE' | 'DENY';
    };
  }
  
  export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
  }