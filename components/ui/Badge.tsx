interface BadgeProps {
  label: string;
  color?: 'gray' | 'indigo' | 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'orange';
}

const colorMap: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
};

export function Badge({ label, color = 'gray' }: BadgeProps) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorMap[color]}`}>
      {label}
    </span>
  );
}
