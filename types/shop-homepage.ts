export type ShopHomepageProductRow = {
  _id: string;
  name: string;
  standardCode: string;
  price: string | null;
  quantityAvailable: number;
  imageUrl?: string | null;
};

export type ShopHomepageBrowseTile = {
  label: string;
  imageUrl: string;
  query: string;
};

export type ShopHomepageData = {
  popular: ShopHomepageProductRow[];
  fastMoving: ShopHomepageProductRow[];
  promotional: ShopHomepageProductRow[];
  featuredText: string;
  bannerText: string;
  totalListedProducts: number;
  totalVisits: number;
  browseTiles: ShopHomepageBrowseTile[];
};
