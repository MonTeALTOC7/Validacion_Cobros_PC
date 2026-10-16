// Formato de presentación (es-NI) y descarga de archivos.

const numberFormats = new Map();
export const formatNumber = (value, decimals = 2) => {
  if (!numberFormats.has(decimals)) {
    numberFormats.set(
      decimals,
      new Intl.NumberFormat('es-NI', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    );
  }
  return numberFormats.get(decimals).format(value);
};

const currencyFormat = new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', minimumFractionDigits: 2 });
export const formatCurrency = (value) => currencyFormat.format(value);

export const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
