import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useToast } from "../contexts/ToastContext";
import { useCamera } from "../hooks/useCamera";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Plus,
  Camera,
  Search,
  Trash2,
  Check,
  Share,
  DollarSign,
  X,
  Upload,
  RotateCcw,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "../lib/utils";

interface Product {
  id: number;
  productName: string;
  category: string | null;
  quantity: number;
  unitPrice: number | null;
  purchaseDate: string | null;
  description: string | null;
  co2Emission: number | null;
}

type ConsumeAction = "consumed" | "wasted" | "shared" | "sold";

interface IdentifiedIngredient {
  id: string;
  productId: number;
  name: string;
  matchedProductName: string;
  estimatedQuantity: number;
  category: string;
  unitPrice: number;
  co2Emission: number;
  confidence: "high" | "medium" | "low";
}


export default function MyFridgePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showTrackConsumption, setShowTrackConsumption] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { addToast } = useToast();

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await api.get<Product[]>("/myfridge/products");
      setProducts(data);
    } catch (error) {
      addToast("Failed to load products", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleConsume = async (product: Product, action: ConsumeAction) => {
    try {
      await api.post(`/myfridge/products/${product.id}/consume`, {
        type: action,
        quantity: product.quantity,
      });
      addToast(
        action === "consumed"
          ? "Product consumed! +5 points"
          : action === "shared"
          ? "Product shared! +10 points"
          : action === "sold"
          ? "Product sold! +8 points"
          : "Product logged as wasted",
        action === "wasted" ? "error" : "success"
      );
      loadProducts();
    } catch (error) {
      addToast("Failed to update product", "error");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/myfridge/products/${id}`);
      addToast("Product deleted", "success");
      loadProducts();
    } catch (error) {
      addToast("Failed to delete product", "error");
    }
  };

  const filteredProducts = products.filter((p) => {
    return p.productName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Sort by purchase date (most recent first)
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!a.purchaseDate) return 1;
    if (!b.purchaseDate) return -1;
    return new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime();
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">MyFridge</h1>
          <p className="text-gray-600">Manage your food inventory</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowScanModal(true)}>
            <Camera className="h-4 w-4 mr-2" />
            Scan Receipt
          </Button>
          <Button variant="outline" onClick={() => setShowTrackConsumption(true)}>
            <UtensilsCrossed className="h-4 w-4 mr-2" />
            Track Consumption
          </Button>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Products list */}
      {sortedProducts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-500 mb-4">No items in your fridge yet</p>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add your first item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sortedProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onConsume={handleConsume}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Add Product Modal */}
      {showAddForm && (
        <AddProductModal
          onClose={() => setShowAddForm(false)}
          onAdded={() => {
            setShowAddForm(false);
            loadProducts();
          }}
        />
      )}

      {/* Scan Receipt Modal */}
      {showScanModal && (
        <ScanReceiptModal
          onClose={() => setShowScanModal(false)}
          onScanned={() => {
            setShowScanModal(false);
            loadProducts();
          }}
        />
      )}

      {/* Track Consumption Modal */}
      {showTrackConsumption && (
        <TrackConsumptionModal
          onClose={() => setShowTrackConsumption(false)}
          onComplete={() => {
            setShowTrackConsumption(false);
            loadProducts();
          }}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  onConsume,
  onDelete,
}: {
  product: Product;
  onConsume: (product: Product, action: ConsumeAction) => void;
  onDelete: (id: number) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  return (
    <Card className="transition-all">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{product.productName}</h3>
              {product.category && (
                <Badge variant="secondary">{product.category}</Badge>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
              <span>Qty: {product.quantity}</span>
              {product.unitPrice != null && (
                <span>${product.unitPrice.toFixed(2)}</span>
              )}
              {product.purchaseDate && (
                <span>
                  Purchased: {new Date(product.purchaseDate).toLocaleDateString()}
                </span>
              )}
            </div>
            {product.description && (
              <p className="mt-1 text-sm text-gray-500">{product.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!showActions ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowActions(true)}
                >
                  Actions
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(product.id)}
                >
                  <Trash2 className="h-4 w-4 text-gray-400" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onConsume(product, "consumed")}
                  className="text-green-600"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Consumed
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onConsume(product, "shared")}
                >
                  <Share className="h-4 w-4 mr-1" />
                  Shared
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onConsume(product, "sold")}
                >
                  <DollarSign className="h-4 w-4 mr-1" />
                  Sold
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onConsume(product, "wasted")}
                  className="text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Wasted
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowActions(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AddProductModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post("/myfridge/products", {
        productName: name,
        category: category || undefined,
        quantity,
        unitPrice: unitPrice ? parseFloat(unitPrice) : undefined,
        purchaseDate: purchaseDate || undefined,
        description: description || undefined,
      });
      addToast("Product added! +2 points", "success");
      onAdded();
    } catch (error) {
      addToast("Failed to add product", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Add Product
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Chicken Breast"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3"
              >
                <option value="">Select...</option>
                <option value="produce">Produce</option>
                <option value="dairy">Dairy</option>
                <option value="meat">Meat</option>
                <option value="bakery">Bakery</option>
                <option value="frozen">Frozen</option>
                <option value="beverages">Beverages</option>
                <option value="pantry">Pantry</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseFloat(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unitPrice">Unit Price ($)</Label>
                <Input
                  id="unitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchaseDate">Purchase Date</Label>
              <Input
                id="purchaseDate"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes about this product"
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "Adding..." : "Add Product"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

interface ScannedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  category: string;
  co2Emission: number;
}

function ScanReceiptModal({
  onClose,
  onScanned,
}: {
  onClose: () => void;
  onScanned: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const camera = useCamera();

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const processBase64 = useCallback(
    async (base64: string) => {
      setScanning(true);
      setShowCamera(false);

      try {
        const response = await api.post<{
          items: Array<{ name: string; quantity: number; category: string; unit: string; unitPrice: number; co2Emission: number }>;
        }>("/myfridge/receipt/scan", { imageBase64: base64 });

        setScannedItems(
          response.items.map((item) => ({
            ...item,
            id: Math.random().toString(36).slice(2),
          }))
        );

        if (response.items.length === 0) {
          addToast("No food items found in receipt", "info");
        }
      } catch {
        addToast("Failed to scan receipt", "error");
      } finally {
        setScanning(false);
      }
    },
    [addToast]
  );

  const SUPPORTED_FORMATS = ["image/png", "image/jpeg", "image/gif", "image/webp"];

  const processFile = async (file: File) => {
    if (!SUPPORTED_FORMATS.includes(file.type)) {
      addToast("Unsupported format. Please use PNG, JPEG, GIF, or WebP.", "error");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      addToast("Image is too large. Maximum size is 10MB.", "error");
      return;
    }

    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    processBase64(base64);
  };

  // When user confirms captured photo, process it
  const handleConfirmPhoto = () => {
    if (camera.capturedImage) {
      processBase64(camera.capturedImage);
      camera.stopCamera();
    }
  };

  const handleOpenCamera = () => {
    setShowCamera(true);
    camera.startCamera();
  };

  const handleCloseCamera = () => {
    camera.stopCamera();
    setShowCamera(false);
  };

  const updateItem = (id: string, field: keyof ScannedItem, value: string | number) => {
    setScannedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const removeItem = (id: string) => {
    setScannedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAddAll = async () => {
    setScanning(true);
    let addedCount = 0;
    try {
      for (const item of scannedItems) {
        await api.post("/myfridge/products", {
          productName: item.name,
          quantity: item.quantity,
          category: item.category,
          unitPrice: item.unitPrice || undefined,
          co2Emission: item.co2Emission,
        });
        addedCount++;
      }
      const points = addedCount * 2;
      addToast(`Added ${addedCount} items to your fridge! +${points} points`, "success");
      onScanned();
    } catch {
      if (addedCount > 0) {
        addToast(
          `Added ${addedCount} of ${scannedItems.length} items. Some failed.`,
          "error"
        );
      } else {
        addToast("Failed to add items", "error");
      }
    } finally {
      setScanning(false);
    }
  };

  // --- Camera View ---
  if (showCamera) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col z-50">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-black/80">
          <h2 className="text-white font-semibold">Take Photo</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCloseCamera}
            className="text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Camera error */}
        {camera.error && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-red-400 mb-4" />
              <p className="text-white mb-4">{camera.error}</p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={handleCloseCamera}
                  className="border-white/30 text-white hover:bg-white/10"
                >
                  Go Back
                </Button>
                <Button
                  onClick={() => {
                    camera.clearError();
                    camera.startCamera();
                  }}
                  className="bg-white text-black hover:bg-gray-200"
                >
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Web: Live webcam preview (video always mounted so ref is available) */}
        {!camera.capturedImage && !camera.error && (
          <>
            <div className="flex-1 flex items-center justify-center bg-black overflow-hidden relative">
              <video
                ref={camera.videoRef}
                autoPlay
                playsInline
                muted
                className="max-w-full max-h-full object-contain"
              />
              {/* Loading overlay */}
              {camera.isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-4" />
                    <p className="text-white">Opening camera...</p>
                  </div>
                </div>
              )}
            </div>
            {camera.isStreaming && (
              <div className="p-6 bg-black/80 flex justify-center">
                <button
                  onClick={camera.capture}
                  className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 transition-colors"
                  aria-label="Take photo"
                />
              </div>
            )}
          </>
        )}

        {/* Preview: Captured image (both native and web) */}
        {camera.capturedImage && (
          <>
            <div className="flex-1 flex items-center justify-center bg-black overflow-hidden p-4">
              <img
                src={camera.capturedImage}
                alt="Captured receipt"
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            </div>
            <div className="p-4 bg-black/80 flex gap-3 justify-center">
              <Button
                onClick={camera.retake}
                className="flex-1 max-w-[160px] bg-white text-black hover:bg-gray-200"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Retake
              </Button>
              <Button
                onClick={handleConfirmPhoto}
                className="flex-1 max-w-[160px] bg-white text-black hover:bg-gray-200"
              >
                <Check className="h-4 w-4 mr-2" />
                Confirm
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // --- Main Modal ---
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md max-h-[80vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Scan Receipt
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scannedItems.length === 0 && !scanning ? (
            <div className="space-y-4">
              {/* Take Photo */}
              <Button
                variant="outline"
                className="w-full h-auto py-4 flex flex-col items-center gap-2"
                onClick={handleOpenCamera}
              >
                <Camera className="h-8 w-8 text-gray-500" />
                <span className="font-medium">Take Photo</span>
                <span className="text-xs text-gray-400">
                  Use your camera to capture a receipt
                </span>
              </Button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>

              {/* Upload File */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer text-center",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-gray-300 hover:border-gray-400"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) processFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-600 font-medium text-sm">
                  {isDragging ? "Drop your receipt here" : "Upload from files"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Drag and drop, or click to browse
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processFile(file);
                }}
                className="hidden"
              />
            </div>
          ) : scanning && scannedItems.length === 0 ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Scanning receipt...</p>
              <p className="text-sm text-gray-400 mt-1">This may take a few moments</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Found {scannedItems.length} items. Review and edit before adding:
              </p>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {scannedItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-gray-50 rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        value={item.name}
                        onChange={(e) => updateItem(item.id, "name", e.target.value)}
                        className="h-8 text-sm font-medium"
                        placeholder="Product name"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Qty</label>
                        <Input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(item.id, "quantity", parseFloat(e.target.value) || 1)
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Unit</label>
                        <select
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                          className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="pcs">pcs</option>
                          <option value="kg">kg</option>
                          <option value="g">g</option>
                          <option value="L">L</option>
                          <option value="ml">ml</option>
                          <option value="pack">pack</option>
                          <option value="bottle">bottle</option>
                          <option value="can">can</option>
                          <option value="loaf">loaf</option>
                          <option value="dozen">dozen</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Price ($)</label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)
                          }
                          className="h-8 text-sm"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Category</label>
                        <select
                          value={item.category}
                          onChange={(e) => updateItem(item.id, "category", e.target.value)}
                          className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="produce">Produce</option>
                          <option value="dairy">Dairy</option>
                          <option value="meat">Meat</option>
                          <option value="bakery">Bakery</option>
                          <option value="frozen">Frozen</option>
                          <option value="beverages">Beverages</option>
                          <option value="pantry">Pantry</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">CO2 (kg)</label>
                        <Input
                          type="number"
                          value={item.co2Emission}
                          readOnly
                          disabled
                          className="h-8 text-sm bg-gray-100"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {scannedItems.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">
                  All items removed. Scan another receipt or close.
                </p>
              )}
              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setScannedItems([])}
                  className="flex-1"
                >
                  Scan Again
                </Button>
                <Button
                  onClick={handleAddAll}
                  disabled={scanning || scannedItems.length === 0}
                  className="flex-1"
                >
                  {scanning ? "Adding..." : `Add ${scannedItems.length} Items`}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type TrackConsumptionStep = "raw-input" | "raw-review" | "waste-input" | "waste-review";

function TrackConsumptionModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const camera = useCamera();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<TrackConsumptionStep>("raw-input");
  const [rawPhoto, setRawPhoto] = useState<string | null>(null);
  const [wastePhoto, setWastePhoto] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<IdentifiedIngredient[]>([]);
  const [disposalMethod, setDisposalMethod] = useState("landfill");
  const [showCamera, setShowCamera] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editableWasteItems, setEditableWasteItems] = useState<Array<{
    id: string;
    productName: string;
    quantity: number;
    category: string;
    co2Emission: number;
  }>>([]);

  const SUPPORTED_FORMATS = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const stepNumber = step === "raw-input" ? 1 : step === "raw-review" ? 2 : step === "waste-input" ? 3 : 4;

  // Guard: waste steps require rawPhoto
  useEffect(() => {
    if ((step === "waste-input" || step === "waste-review") && !rawPhoto) {
      setStep("raw-input");
    }
  }, [step, rawPhoto]);

  const handleClose = () => {
    if (rawPhoto) {
      if (!confirm("Are you sure you want to close? Your progress will be lost.")) return;
    }
    camera.stopCamera();
    onClose();
  };

  const processFile = async (file: File, handler: (base64: string) => void) => {
    if (!SUPPORTED_FORMATS.includes(file.type)) {
      addToast("Unsupported format. Please use PNG, JPEG, GIF, or WebP.", "error");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      addToast("Image is too large. Maximum size is 10MB.", "error");
      return;
    }
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    handler(base64);
  };

  // --- Raw Photo Processing (frontend-only, no backend call) ---
  const processRawPhoto = useCallback(
    (base64: string) => {
      setRawPhoto(base64);
      setShowCamera(false);
      setStep("raw-review");
    },
    []
  );

  // --- Waste Photo Processing (frontend-only, no backend call) ---
  const processWastePhoto = useCallback(
    (base64: string) => {
      setWastePhoto(base64);
      setShowCamera(false);
      setStep("waste-review");
    },
    []
  );

  const handleConfirmPhoto = () => {
    if (!camera.capturedImage) return;
    const handler = step === "raw-input" ? processRawPhoto : processWastePhoto;
    handler(camera.capturedImage);
    camera.stopCamera();
  };

  const handleOpenCamera = () => {
    setShowCamera(true);
    camera.startCamera();
  };

  const handleCloseCamera = () => {
    camera.stopCamera();
    setShowCamera(false);
  };

  const updateIngredient = (id: string, field: keyof IdentifiedIngredient, value: string | number) => {
    setIngredients((prev) =>
      prev.map((ing) => (ing.id === id ? { ...ing, [field]: value } : ing))
    );
  };

  const removeIngredient = (id: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
  };

  const addIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2),
        productId: 0,
        name: "",
        matchedProductName: "",
        estimatedQuantity: 1,
        category: "other",
        unitPrice: 0,
        co2Emission: 0,
        confidence: "low" as const,
      },
    ]);
  };

  const updateWasteItem = (id: string, field: string, value: string | number) => {
    setEditableWasteItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const removeWasteItem = (id: string) => {
    setEditableWasteItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addWasteItem = () => {
    setEditableWasteItems((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2),
        productName: "",
        quantity: 1,
        category: "other",
        co2Emission: 0,
      },
    ]);
  };

  const handleDone = () => {
    addToast("Consumption tracked successfully!", "success");
    onComplete();
    navigate("/");
  };

  // --- Camera View (shared for raw + waste) ---
  if (showCamera) {
    const cameraTitle = step === "raw-input" ? "Photo of Ingredients" : "Photo of Leftovers";
    return (
      <div className="fixed inset-0 bg-black flex flex-col z-50">
        <div className="flex items-center justify-between p-4 bg-black/80">
          <h2 className="text-white font-semibold">{cameraTitle}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCloseCamera}
            className="text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {camera.error && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-red-400 mb-4" />
              <p className="text-white mb-4">{camera.error}</p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={handleCloseCamera}
                  className="border-white/30 text-white hover:bg-white/10"
                >
                  Go Back
                </Button>
                <Button
                  onClick={() => {
                    camera.clearError();
                    camera.startCamera();
                  }}
                  className="bg-white text-black hover:bg-gray-200"
                >
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        )}

        {!camera.capturedImage && !camera.error && (
          <>
            <div className="flex-1 flex items-center justify-center bg-black overflow-hidden relative">
              <video
                ref={camera.videoRef}
                autoPlay
                playsInline
                muted
                className="max-w-full max-h-full object-contain"
              />
              {camera.isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-4" />
                    <p className="text-white">Opening camera...</p>
                  </div>
                </div>
              )}
            </div>
            {camera.isStreaming && (
              <div className="p-6 bg-black/80 flex justify-center">
                <button
                  onClick={camera.capture}
                  className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 transition-colors"
                  aria-label="Take photo"
                />
              </div>
            )}
          </>
        )}

        {camera.capturedImage && (
          <>
            <div className="flex-1 flex items-center justify-center bg-black overflow-hidden p-4">
              <img
                src={camera.capturedImage}
                alt="Captured photo"
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            </div>
            <div className="p-4 bg-black/80 flex gap-3 justify-center">
              <Button
                onClick={camera.retake}
                className="flex-1 max-w-[160px] bg-white text-black hover:bg-gray-200"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Retake
              </Button>
              <Button
                onClick={handleConfirmPhoto}
                className="flex-1 max-w-[160px] bg-white text-black hover:bg-gray-200"
              >
                <Check className="h-4 w-4 mr-2" />
                Confirm
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // --- Step Progress Bar ---
  const StepIndicator = () => (
    <div className="flex items-center gap-2 mt-2">
      {[1, 2, 3, 4].map((s) => (
        <div
          key={s}
          className={cn(
            "h-2 flex-1 rounded-full",
            stepNumber >= s ? "bg-primary" : "bg-gray-200"
          )}
        />
      ))}
    </div>
  );

  // --- Photo Input UI (shared for raw + waste) ---
  const PhotoInputView = ({
    title,
    subtitle,
    cameraLabel,
    onFileProcess,
    backButton,
  }: {
    title: string;
    subtitle: string;
    cameraLabel: string;
    onFileProcess: (base64: string) => void;
    backButton?: React.ReactNode;
  }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md max-h-[80vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            {title}
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </CardTitle>
          <p className="text-sm text-gray-500">{subtitle}</p>
          <StepIndicator />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Button
              variant="outline"
              className="w-full h-auto py-4 flex flex-col items-center gap-2"
              onClick={handleOpenCamera}
            >
              <Camera className="h-8 w-8 text-gray-500" />
              <span className="font-medium">Take Photo</span>
              <span className="text-xs text-gray-400">{cameraLabel}</span>
            </Button>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer text-center",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-gray-300 hover:border-gray-400"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) processFile(file, onFileProcess);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              <p className="text-gray-600 font-medium text-sm">
                {isDragging ? "Drop your photo here" : "Upload from files"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Drag and drop, or click to browse
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processFile(file, onFileProcess);
              }}
              className="hidden"
            />

            {step === "waste-input" && (
              <div className="pt-2">
                <label className="text-xs text-gray-500">Disposal method</label>
                <select
                  value={disposalMethod}
                  onChange={(e) => setDisposalMethod(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="landfill">Landfill</option>
                  <option value="composting">Composting</option>
                  <option value="incineration">Incineration</option>
                  <option value="anaerobic_digestion">Anaerobic Digestion</option>
                  <option value="sewer">Sewer</option>
                </select>
              </div>
            )}

            {backButton}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // --- PAGE 1: Raw Photo Input ---
  if (step === "raw-input") {
    return (
      <PhotoInputView
        title="Track Consumption"
        subtitle="Step 1 of 4 — Capture raw ingredients"
        cameraLabel="Capture your raw ingredients"
        onFileProcess={processRawPhoto}
      />
    );
  }

  // --- PAGE 2: Review Raw Details ---
  if (step === "raw-review") {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-md max-h-[80vh] overflow-y-auto">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Review Ingredients
              <Button variant="ghost" size="icon" onClick={handleClose}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
            <p className="text-sm text-gray-500">Step 2 of 4 — Add your ingredients</p>
            <StepIndicator />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {rawPhoto && (
                <img
                  src={rawPhoto}
                  alt="Raw ingredients"
                  className="w-20 h-20 object-cover rounded-lg"
                />
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {ingredients.length} ingredient{ingredients.length !== 1 ? "s" : ""} added
                </p>
                <Button variant="outline" size="sm" onClick={addIngredient}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {ingredients.map((ing) => (
                  <div key={ing.id} className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        value={ing.name}
                        onChange={(e) => updateIngredient(ing.id, "name", e.target.value)}
                        className="h-8 text-sm font-medium"
                        placeholder="Ingredient name"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeIngredient(ing.id)}
                      >
                        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Qty</label>
                        <Input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={ing.estimatedQuantity}
                          onChange={(e) =>
                            updateIngredient(ing.id, "estimatedQuantity", parseFloat(e.target.value) || 0)
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Category</label>
                        <select
                          value={ing.category}
                          onChange={(e) => updateIngredient(ing.id, "category", e.target.value)}
                          className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="produce">Produce</option>
                          <option value="dairy">Dairy</option>
                          <option value="meat">Meat</option>
                          <option value="bakery">Bakery</option>
                          <option value="frozen">Frozen</option>
                          <option value="beverages">Beverages</option>
                          <option value="pantry">Pantry</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">CO₂ (kg)</label>
                        <Input
                          type="number"
                          value={ing.co2Emission}
                          readOnly
                          disabled
                          className="h-8 text-sm bg-gray-100"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setRawPhoto(null);
                    setIngredients([]);
                    setStep("raw-input");
                  }}
                  className="flex-1"
                >
                  Scan Again
                </Button>
                <Button
                  onClick={() => {
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    setStep("waste-input");
                  }}
                  disabled={ingredients.length === 0}
                  className="flex-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- PAGE 3: Waste Photo Input ---
  if (step === "waste-input") {
    return (
      <PhotoInputView
        title="Capture Leftovers"
        subtitle="Step 3 of 4 — Photo your plate after eating"
        cameraLabel="Capture your plate after eating"
        onFileProcess={processWastePhoto}
        backButton={
          <Button
            variant="ghost"
            onClick={() => setStep("raw-review")}
            className="w-full mt-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to ingredients
          </Button>
        }
      />
    );
  }

  // --- PAGE 4: Review Waste Details ---
  if (step === "waste-review") {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-md max-h-[80vh] overflow-y-auto">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Review Waste Details
              <Button variant="ghost" size="icon" onClick={handleClose}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
            <p className="text-sm text-gray-500">Step 4 of 4 — Add waste items</p>
            <StepIndicator />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {wastePhoto && (
                <img
                  src={wastePhoto}
                  alt="Waste photo"
                  className="w-20 h-20 object-cover rounded-lg"
                />
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {editableWasteItems.length} waste item{editableWasteItems.length !== 1 ? "s" : ""} added
                </p>
                <Button variant="outline" size="sm" onClick={addWasteItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {editableWasteItems.map((item) => (
                  <div key={item.id} className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        value={item.productName}
                        onChange={(e) => updateWasteItem(item.id, "productName", e.target.value)}
                        className="h-8 text-sm font-medium"
                        placeholder="Product name"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeWasteItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Qty</label>
                        <Input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateWasteItem(item.id, "quantity", parseFloat(e.target.value) || 0)
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Category</label>
                        <select
                          value={item.category}
                          onChange={(e) => updateWasteItem(item.id, "category", e.target.value)}
                          className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="produce">Produce</option>
                          <option value="dairy">Dairy</option>
                          <option value="meat">Meat</option>
                          <option value="bakery">Bakery</option>
                          <option value="frozen">Frozen</option>
                          <option value="beverages">Beverages</option>
                          <option value="pantry">Pantry</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">CO₂ (kg)</label>
                        <Input
                          type="number"
                          value={item.co2Emission}
                          readOnly
                          disabled
                          className="h-8 text-sm bg-gray-100"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {editableWasteItems.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">
                  No waste items detected.
                </p>
              )}

              <Button onClick={handleDone} className="w-full">
                <Check className="h-4 w-4 mr-2" />
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
