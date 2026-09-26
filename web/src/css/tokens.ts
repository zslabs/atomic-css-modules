/**
 * Design tokens for the web app. Authoring CSS uses `token('color.slate.1')`;
 * the LightningCSS visitor inlines these leaf strings at build time.
 */
export const tokens = {
  color: {
    slate: {
      '1': 'oklch(17.853% 0.00407 285.9841)',
      '2': 'oklch(21.318% 0.00421 264.41128)',
      '3': 'oklch(25.214% 0.00582 271.18119)',
      '4': 'oklch(28.319% 0.00699 248.06152)',
      '5': 'oklch(31.177% 0.0083 255.56204)',
      '6': 'oklch(34.655% 0.01029 253.97812)',
      '7': 'oklch(39.928% 0.01206 252.9322)',
      '8': 'oklch(48.932% 0.01551 251.7052)',
      '9': 'oklch(53.7% 0.01532 262.34603)',
      '10': 'oklch(58.251% 0.01455 266.61041)',
      '11': 'oklch(76.856% 0.00964 258.3287)',
      '12': 'oklch(94.892% 0.00288 264.62562)',
    },
    primary: {
      '1': 'oklch(19.361% 0.0255 256.48154)',
      '2': 'oklch(21.293% 0.03033 261.25815)',
      '3': 'oklch(27.447% 0.06629 253.92995)',
      '4': 'oklch(32.014% 0.09678 252.34577)',
      '5': 'oklch(36.71% 0.10588 250.70255)',
      '6': 'oklch(41.603% 0.11326 252.00498)',
      '7': 'oklch(47.411% 0.12187 253.08911)',
      '8': 'oklch(54.057% 0.13953 253.17411)',
      '9': 'oklch(64.929% 0.19304 251.77905)',
      '10': 'oklch(68.838% 0.16932 251.4024)',
      '11': 'oklch(76.422% 0.12575 249.46529)',
      '12': 'oklch(90.712% 0.05104 238.44324)',
    },
    // Violet
    accent: {
      '1': 'oklch(19.136% 0.02613 290.75882)',
      '2': 'oklch(21.113% 0.03205 300.92696)',
      '3': 'oklch(27.073% 0.06549 294.41644)',
      '4': 'oklch(31.18% 0.09295 292.08071)',
      '5': 'oklch(34.918% 0.09913 291.33131)',
      '6': 'oklch(38.891% 0.10212 292.11708)',
      '7': 'oklch(44.453% 0.11034 291.96919)',
      '8': 'oklch(51.774% 0.13054 290.28686)',
      '9': 'oklch(54.168% 0.17902 288.03315)',
      '10': 'oklch(58.862% 0.16922 289.35364)',
      '11': 'oklch(77.783% 0.12462 293.19316)',
      '12': 'oklch(91.165% 0.04495 292.44045)',
    },
    // Jade
    success: {
      '1': 'oklch(18.639% 0.01352 169.77851)',
      '2': 'oklch(21.515% 0.01651 168.18641)',
      '3': 'oklch(27.36% 0.04342 165.18928)',
      '4': 'oklch(31.624% 0.05718 167.619)',
      '5': 'oklch(36.117% 0.06388 168.16585)',
      '6': 'oklch(41.272% 0.06868 169.57354)',
      '7': 'oklch(46.84% 0.07584 170.26817)',
      '8': 'oklch(53.651% 0.08747 172.23395)',
      '9': 'oklch(64.215% 0.11502 170.7293)',
      '10': 'oklch(67.775% 0.12556 169.56536)',
      '11': 'oklch(78.524% 0.15591 167.11005)',
      '12': 'oklch(90.268% 0.07756 166.87581)',
    },
    // Red
    danger: {
      '1': 'oklch(18.803% 0.01345 18.42148)',
      '2': 'oklch(20.458% 0.02168 14.06829)',
      '3': 'oklch(25.105% 0.06494 12.69437)',
      '4': 'oklch(28.929% 0.09511 14.32992)',
      '5': 'oklch(33.211% 0.10666 15.52555)',
      '6': 'oklch(38.144% 0.11081 16.80622)',
      '7': 'oklch(45.018% 0.12106 18.77319)',
      '8': 'oklch(54.356% 0.14576 21.76199)',
      '9': 'oklch(62.557% 0.19334 23.02426)',
      '10': 'oklch(66.338% 0.17739 22.85167)',
      '11': 'oklch(78.041% 0.12812 22.13858)',
      '12': 'oklch(90.236% 0.05267 6.45311)',
    },
    blackA: {
      '1': 'oklch(0% 0 0 / 0.05)',
      '2': 'oklch(0% 0 0 / 0.1)',
      '3': 'oklch(0% 0 0 / 0.15)',
      '4': 'oklch(0% 0 0 / 0.2)',
      '5': 'oklch(0% 0 0 / 0.3)',
      '6': 'oklch(0% 0 0 / 0.4)',
      '7': 'oklch(0% 0 0 / 0.5)',
      '8': 'oklch(0% 0 0 / 0.6)',
      '9': 'oklch(0% 0 0 / 0.7)',
      '10': 'oklch(0% 0 0 / 0.8)',
      '11': 'oklch(0% 0 0 / 0.9)',
      '12': 'oklch(0% 0 0 / 0.95)',
    },
    whiteA: {
      '1': 'oklch(100% 0 0 / 0.05)',
      '2': 'oklch(100% 0 0 / 0.1)',
      '3': 'oklch(100% 0 0 / 0.15)',
      '4': 'oklch(100% 0 0 / 0.2)',
      '5': 'oklch(100% 0 0 / 0.3)',
      '6': 'oklch(100% 0 0 / 0.4)',
      '7': 'oklch(100% 0 0 / 0.5)',
      '8': 'oklch(100% 0 0 / 0.6)',
      '9': 'oklch(100% 0 0 / 0.7)',
      '10': 'oklch(100% 0 0 / 0.8)',
      '11': 'oklch(100% 0 0 / 0.9)',
      '12': 'oklch(100% 0 0 / 0.95)',
    },
  },

  font: {
    default: {
      DEFAULT:
        "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
    weight: {
      normal: '425',
      medium: '525',
      semibold: '625',
      bold: '725',
    },
  },
  text: {
    xs: {
      DEFAULT: '0.75rem',
      lineHeight: 'calc(1 / 0.75)',
    },
    sm: {
      DEFAULT: '0.875rem',
      lineHeight: 'calc(1.25 / 0.875)',
    },
    base: {
      DEFAULT: '1rem',
      lineHeight: 'calc(1.5 / 1)',
    },
    lg: {
      DEFAULT: '1.125rem',
      lineHeight: 'calc(1.75 / 1.125)',
    },
    xl: {
      DEFAULT: '1.25rem',
      lineHeight: 'calc(1.75 / 1.25)',
    },
    '2xl': {
      DEFAULT: '1.5rem',
      lineHeight: 'calc(2 / 1.5)',
    },
    '3xl': {
      DEFAULT: '1.875rem',
      lineHeight: 'calc(2.25 / 1.875)',
    },
    '4xl': {
      DEFAULT: '2.25rem',
      lineHeight: 'calc(2.5 / 2.25)',
    },
    '5xl': {
      DEFAULT: '3rem',
      lineHeight: '1',
    },
    '6xl': {
      DEFAULT: '3.75rem',
      lineHeight: '1',
    },
  },
  spacing: {
    DEFAULT: '0.25rem',
    px: '1px',
    '0': {
      DEFAULT: '0',
      '5': '0.125rem',
    },
    '1': {
      DEFAULT: '0.25rem',
      '5': '0.375rem',
    },
    '2': {
      DEFAULT: '0.5rem',
      '5': '0.625rem',
    },
    '3': {
      DEFAULT: '0.75rem',
      '5': '0.875rem',
    },
    '4': '1rem',
    '5': '1.25rem',
    '6': '1.5rem',
    '7': '1.75rem',
    '8': '2rem',
    '9': '2.25rem',
    '10': '2.5rem',
    '11': '2.75rem',
    '12': '3rem',
    '14': '3.5rem',
    '16': '4rem',
    '20': '5rem',
    '24': '6rem',
    '28': '7rem',
    '32': '8rem',
    '36': '9rem',
    '40': '10rem',
    '44': '11rem',
    '48': '12rem',
    '52': '13rem',
    '56': '14rem',
    '60': '15rem',
    '64': '16rem',
    '72': '18rem',
    '80': '20rem',
    '96': '24rem',
  },
  radius: {
    none: '0',
    xs: '0.125rem',
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
    '3xl': '1.5rem',
    '4xl': '2rem',
    // calc(infinity * 1px) breaks LightningCSS visitors (#1188)
    full: '9999px',
  },

  breakpoint: {
    sm: '40rem',
    md: '48rem',
    lg: '64rem',
    xl: '80rem',
    '2xl': '96rem',
  },

  container: {
    '3xs': '16rem',
    '2xs': '18rem',
    xs: '20rem',
    sm: '24rem',
    md: '28rem',
    lg: '32rem',
    xl: '36rem',
    '2xl': '42rem',
    '3xl': '48rem',
    '4xl': '56rem',
    '5xl': '64rem',
    '6xl': '72rem',
    '7xl': '80rem',
  },

  duration: {
    DEFAULT: '150ms',
    '0': '0s',
    '75': '75ms',
    '100': '100ms',
    '150': '150ms',
    '200': '200ms',
    '300': '300ms',
    '500': '500ms',
    '700': '700ms',
    '1000': '1000ms',
  },

  delay: {
    '0': '0s',
    '75': '75ms',
    '100': '100ms',
    '150': '150ms',
    '200': '200ms',
    '300': '300ms',
    '500': '500ms',
    '700': '700ms',
    '1000': '1000ms',
  },

  ease: {
    DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
  },

  transition: {
    none: 'none',
    all: 'all',
    DEFAULT:
      'color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter',
    colors:
      'color, background-color, border-color, outline-color, text-decoration-color, fill, stroke',
    opacity: 'opacity',
    shadow: 'box-shadow',
    transform: 'transform',
  },

  // Layered elevations; color via --shadow-color (HSL channels) on :root / wrappers
  shadow: {
    sm: '0.5px 1px 1px hsl(var(--shadow-color) / 0.7)',
    md: '1px 2px 2px hsl(var(--shadow-color) / 0.333), 2px 4px 4px hsl(var(--shadow-color) / 0.333), 3px 6px 6px hsl(var(--shadow-color) / 0.333)',
    lg: '1px 2px 2px hsl(var(--shadow-color) / 0.2), 2px 4px 4px hsl(var(--shadow-color) / 0.2), 4px 8px 8px hsl(var(--shadow-color) / 0.2), 8px 16px 16px hsl(var(--shadow-color) / 0.2), 16px 32px 32px hsl(var(--shadow-color) / 0.2)',
  },
} as const

export type Tokens = typeof tokens

/** Nested token tree: objects branch, strings are leaf CSS values. */
export type TokenTree = { readonly [key: string]: string | TokenTree }

type Join<K, P> = K extends string
  ? P extends string
    ? `${K}.${P}`
    : never
  : never

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** Dotted paths that resolve to a string leaf, including DEFAULT as the parent path. */
export type TokenPath<T, D extends number = 6> = [D] extends [never]
  ? never
  : {
      [K in keyof T & string]: T[K] extends string
        ? K extends 'DEFAULT'
          ? never
          : K
        : T[K] extends { readonly DEFAULT: string }
          ? K | Join<K, TokenPath<Omit<T[K], 'DEFAULT'>, Prev[D]>>
          : Join<K, TokenPath<T[K], Prev[D]>>
    }[keyof T & string]

export type DesignTokenPath = TokenPath<Tokens>
