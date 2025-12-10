export const PRIORITY_COLORS = {
  High: { flag: '🔴', bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-700' },
  Medium: { flag: '🟠', bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-700' },
  Low: { flag: '🟢', bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-700' },
};

export const getDateBadgeColor = (dueDate) => {
  if (!dueDate) return 'bg-gray-500';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  
  const daysUntil = Math.floor((due - today) / (1000 * 60 * 60 * 24));
  
  if (daysUntil < 0) return 'bg-red-600';
  if (daysUntil === 0) return 'bg-orange-600';
  if (daysUntil <= 3) return 'bg-amber-500';
  return 'bg-green-600';
};

export const formatDateBadge = (dueDate) => {
  if (!dueDate) return '';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  
  const daysUntil = Math.floor((due - today) / (1000 * 60 * 60 * 24));
  
  if (daysUntil < 0) return `Overdue ${Math.abs(daysUntil)}d`;
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil <= 7) {
    return due.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatDateForInput = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
