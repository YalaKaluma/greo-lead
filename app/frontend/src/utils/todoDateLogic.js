export const dateKey = (dateString) => {
  const match = String(dateString || '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
};

export const dateToTime = (dateString) => {
  const [year, month, day] = dateKey(dateString).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getTime();
};

export const dateFromKey = (key) => {
  const [year, month, day] = dateKey(key).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

export const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function formatShortDate(dateString) {
  if (!dateString) return '';
  const [year, month, day] = dateKey(dateString).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

export const getRollingCalendarDays = (startDate, dayCount = 30) => {
  const startOffset = startDate.getDay();
  const days = [];

  for (let index = 0; index < startOffset; index += 1) {
    days.push(null);
  }

  for (let index = 0; index < dayCount; index += 1) {
    days.push(addDays(startDate, index));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
};

export const formatCalendarRangeLabel = (startDate, endDate) => {
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const startOptions = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' };

  return `${startDate.toLocaleDateString('en-US', startOptions)} - ${endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
};

export const formatMonthShort = (date) => date.toLocaleDateString('en-US', {
  month: 'long',
  year: 'numeric',
});
