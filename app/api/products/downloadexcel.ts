const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000/api";

export const downloadExportAll = async (startDate: Date, endDate: Date) => {
  const start = encodeURIComponent(startDate.toISOString());
  const end = encodeURIComponent(endDate.toISOString());

  console.log(start)
  console.log(end)

  const res = await fetch(`${API_BASE_URL}/products/export?startDate=${start}&endDate=${end}`, {
    method: "GET",
  });
  if (!res.ok) throw new Error("Failed to export file");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `summary-all-${startDate}-${endDate}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);

  return true;
};
