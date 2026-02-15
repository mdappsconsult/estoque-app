import clsx from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export default function Card({ children, className, onClick, hoverable = false }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white rounded-xl border border-gray-200 p-6',
        hoverable && 'hover:shadow-lg hover:border-gray-300 transition-all cursor-pointer',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  icon?: React.ReactNode;
  iconBg?: string;
  badge?: string;
  children: React.ReactNode;
}

export function CardHeader({ icon, iconBg = 'bg-red-100', badge, children }: CardHeaderProps) {
  return (
    <div className="flex flex-col items-center text-center mb-4">
      {badge && (
        <span className="text-xs text-green-500 font-medium mb-2">
          🎉 {badge}
        </span>
      )}
      {icon && (
        <div className={clsx('w-14 h-14 rounded-xl flex items-center justify-center mb-3', iconBg)}>
          {icon}
        </div>
      )}
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-lg font-semibold text-gray-900">{children}</h3>
  );
}

export function CardDescription({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-gray-500 mt-1">{children}</p>
  );
}

export function CardActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      {children}
    </div>
  );
}
