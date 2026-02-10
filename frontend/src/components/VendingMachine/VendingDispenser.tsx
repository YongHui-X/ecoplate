import { cn } from "../../lib/utils";
import type { VendingProduct, VendingStatus } from "../../hooks/useVendingMachine";
import { uploadService } from "../../services/upload";

interface VendingDispenserProps {
  status: VendingStatus;
  dispensedProduct: VendingProduct | null;
  onDispense: () => void;
  canDispense: boolean;
}

export function VendingDispenser({
  status,
  dispensedProduct,
  onDispense,
  canDispense,
}: VendingDispenserProps) {
  return (
    <div className="bg-gray-900 rounded-lg border-2 border-gray-700 overflow-hidden">
      {/* Dispense button */}
      <div className="p-3 border-b border-gray-700">
        <button
          onClick={onDispense}
          disabled={!canDispense || status === "dispensing"}
          className={cn(
            "w-full py-3 rounded-lg font-bold text-lg",
            "transition-all duration-200",
            canDispense && status !== "dispensing"
              ? "bg-green-600 hover:bg-green-500 text-white animate-pulse"
              : "bg-gray-700 text-gray-500 cursor-not-allowed"
          )}
        >
          {status === "dispensing" ? "DISPENSING..." : "DISPENSE"}
        </button>
      </div>

      {/* Dispenser tray */}
      <div className="relative h-32 bg-gray-950 flex items-end justify-center p-3">
        {/* Tray opening */}
        <div className="absolute top-0 left-4 right-4 h-4 bg-gray-800 rounded-b-lg shadow-inner" />

        {/* Dispensed product animation */}
        {(status === "dispensing" || status === "complete") && dispensedProduct && (
          <div
            className={cn(
              "absolute inset-x-4",
              status === "dispensing" && "animate-[drop_0.5s_ease-in_forwards]",
              status === "complete" && "bottom-3"
            )}
            style={{
              top: status === "dispensing" ? "0" : "auto",
            }}
          >
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-600 mx-auto max-w-[200px]">
              <div className="flex items-center gap-3">
                {dispensedProduct.listing.images[0]?.imageUrl ? (
                  <img
                    src={uploadService.getImageUrl(dispensedProduct.listing.images[0].imageUrl)}
                    alt={dispensedProduct.listing.title}
                    className="w-12 h-12 object-contain rounded"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gray-700 rounded flex items-center justify-center text-gray-500 text-xs">
                    No img
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium text-sm truncate">
                    {dispensedProduct.listing.title}
                  </div>
                  <div className="text-green-400 text-xs">
                    Pick up your item!
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty tray message */}
        {status !== "dispensing" && status !== "complete" && (
          <div className="text-gray-600 text-sm">
            Your item will appear here
          </div>
        )}
      </div>

      {/* Keyframe animation style */}
      <style>{`
        @keyframes drop {
          0% {
            transform: translateY(-100%);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            transform: translateY(calc(100% - 1rem));
          }
        }
      `}</style>
    </div>
  );
}
