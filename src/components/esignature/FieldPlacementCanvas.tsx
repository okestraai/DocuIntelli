import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Trash2, GripVertical, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker — use the bundled worker from node_modules
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface PlacedField {
  id: string;
  signerEmail: string;
  fieldType: string;
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  label?: string;
}

export interface Signer {
  name: string;
  email: string;
}

interface FieldPlacementCanvasProps {
  pdfUrl: string;
  signers: Signer[];
  fields: PlacedField[];
  onFieldsChange: (fields: PlacedField[]) => void;
  selectedFieldType: string | null;
  selectedSignerEmail: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  signature: 'Signature',
  full_name: 'Full Name',
  initials: 'Initials',
  date_signed: 'Date Signed',
  text_field: 'Text',
  checkbox: 'Checkbox',
  title_role: 'Title/Role',
  company_name: 'Company',
  custom_text: 'Custom',
};

const FIELD_DEFAULTS: Record<string, { w: number; h: number }> = {
  signature: { w: 20, h: 6 },
  full_name: { w: 18, h: 3.5 },
  initials: { w: 8, h: 5 },
  date_signed: { w: 15, h: 3.5 },
  text_field: { w: 20, h: 3.5 },
  checkbox: { w: 3, h: 3 },
  title_role: { w: 18, h: 3.5 },
  company_name: { w: 18, h: 3.5 },
  custom_text: { w: 20, h: 3.5 },
};

const SIGNER_COLORS = [
  { bg: 'bg-blue-100 border-blue-400', text: 'text-blue-700', hex: '#3b82f6' },
  { bg: 'bg-amber-100 border-amber-400', text: 'text-amber-700', hex: '#f59e0b' },
  { bg: 'bg-purple-100 border-purple-400', text: 'text-purple-700', hex: '#8b5cf6' },
  { bg: 'bg-rose-100 border-rose-400', text: 'text-rose-700', hex: '#f43f5e' },
  { bg: 'bg-emerald-100 border-emerald-400', text: 'text-emerald-700', hex: '#10b981' },
];

export function FieldPlacementCanvas({
  pdfUrl,
  signers,
  fields,
  onFieldsChange,
  selectedFieldType,
  selectedSignerEmail,
}: FieldPlacementCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [draggingField, setDraggingField] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const didDragRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const renderTaskRef = useRef<any>(null);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    (async () => {
      try {
        // For blob URLs, fetch the data first as an ArrayBuffer
        let source: any = pdfUrl;
        if (pdfUrl.startsWith('blob:')) {
          const response = await fetch(pdfUrl);
          const arrayBuffer = await response.arrayBuffer();
          source = { data: new Uint8Array(arrayBuffer) };
        }

        const loadingTask = pdfjsLib.getDocument(source);
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
      } catch (err) {
        console.error('Failed to load PDF:', err);
        if (!cancelled) setLoadError('Failed to load PDF document');
      }
    })();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        // Cancel any in-progress render
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch {}
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        // Measure the available width from the scrollable wrapper
        const wrapper = wrapperRef.current;
        const availableWidth = wrapper ? wrapper.clientWidth - 32 : 700; // subtract padding
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(availableWidth / viewport.width, 2); // cap at 2x
        const scaledViewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        setCanvasSize({ width: scaledViewport.width, height: scaledViewport.height });

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas first
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({ canvasContext: ctx, viewport: scaledViewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelled') {
          console.error('Failed to render page:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
    };
  }, [pdfDoc, currentPage]);

  const getSignerColor = useCallback((email: string) => {
    const idx = signers.findIndex(s => s.email === email);
    return SIGNER_COLORS[idx % SIGNER_COLORS.length];
  }, [signers]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Suppress click if we just finished a drag
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    if (!selectedFieldType || !selectedSignerEmail) return;
    if (!containerRef.current || canvasSize.width === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;
    const defaults = FIELD_DEFAULTS[selectedFieldType] || { w: 18, h: 3.5 };

    const newField: PlacedField = {
      id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      signerEmail: selectedSignerEmail,
      fieldType: selectedFieldType,
      pageNumber: currentPage,
      xPercent: Math.max(0, Math.min(xPercent - defaults.w / 2, 100 - defaults.w)),
      yPercent: Math.max(0, Math.min(yPercent - defaults.h / 2, 100 - defaults.h)),
      widthPercent: defaults.w,
      heightPercent: defaults.h,
    };

    onFieldsChange([...fields, newField]);
  }, [selectedFieldType, selectedSignerEmail, currentPage, canvasSize, fields, onFieldsChange, draggingField]);

  const handleFieldMouseDown = useCallback((e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const field = fields.find(f => f.id === fieldId);
    if (!field || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const fieldX = (field.xPercent / 100) * rect.width;
    const fieldY = (field.yPercent / 100) * rect.height;

    didDragRef.current = false;
    setDraggingField(fieldId);
    setDragOffset({
      x: e.clientX - rect.left - fieldX,
      y: e.clientY - rect.top - fieldY,
    });
  }, [fields]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingField || !containerRef.current) return;
    e.preventDefault();
    didDragRef.current = true;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - dragOffset.x;
    const y = e.clientY - rect.top - dragOffset.y;

    const field = fields.find(f => f.id === draggingField);
    const fw = field ? field.widthPercent : 0;
    const fh = field ? field.heightPercent : 0;

    const xPercent = Math.max(0, Math.min((x / rect.width) * 100, 100 - fw));
    const yPercent = Math.max(0, Math.min((y / rect.height) * 100, 100 - fh));

    onFieldsChange(fields.map(f =>
      f.id === draggingField ? { ...f, xPercent, yPercent } : f
    ));
  }, [draggingField, dragOffset, fields, onFieldsChange]);

  const handleMouseUp = useCallback(() => {
    if (draggingField) {
      didDragRef.current = true;
    }
    setDraggingField(null);
  }, [draggingField]);

  const removeField = useCallback((fieldId: string) => {
    onFieldsChange(fields.filter(f => f.id !== fieldId));
  }, [fields, onFieldsChange]);

  const currentPageFields = fields.filter(f => f.pageNumber === currentPage);

  return (
    <div className="flex flex-col h-full">
      {/* Page navigation */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-100 border-b border-slate-200">
        <button
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          className="p-1.5 text-slate-600 hover:bg-slate-200 disabled:text-slate-300 rounded-lg transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-slate-600">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage >= totalPages}
          className="p-1.5 text-slate-600 hover:bg-slate-200 disabled:text-slate-300 rounded-lg transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Canvas area */}
      <div ref={wrapperRef} className="flex-1 overflow-auto bg-slate-200 p-4">
        {loadError && (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-500 text-sm">{loadError}</p>
          </div>
        )}

        {isLoading && !loadError && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
          </div>
        )}

        <div
          ref={containerRef}
          className="relative mx-auto bg-white shadow-lg"
          style={{
            width: canvasSize.width > 0 ? canvasSize.width : '100%',
            height: canvasSize.height > 0 ? canvasSize.height : undefined,
            maxWidth: '100%',
            cursor: selectedFieldType && selectedSignerEmail ? 'crosshair' : 'default',
          }}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
            }}
          />

          {/* Placed fields overlay */}
          {currentPageFields.map(field => {
            const color = getSignerColor(field.signerEmail);
            const signer = signers.find(s => s.email === field.signerEmail);
            const isDragging = draggingField === field.id;
            return (
              <div
                key={field.id}
                className={`absolute border-2 rounded ${color.bg} select-none group ${isDragging ? 'cursor-grabbing ring-2 ring-emerald-500 z-20' : 'cursor-grab'}`}
                style={{
                  left: `${field.xPercent}%`,
                  top: `${field.yPercent}%`,
                  width: `${field.widthPercent}%`,
                  height: `${field.heightPercent}%`,
                  opacity: isDragging ? 0.95 : 0.85,
                  transition: isDragging ? 'none' : 'box-shadow 0.15s',
                }}
                onMouseDown={e => handleFieldMouseDown(e, field.id)}
              >
                <div className={`flex items-center gap-1 px-1 h-full ${color.text}`}>
                  <GripVertical className="h-3 w-3 flex-shrink-0 opacity-60" />
                  <span className="text-[10px] font-medium truncate leading-tight">
                    {FIELD_LABELS[field.fieldType] || field.fieldType}
                    {signer && <span className="opacity-60 ml-1">({signer.name.split(' ')[0]})</span>}
                  </span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); removeField(field.id); }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {/* Click hint overlay */}
          {selectedFieldType && selectedSignerEmail && !isLoading && (
            <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-emerald-400 rounded-lg">
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg whitespace-nowrap">
                Click to place {FIELD_LABELS[selectedFieldType] || selectedFieldType}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
