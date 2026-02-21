import React, { useState, useRef, useMemo } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export interface CropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface CropOverlayProps {
  width: number;
  height: number;
  onCropChange: (crop: CropRect) => void;
  initialCrop?: CropRect;
}

const HANDLE_RADIUS = 12;
const HIT_AREA = 44;
const MIN_SIZE = 60;
const ACCENT_LEN = 24;
const ACCENT_THICK = 3;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';

export default function CropOverlay({ width, height, onCropChange, initialCrop }: CropOverlayProps) {
  const def: CropRect = initialCrop ?? {
    left: width * 0.06,
    top: height * 0.06,
    right: width * 0.94,
    bottom: height * 0.94,
  };

  const [crop, setCrop] = useState(def);
  const liveRef = useRef(def);

  const responders = useMemo(() => {
    const startRef = { current: def };

    function make(corner: Corner) {
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = { ...liveRef.current };
        },
        onPanResponderMove: (_, g) => {
          const s = startRef.current;
          const n = { ...s };

          if (corner === 'tl' || corner === 'bl')
            n.left = clamp(s.left + g.dx, 0, s.right - MIN_SIZE);
          if (corner === 'tr' || corner === 'br')
            n.right = clamp(s.right + g.dx, s.left + MIN_SIZE, width);
          if (corner === 'tl' || corner === 'tr')
            n.top = clamp(s.top + g.dy, 0, s.bottom - MIN_SIZE);
          if (corner === 'bl' || corner === 'br')
            n.bottom = clamp(s.bottom + g.dy, s.top + MIN_SIZE, height);

          liveRef.current = n;
          setCrop(n);
          onCropChange(n);
        },
      });
    }

    return { tl: make('tl'), tr: make('tr'), bl: make('bl'), br: make('br') };
  }, [width, height]);

  const cw = crop.right - crop.left;
  const ch = crop.bottom - crop.top;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dimmed overlay outside crop */}
      <View style={[s.dim, { top: 0, left: 0, right: 0, height: crop.top }]} />
      <View style={[s.dim, { top: crop.bottom, left: 0, right: 0, bottom: 0 }]} />
      <View style={[s.dim, { top: crop.top, left: 0, width: crop.left, height: ch }]} />
      <View style={[s.dim, { top: crop.top, left: crop.right, right: 0, height: ch }]} />

      {/* Crop border */}
      <View
        style={[s.border, { left: crop.left, top: crop.top, width: cw, height: ch }]}
        pointerEvents="none"
      />

      {/* Grid lines (rule of thirds) */}
      <View style={[s.grid, { left: crop.left + cw / 3, top: crop.top, width: 1, height: ch }]} />
      <View style={[s.grid, { left: crop.left + (cw * 2) / 3, top: crop.top, width: 1, height: ch }]} />
      <View style={[s.grid, { left: crop.left, top: crop.top + ch / 3, width: cw, height: 1 }]} />
      <View style={[s.grid, { left: crop.left, top: crop.top + (ch * 2) / 3, width: cw, height: 1 }]} />

      {/* Corner handles — draggable */}
      {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
        const cx = corner.includes('l') ? crop.left : crop.right;
        const cy = corner.startsWith('t') ? crop.top : crop.bottom;
        return (
          <View
            key={corner}
            {...responders[corner].panHandlers}
            style={[s.hitArea, { left: cx - HIT_AREA / 2, top: cy - HIT_AREA / 2 }]}
          >
            <View style={s.handle} />
          </View>
        );
      })}

      {/* Corner accent L-shapes */}
      <CornerAccent x={crop.left} y={crop.top} corner="tl" maxW={width} maxH={height} />
      <CornerAccent x={crop.right} y={crop.top} corner="tr" maxW={width} maxH={height} />
      <CornerAccent x={crop.left} y={crop.bottom} corner="bl" maxW={width} maxH={height} />
      <CornerAccent x={crop.right} y={crop.bottom} corner="br" maxW={width} maxH={height} />
    </View>
  );
}

function CornerAccent({ x, y, corner, maxW: _mw, maxH: _mh }: { x: number; y: number; corner: string; maxW: number; maxH: number }) {
  const isL = corner.includes('l');
  const isT = corner.startsWith('t');

  return (
    <>
      {/* Horizontal bar */}
      <View
        pointerEvents="none"
        style={[
          s.accent,
          {
            left: isL ? x - 1 : x - ACCENT_LEN + 1,
            top: isT ? y - 1 : y - ACCENT_THICK + 1,
            width: ACCENT_LEN,
            height: ACCENT_THICK,
          },
        ]}
      />
      {/* Vertical bar */}
      <View
        pointerEvents="none"
        style={[
          s.accent,
          {
            left: isL ? x - 1 : x - ACCENT_THICK + 1,
            top: isT ? y - 1 : y - ACCENT_LEN + 1,
            width: ACCENT_THICK,
            height: ACCENT_LEN,
          },
        ]}
      />
    </>
  );
}

const s = StyleSheet.create({
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  border: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  grid: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  hitArea: {
    position: 'absolute',
    width: HIT_AREA,
    height: HIT_AREA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: HANDLE_RADIUS * 2,
    height: HANDLE_RADIUS * 2,
    borderRadius: HANDLE_RADIUS,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2.5,
    borderColor: colors.primary[500],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
  },
  accent: {
    position: 'absolute',
    backgroundColor: colors.white,
    borderRadius: 1,
  },
});
