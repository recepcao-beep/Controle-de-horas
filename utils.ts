
export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export const timeToDecimal = (time: string): number => {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours + minutes / 60;
};

export const formatDecimalHours = (decimal: number): string => {
  const hours = Math.floor(decimal);
  const minutes = Math.round((decimal - hours) * 60);
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
};

export const calculateTimeDiff = (real: string, punch: string): number => {
  return Math.abs(timeToDecimal(real) - timeToDecimal(punch));
};

export const getWeekDays = (baseDate: Date) => {
  const days = [];
  const d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);
  
  const day = d.getDay(); // 0 (Dom) a 6 (Sab)
  // Calcula a diferença para chegar na Segunda-feira (1)
  // Se for Domingo (0), volta 6 dias. Se for Segunda (1), volta 0. Se for Terça (2), volta 1...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);

  for (let i = 0; i < 7; i++) {
    const dayInstance = new Date(d);
    dayInstance.setDate(d.getDate() + i);
    days.push(dayInstance.toISOString().split('T')[0]);
  }
  return days;
};
