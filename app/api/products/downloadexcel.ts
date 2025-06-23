import { formatDate } from "date-fns";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000/api";

export const downloadExportAll = async (startDate: Date, endDate: Date, storeId:string) => {
  const start = encodeURIComponent(startDate.toISOString());
  const end = encodeURIComponent(endDate.toISOString());

  console.log(start)
  console.log(end)

  const res = await fetch(`${API_BASE_URL}/products/export?startDate=${start}&endDate=${end}&storeId=${storeId}`, {
    method: "GET",
  });
  if (!res.ok) throw new Error("Failed to export file");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;
  a.download = `summary-all-${formatDate(startDate,"dd-MM-yyyy")} to ${formatDate(endDate,"dd-MM-yyyy")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);

  return true;
};

export const downloadExportBranch = async (startDate: Date, endDate: Date, branchId:string) => {
  const start = encodeURIComponent(startDate.toISOString());
  const end = encodeURIComponent(endDate.toISOString());

  console.log(start)
  console.log(end)

  const res = await fetch(`${API_BASE_URL}/products/export/branch?startDate=${start}&endDate=${end}&branchId=${branchId}`, {
    method: "GET",
  });
  if (!res.ok) throw new Error("Failed to export file");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;
  a.download = `summary-branch-${formatDate(startDate,"dd-MM-yyyy")} to ${formatDate(endDate,"dd-MM-yyyy")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);

  return true;
};


export const downloadExportProductAll = async (startDate: Date, endDate: Date, storeId:string,product:string) => {
  const start = encodeURIComponent(startDate.toISOString());
  const end = encodeURIComponent(endDate.toISOString());

  console.log(start)
  console.log(end)

  const res = await fetch(`${API_BASE_URL}/products/export/product?startDate=${start}&endDate=${end}&storeId=${storeId}&productId=${product}`, {
    method: "GET",
  });
  if (!res.ok) throw new Error("Failed to export file");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;
  a.download = `product-summary-all-${formatDate(startDate,"dd-MM-yyyy")} to ${formatDate(endDate,"dd-MM-yyyy")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);

  return true;
};

export const downloadExportProductBranch = async (startDate: Date, endDate: Date, branchId:string, product:string) => {
  const start = encodeURIComponent(startDate.toISOString());
  const end = encodeURIComponent(endDate.toISOString());

  console.log(start)
  console.log(end)

  const res = await fetch(`${API_BASE_URL}/products/export/product/branch?startDate=${start}&endDate=${end}&branchId=${branchId}&productId=${product}`, {
    method: "GET",
  });
  if (!res.ok) throw new Error("Failed to export file");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;
  a.download = `product-summary-branch-${formatDate(startDate,"dd-MM-yyyy")} to ${formatDate(endDate,"dd-MM-yyyy")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);

  return true;
};
