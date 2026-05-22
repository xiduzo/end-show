import { useEffect, useState } from "react";

export type BookLayout = {
  card: { x: number; y: number; w: number; h: number };
  details: { x: number; y: number; w: number; h: number };
  foldOrigin: string;
  foldAxis: "x" | "y"; // x = rotateX (mobile), y = rotateY (kiosk)
  imagePadding: number;
};

export function computeBookLayout(isMobile: boolean): BookLayout {
  if (typeof window === "undefined") {
    return {
      card: { x: 0, y: 0, w: 280, h: 380 },
      details: { x: 280, y: 0, w: 360, h: 380 },
      foldOrigin: "0% 50%",
      foldAxis: "y",
      imagePadding: 16,
    };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (isMobile) {
    const cardW = Math.min(vw - 48, 300);
    const cardH = Math.min(vh * 0.4, cardW * 0.7);
    const detailsW = cardW;
    const detailsH = Math.min(vh - cardH - 48, 460);
    const totalH = cardH + detailsH;
    const x = (vw - cardW) / 2;
    const y = Math.max(24, (vh - totalH) / 2);
    return {
      card: { x, y, w: cardW, h: cardH },
      details: { x, y: y + cardH, w: detailsW, h: detailsH },
      foldOrigin: "50% 0%",
      foldAxis: "x",
      imagePadding: 14,
    };
  }
  const cardW = Math.min(vw * 0.3, 360);
  const cardH = Math.min(vh - 96, cardW * 1.3);
  const detailsW = Math.min(vw - cardW - 96, 520);
  const totalW = cardW + 24 + detailsW;
  const x = (vw - totalW) / 2;
  const y = (vh - cardH) / 2;
  return {
    card: { x, y, w: cardW, h: cardH },
    details: { x: x + cardW + 24, y, w: detailsW, h: cardH },
    foldOrigin: "0% 50%",
    foldAxis: "y",
    imagePadding: 18,
  };
}

export function useBookLayout(isMobile: boolean): BookLayout {
  const [layout, setLayout] = useState<BookLayout>(() =>
    computeBookLayout(isMobile),
  );
  useEffect(() => {
    const onResize = () => setLayout(computeBookLayout(isMobile));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isMobile]);
  return layout;
}
