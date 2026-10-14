export const formatNumber = (a, s = 2) =>
  new Intl.NumberFormat('es-NI', {
    minimumFractionDigits: s,
    maximumFractionDigits: s,
  }).format(a);
export const formatCurrency = (a) =>
  new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 2,
  }).format(a);
export const downloadBlob = (a, s) => {
  const t = URL.createObjectURL(a);
  const n = document.createElement('a');
  n.href = t;
  n.download = s;
  n.click();
  URL.revokeObjectURL(t);
};
