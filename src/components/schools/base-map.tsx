"use client";

// ——— مكوّن الخريطة التفاعلية (Leaflet + بلاطات OpenStreetMap المجانية) ———
// يدعم: علامات ملونة، نوافذ معلومات HTML، دائرة نطاق، علامة مركز قابلة للسحب،
// تغيير الحدود عند التحريك، ملاءمة الإطار تلقائياً.

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color?: "sky" | "green" | "amber" | "red" | "slate";
  title?: string;
  popupHtml?: string;
  draggable?: boolean;
  onClick?: () => void;
}

export interface MapCircle {
  center: { lat: number; lng: number };
  radiusM: number;
}

interface BaseMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  circle?: MapCircle | null;
  fitBounds?: { west: number; south: number; east: number; north: number } | null;
  onBoundsChange?: (bounds: { west: number; south: number; east: number; north: number }) => void;
  onCenterDrag?: (center: { lat: number; lng: number }) => void;
  onMapClick?: (pos: { lat: number; lng: number }) => void;
  className?: string;
  ariaLabel?: string;
}

const COLOR_HEX: Record<string, string> = {
  sky: "#0ea5e9",
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
  slate: "#475569",
};

function dotIcon(color: string, active: boolean) {
  const c = COLOR_HEX[color] ?? COLOR_HEX.slate;
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${active ? 18 : 14}px;height:${active ? 18 : 14}px;border-radius:9999px;background:${c};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>`,
    iconSize: [active ? 18 : 14, active ? 18 : 14],
    iconAnchor: [active ? 9 : 7, active ? 9 : 7],
    popupAnchor: [0, -10],
  });
}

export default function BaseMap({
  center,
  zoom = 13,
  markers = [],
  circle = null,
  fitBounds = null,
  onBoundsChange,
  onCenterDrag,
  onMapClick,
  className = "",
  ariaLabel = "خريطة تفاعلية",
}: BaseMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const dragMarkerRef = useRef<L.Marker | null>(null);
  const cbRef = useRef({ onBoundsChange, onCenterDrag, onMapClick });
  // تحديث المراجع في تأثير — لا أثناء الرسم
  useEffect(() => {
    cbRef.current = { onBoundsChange, onCenterDrag, onMapClick };
  }, [onBoundsChange, onCenterDrag, onMapClick]);

  // تهيئة الخريطة مرة واحدة
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);

    const emitBounds = () => {
      const b = map.getBounds();
      cbRef.current.onBoundsChange?.({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });
    };
    map.on("moveend", emitBounds);
    map.on("click", (e: L.LeafletMouseEvent) => {
      cbRef.current.onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = map;
    emitBounds();
    // إعادة القياس بعد أول إطار — ضروري داخل الحاويات المرنة
    setTimeout(() => map.invalidateSize(), 150);

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      circleRef.current = null;
      dragMarkerRef.current = null;
    };
  }, []);

  // العلامات
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], {
        icon: dotIcon(m.color ?? "sky", Boolean(m.draggable)),
        draggable: Boolean(m.draggable),
        title: m.title ?? "",
      });
      if (m.popupHtml) marker.bindPopup(m.popupHtml, { maxWidth: 320 });
      if (m.onClick) marker.on("click", () => m.onClick?.());
      if (m.draggable) {
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          cbRef.current.onCenterDrag?.({ lat: p.lat, lng: p.lng });
        });
      }
      marker.addTo(layer);
    }
  }, [markers]);

  // دائرة النطاق
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }
    if (circle) {
      circleRef.current = L.circle([circle.center.lat, circle.center.lng], {
        radius: circle.radiusM,
        color: "#0ea5e9",
        weight: 2,
        fillColor: "#0ea5e9",
        fillOpacity: 0.08,
      }).addTo(map);
    }
  }, [circle]);

  // ملاءمة الإطار
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitBounds) return;
    const b = L.latLngBounds([fitBounds.south, fitBounds.west], [fitBounds.north, fitBounds.east]);
    map.fitBounds(b, { padding: [24, 24] });
  }, [fitBounds]);

  // مركز الخريطة الخارجي (يتحرك فقط عند تغيّر قيمة المركز المحكومة)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (Math.abs(c.lat - center.lat) > 0.0001 || Math.abs(c.lng - center.lng) > 0.0001) {
      map.setView([center.lat, center.lng], map.getZoom());
    }
  }, [center]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={ariaLabel}
      className={`h-full w-full ${className}`}
      dir="ltr"
    />
  );
}
