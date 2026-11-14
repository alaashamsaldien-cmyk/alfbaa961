"use client";

import { useEffect, useRef, useState } from "react";

interface Marker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  visited?: boolean;
}

let mapsLoading: Promise<void> | undefined;

function loadMaps(key: string) {
  if (typeof google !== "undefined" && google.maps?.Map) return Promise.resolve();
  if (!mapsLoading) {
    mapsLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      const params = new URLSearchParams({ key, language: "ar", region: "IQ", v: "quarterly" });
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      script.async = true;
      script.onload = () => {
        if (typeof google !== "undefined" && google.maps?.Map) resolve();
        else reject(new Error("تعذر تهيئة Google Maps."));
      };
      script.onerror = () => {
        script.remove();
        reject(new Error("تعذر تحميل Google Maps."));
      };
      document.head.append(script);
    }).catch((error: unknown) => {
      mapsLoading = undefined;
      throw error;
    });
  }
  return mapsLoading;
}

export function GoogleSchoolsMap({ center, markers, selected, onSelect }: {
  center: google.maps.LatLngLiteral;
  markers: Marker[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!key) return;
    let mounted = true;
    loadMaps(key).then(() => {
      if (!mounted || !element.current) return;
      mapRef.current = new google.maps.Map(element.current, {
        renderingType: google.maps.RenderingType.RASTER,
        clickableIcons: false,
        mapTypeControl: false,
        streetViewControl: false,
        styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
      });
      setReady(true);
    }).catch(() => {
      if (mounted) setError("تعذر تحميل Google Maps.");
    });
    return () => {
      mounted = false;
      if (mapRef.current) google.maps.event.clearInstanceListeners(mapRef.current);
      mapRef.current = null;
    };
  }, [key]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const bounds = new google.maps.LatLngBounds();
    const pins = markers.map((marker) => {
      const position = { lat: marker.lat, lng: marker.lng };
      bounds.extend(position);
      const pin = new google.maps.Marker({
        map, position, title: marker.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: marker.visited ? "#15803d" : "#0284c7",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      pin.addListener("click", () => onSelect(marker.id));
      return pin;
    });
    if (markers.length > 1) map.fitBounds(bounds, 36);
    else {
      map.setCenter(markers[0] ?? center);
      map.setZoom(markers.length ? 15 : 9);
    }
    return () => {
      for (const pin of pins) {
        google.maps.event.clearInstanceListeners(pin);
        pin.setMap(null);
      }
    };
  }, [ready, markers, center.lat, center.lng, onSelect]);

  useEffect(() => {
    const pin = markers.find((item) => item.id === selected);
    if (pin && ready) {
      mapRef.current?.panTo(pin);
      mapRef.current?.setZoom(15);
    }
  }, [ready, markers, selected]);

  if (!key || error) return <p role="status" className="rounded-xl border p-4 text-sm">{error || "خريطة Google بانتظار إعداد مفتاح عرض الخرائط."}</p>;
  return <div ref={element} dir="ltr" aria-label="خريطة مدارس Google" className="h-[min(65dvh,520px)] min-h-80 w-full overflow-hidden rounded-xl border" />;
}
