import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";

export function ShaderBg() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      <ShaderGradientCanvas
        style={{ width: "100%", height: "100%" }}
        pixelDensity={1}
        fov={45}
      >
        <ShaderGradient
          animate="on"
          type="sphere"
          shader="defaults"
          color1="#3a39ff"
          color2="#f8f9fa"
          color3="#ff5b23"
          brightness={0.8}
          cAzimuthAngle={270}
          cDistance={0.5}
          cPolarAngle={180}
          cameraZoom={15.1}
          envPreset="city"
          grain="on"
          lightType="env"
          positionX={-0.1}
          positionY={0}
          positionZ={0}
          reflection={0.4}
          rotationX={0}
          rotationY={130}
          rotationZ={70}
          uAmplitude={3.2}
          uDensity={0.8}
          uFrequency={5.5}
          uSpeed={0.15}
          uStrength={0.3}
          uTime={0}
        />
      </ShaderGradientCanvas>
    </div>
  );
}
