export type ProductUploadSummaryBranch = {
  id: string;
  name: string;
  location: string;
};

export type ProductUploadSummary = {
  productLineCount: number;
  totalQuantity: number;
  totalValue: number;
  deadStockSkus: number;
  activeStockSkus: number;
  uploadDate: string;
  originalFileName: string;
  fileSizeBytes: number;
  branch: ProductUploadSummaryBranch;
};

export type ProductUploadSuccessData = {
  uploadId: string;
  summary: ProductUploadSummary;
};
