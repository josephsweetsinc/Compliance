import React, { useState } from 'react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  subtitle?: string;
  id?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-16 h-16',
  xl: 'w-20 h-20',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 'md',
  showText = false,
  subtitle,
  id = 'complyzzz-brand-logo',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  // Embedded vector fallback so the logo NEVER breaks under any network/path condition
  const renderFallbackVector = () => (
    <div
      className={`${sizeClasses[size]} ${className} relative flex items-center justify-center rounded-xl bg-gradient-to-br from-[#4b1487] via-[#5c4ac7] to-[#3b82f6] shadow-sm overflow-hidden shrink-0`}
      aria-label="ComplyZzz Brand Logo"
    >
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full p-1"
      >
        <circle cx="20" cy="20" r="17" fill="url(#brandGrad)" />
        {/* Checkmark */}
        <path
          d="M12 20.5L17 25.5L28 14.5"
          stroke="white"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Floating zzz */}
        <text
          x="27"
          y="11"
          fill="#f8fafc"
          fontSize="5.5"
          fontWeight="900"
          fontStyle="italic"
          fontFamily="system-ui, sans-serif"
        >
          z
        </text>
        <text
          x="30"
          y="8.5"
          fill="#93c5fd"
          fontSize="4"
          fontWeight="900"
          fontStyle="italic"
          fontFamily="system-ui, sans-serif"
        >
          z
        </text>
        <defs>
          <linearGradient id="brandGrad" x1="5" y1="5" x2="35" y2="35" gradientUnits="userSpaceOnUse">
            <stop stopColor="#431478" />
            <stop offset="0.6" stopColor="#5850C2" />
            <stop offset="1" stopColor="#2563EB" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );

  return (
    <div className="flex items-center gap-3" id={id}>
      {!imgFailed ? (
        <img
          src="/complyzzz_logo.png"
          alt="ComplyZzz Sleep Compliance Logo"
          className={`${sizeClasses[size]} ${className} object-contain rounded-xl shadow-xs shrink-0 transition-transform`}
          onError={() => setImgFailed(true)}
          loading="eager"
        />
      ) : (
        renderFallbackVector()
      )}

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-2xl tracking-tight text-slate-950 dark:text-white">
              Comply<span className="text-blue-600 dark:text-blue-400">Zzz</span>
            </span>
            {subtitle && (
              <span className="hidden sm:inline-flex text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                {subtitle}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandLogo;
