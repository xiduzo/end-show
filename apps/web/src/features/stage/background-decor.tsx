export function BackgroundDecor() {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 14px)",
        }}
      />
      <div
        aria-hidden
        className="bg-slide/25 absolute -top-1/3 -left-1/4 h-[80vh] w-[80vh] rounded-full blur-[180px]"
      />
      <div
        aria-hidden
        className="bg-lego/40 absolute -right-1/4 -bottom-1/3 h-[70vh] w-[70vh] rounded-full blur-[180px]"
      />
    </>
  );
}
