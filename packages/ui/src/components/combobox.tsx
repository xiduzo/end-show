"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { cn } from "@end-show/ui/lib/utils";
import { CheckIcon, XIcon } from "lucide-react";

/**
 * Multi-select combobox with autocomplete, built on Base UI.
 *
 * `Combobox` (Root) renders no element and keeps Base UI's generic typing, so
 * use it directly. The leaf parts below are thin styled pass-throughs; compose
 * them at the call site. See routes/index.tsx for a multi-select example.
 */
const Combobox = ComboboxPrimitive.Root;
const ComboboxPortal = ComboboxPrimitive.Portal;
const ComboboxValue = ComboboxPrimitive.Value;

function ComboboxChips({ className, ...props }: ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-none border border-black bg-white px-2 py-2 focus-within:ring-1 focus-within:ring-black",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({ className, ...props }: ComboboxPrimitive.Chip.Props) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "flex items-center gap-1.5 rounded-full bg-black py-1 pr-1 pl-3 font-mono text-sm tracking-widest text-chalkboard uppercase",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChipRemove({
  className,
  ...props
}: ComboboxPrimitive.ChipRemove.Props) {
  return (
    <ComboboxPrimitive.ChipRemove
      data-slot="combobox-chip-remove"
      aria-label="Remove"
      className={cn(
        "flex size-5 items-center justify-center rounded-full text-chalkboard/70 transition hover:bg-white/20 hover:text-chalkboard",
        className,
      )}
      {...props}
    >
      <XIcon className="size-3.5" />
    </ComboboxPrimitive.ChipRemove>
  );
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "min-w-24 flex-1 bg-transparent px-1 py-0.5 font-mono text-sm tracking-widest text-black uppercase outline-none placeholder:text-black/40 placeholder:tracking-normal placeholder:normal-case",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxContent({
  className,
  sideOffset = 4,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "sideOffset" | "side" | "align">) {
  const { side, align, ...popupProps } = props;
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        className="isolate z-50 outline-none"
        sideOffset={sideOffset}
        side={side}
        align={align}
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-none border border-black bg-white py-1 shadow-md outline-none",
            className,
          )}
          {...popupProps}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

const ComboboxList = ComboboxPrimitive.List;

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "flex cursor-default items-center justify-between gap-2 px-3 py-2 font-mono text-sm tracking-widest text-black uppercase outline-none select-none data-[highlighted]:bg-black data-[highlighted]:text-chalkboard",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      <ComboboxPrimitive.ItemIndicator>
        <CheckIcon className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "px-3 py-2 font-mono text-xs text-black/40 empty:m-0 empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxPortal,
  ComboboxValue,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
};
