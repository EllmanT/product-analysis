const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000/api";

export const downloadExport = async (month: string, year: string, week: string) => {
  const res = await fetch(`${API_BASE_URL}/products/export?month=${month}&year=${year}&week=${week}`, {
    method: "GET",
  });

  if (!res.ok) throw new Error("Failed to export file");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "products-summary.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);

  return true;
};
