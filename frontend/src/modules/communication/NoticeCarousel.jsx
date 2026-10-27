import { useEffect, useState } from 'react';

const SLIDE_MS = 3000;

export function NoticeCarousel({ images, label }) {
  const slides = Array.isArray(images) ? images.filter((image) => image?.url) : [];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [slides.length, slides[0]?.id]);

  useEffect(() => {
    if (slides.length < 2) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (!slides.length) {
    return null;
  }

  const slide = slides[Math.min(index, slides.length - 1)];
  return (
    <div className="notice-carousel" aria-roledescription="carousel" aria-label={label || 'Notice photos'}>
      <img className="notice-carousel__image" src={slide.url} alt="" />
      {slides.length > 1 ? (
        <p className="notice-carousel__count">
          {index + 1} / {slides.length}
        </p>
      ) : null}
    </div>
  );
}
