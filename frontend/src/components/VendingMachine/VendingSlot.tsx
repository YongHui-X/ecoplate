import { cn } from "../../lib/utils";
import type { VendingProduct } from "../../hooks/useVendingMachine";
import { uploadService } from "../../services/upload";

interface VendingSlotProps {
  product?: VendingProduct;
  isSelected: boolean;
  onSelect: (slotCode: string) => void;
  slotCode: string;
}

export function VendingSlot({
  product,
  isSelected,
  onSelect,
  slotCode,
}: VendingSlotProps) {
  const price = product?.listing.price ?? 0;
  const imageUrl = product?.listing.images[0]?.imageUrl;

  return (
    <button
      onClick={() => onSelect(slotCode)}
      disabled={!product}
      className={cn(
        "relative flex flex-col items-center justify-between",
        "w-full aspect-[3/4] rounded-lg p-2",
        "bg-gray-800/50 border-2 transition-all duration-200",
        product
          ? "border-gray-600 hover:border-primary cursor-pointer"
          : "border-gray-700/50 cursor-not-allowed opacity-50",
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-gray-900 border-primary"
      )}
    >
      {/* Slot code badge */}
      <div className="absolute top-1 left-1 bg-gray-700 text-gray-300 text-xs font-mono px-1.5 py-0.5 rounded">
        {slotCode}
      </div>

      {/* Product image */}
      <div className="flex-1 flex items-center justify-center w-full overflow-hidden rounded mt-5">
        {product ? (
          imageUrl ? (
            <img
              src={imageUrl ? uploadService.getImageUrl(imageUrl) : undefined}
              alt={product.listing.title}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="text-gray-500 text-xs text-center px-1">
              {product.listing.title}
            </div>
          )
        ) : (
          <div className="text-gray-600 text-xs">Empty</div>
        )}
      </div>

      {/* Product info */}
      {product && (
        <div className="w-full mt-1">
          <div className="text-gray-300 text-xs truncate text-center">
            {product.listing.title}
          </div>
          <div className="text-green-400 font-bold text-sm text-center">
            {price === 0 ? "FREE" : `$${price.toFixed(2)}`}
          </div>
        </div>
      )}
    </button>
  );
}
