import React from 'react';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'library'
  | 'discover'
  | 'updates'
  | 'profile'
  | 'search'
  | 'settings'
  | 'download'
  | 'check'
  | 'chevronRight'
  | 'chevronDown'
  | 'back'
  | 'bookmark'
  | 'grid'
  | 'list'
  | 'filter'
  | 'drag'
  | 'plus'
  | 'minus'
  | 'close'
  | 'book'
  | 'sun'
  | 'moon'
  | 'columns'
  | 'arrowRight'
  | 'trash'
  | 'refresh'
  | 'edit'
  | 'globe'
  | 'more'
  | 'share'
  | 'image';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean;
}

/**
 * Minimal stroked line-icon set (Feather-ish) so the UI stays light and
 * consistent without a font-based icon dependency.
 */
export function Icon({ name, size = 24, color = '#000', strokeWidth = 1.8, filled }: IconProps) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  const fillCommon = filled ? { fill: color, stroke: color } : common;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderPaths(name, common, fillCommon)}
    </Svg>
  );
}

function renderPaths(
  name: IconName,
  c: object,
  f: object,
): React.ReactNode {
  switch (name) {
    case 'home':
      return (
        <>
          <Path {...f} d="M3 10.5 12 3l9 7.5" />
          <Path {...(f as object)} d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
        </>
      );
    case 'library':
      return (
        <>
          <Path {...c} d="M4 4h6v16H4z" />
          <Path {...c} d="M14 4h6v16h-6z" />
        </>
      );
    case 'book':
      return <Path {...c} d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" />;
    case 'discover':
      return (
        <>
          <Circle {...c} cx={12} cy={12} r={9} />
          <Path {...f} d="m15.5 8.5-2 5-5 2 2-5z" />
        </>
      );
    case 'updates':
      return (
        <>
          <Path {...c} d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <Path {...c} d="M13.5 21a2 2 0 0 1-3 0" />
        </>
      );
    case 'refresh':
      return (
        <>
          <Polyline {...c} points="23 4 23 10 17 10" />
          <Path {...c} d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </>
      );
    case 'profile':
      return (
        <>
          <Circle {...c} cx={12} cy={8} r={4} />
          <Path {...c} d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
        </>
      );
    case 'search':
      return (
        <>
          <Circle {...c} cx={11} cy={11} r={7} />
          <Line {...c} x1={20} y1={20} x2={16} y2={16} />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle {...c} cx={12} cy={12} r={3} />
          <Path
            {...c}
            d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"
          />
        </>
      );
    case 'download':
      return (
        <>
          <Path {...c} d="M12 3v12" />
          <Polyline {...c} points="7,11 12,16 17,11" />
          <Path {...c} d="M5 20h14" />
        </>
      );
    case 'check':
      return <Polyline {...c} points="5,12 10,17 19,7" />;
    case 'chevronRight':
      return <Polyline {...c} points="9,5 16,12 9,19" />;
    case 'chevronDown':
      return <Polyline {...c} points="6,9 12,16 18,9" />;
    case 'arrowRight':
      return (
        <>
          <Line {...c} x1={4} y1={12} x2={20} y2={12} />
          <Polyline {...c} points="14,6 20,12 14,18" />
        </>
      );
    case 'back':
      return (
        <>
          <Line {...c} x1={20} y1={12} x2={5} y2={12} />
          <Polyline {...c} points="11,6 5,12 11,18" />
        </>
      );
    case 'bookmark':
      return <Path {...f} d="M6 3h12v18l-6-4-6 4z" />;
    case 'grid':
      return (
        <>
          <Path {...c} d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
        </>
      );
    case 'list':
      return (
        <>
          <Line {...c} x1={8} y1={6} x2={20} y2={6} />
          <Line {...c} x1={8} y1={12} x2={20} y2={12} />
          <Line {...c} x1={8} y1={18} x2={20} y2={18} />
          <Circle {...f} cx={4} cy={6} r={1} />
          <Circle {...f} cx={4} cy={12} r={1} />
          <Circle {...f} cx={4} cy={18} r={1} />
        </>
      );
    case 'filter':
      return <Path {...c} d="M3 5h18l-7 8v6l-4-2v-4z" />;
    case 'drag':
      return (
        <>
          <Circle {...f} cx={9} cy={6} r={1.3} />
          <Circle {...f} cx={15} cy={6} r={1.3} />
          <Circle {...f} cx={9} cy={12} r={1.3} />
          <Circle {...f} cx={15} cy={12} r={1.3} />
          <Circle {...f} cx={9} cy={18} r={1.3} />
          <Circle {...f} cx={15} cy={18} r={1.3} />
        </>
      );
    case 'plus':
      return (
        <>
          <Line {...c} x1={12} y1={5} x2={12} y2={19} />
          <Line {...c} x1={5} y1={12} x2={19} y2={12} />
        </>
      );
    case 'minus':
      return <Line {...c} x1={5} y1={12} x2={19} y2={12} />;
    case 'close':
      return (
        <>
          <Line {...c} x1={6} y1={6} x2={18} y2={18} />
          <Line {...c} x1={18} y1={6} x2={6} y2={18} />
        </>
      );
    case 'sun':
      return (
        <>
          <Circle {...c} cx={12} cy={12} r={4} />
          <Path
            {...c}
            d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"
          />
        </>
      );
    case 'moon':
      return <Path {...c} d="M20 13A8 8 0 1 1 11 4a6 6 0 0 0 9 9Z" />;
    case 'trash':
      return (
        <>
          <Polyline {...c} points="4,7 20,7" />
          <Path {...c} d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          <Path {...c} d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
        </>
      );
    case 'edit':
      return (
        <>
          <Path {...c} d="M12 20h9" />
          <Path {...c} d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </>
      );
    case 'globe':
      return (
        <>
          <Circle {...c} cx={12} cy={12} r={9} />
          <Line {...c} x1={3} y1={12} x2={21} y2={12} />
          <Path {...c} d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z" />
        </>
      );
    case 'columns':
      return (
        <>
          <Path {...c} d="M4 4h7v16H4zM13 4h7v16h-7z" />
        </>
      );
    case 'more':
      return (
        <>
          <Circle {...f} cx={12} cy={5} r={1.6} />
          <Circle {...f} cx={12} cy={12} r={1.6} />
          <Circle {...f} cx={12} cy={19} r={1.6} />
        </>
      );
    case 'share':
      return (
        <>
          <Circle {...c} cx={18} cy={5} r={3} />
          <Circle {...c} cx={6} cy={12} r={3} />
          <Circle {...c} cx={18} cy={19} r={3} />
          <Line {...c} x1={8.6} y1={10.6} x2={15.4} y2={6.4} />
          <Line {...c} x1={8.6} y1={13.4} x2={15.4} y2={17.6} />
        </>
      );
    case 'image':
      return (
        <>
          <Path {...c} d="M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
          <Circle {...c} cx={9} cy={10} r={1.6} />
          <Polyline {...c} points="5,18 10,12 14,16 17,13 19,15" />
        </>
      );
    default:
      return null;
  }
}
