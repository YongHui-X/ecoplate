import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Eye,
  MessageCircle,
  Send,
  DollarSign,
} from "lucide-react";
import { formatDate, getDaysUntilExpiry } from "../lib/utils";

interface Listing {
  id: number;
  sellerId: number;
  title: string;
  description: string | null;
  category: string | null;
  quantity: number;
  unit: string;
  price: number | null;
  originalPrice: number | null;
  expiryDate: string | null;
  pickupLocation: string | null;
  pickupInstructions: string | null;
  status: string;
  viewCount: number;
  createdAt: string;
  seller: {
    id: number;
    name: string;
    avatarUrl: string | null;
  };
  images: Array<{ id: number; imageUrl: string }>;
}

interface Message {
  id: number;
  content: string;
  senderId: number;
  createdAt: string;
  sender: {
    id: number;
    name: string;
  };
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadListing();
  }, [id]);

  const loadListing = async () => {
    try {
      const data = await api.get<Listing>(`/marketplace/listings/${id}`);
      setListing(data);
    } catch (error) {
      addToast("Failed to load listing", "error");
      navigate("/marketplace");
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    try {
      const data = await api.get<Message[]>(`/marketplace/listings/${id}/messages`);
      setMessages(data.reverse());
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    setSendingMessage(true);
    try {
      await api.post(`/marketplace/listings/${id}/messages`, {
        content: newMessage,
      });
      setNewMessage("");
      loadMessages();
    } catch (error) {
      addToast("Failed to send message", "error");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleReserve = async () => {
    try {
      await api.post(`/marketplace/listings/${id}/reserve`);
      addToast("Listing reserved!", "success");
      loadListing();
    } catch (error) {
      addToast("Failed to reserve listing", "error");
    }
  };

  const handleMarkSold = async () => {
    try {
      await api.post(`/marketplace/listings/${id}/sold`);
      addToast("Listing marked as sold!", "success");
      loadListing();
    } catch (error) {
      addToast("Failed to mark as sold", "error");
    }
  };

  const handleGetPriceRecommendation = async () => {
    try {
      const result = await api.post<{
        recommendedPrice: number;
        reasoning: string;
      }>(`/marketplace/listings/${id}/price-recommendation`);
      addToast(
        `Recommended price: $${result.recommendedPrice}. ${result.reasoning}`,
        "info"
      );
    } catch (error) {
      addToast("Failed to get price recommendation", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!listing) {
    return null;
  }

  const isOwner = user?.id === listing.sellerId;
  const daysUntil = getDaysUntilExpiry(listing.expiryDate);
  const discount =
    listing.originalPrice && listing.price
      ? Math.round((1 - listing.price / listing.originalPrice) * 100)
      : null;

  return (
    <div className="max-w-4xl mx-auto">
      <Button
        variant="ghost"
        className="mb-4"
        onClick={() => navigate("/marketplace")}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Marketplace
      </Button>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Image */}
        <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
          {listing.images[0] ? (
            <img
              src={listing.images[0].imageUrl}
              alt={listing.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              No image
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-2xl font-bold">{listing.title}</h1>
              <Badge
                variant={
                  listing.status === "active"
                    ? "success"
                    : listing.status === "reserved"
                    ? "warning"
                    : "secondary"
                }
              >
                {listing.status}
              </Badge>
            </div>

            {listing.category && (
              <Badge variant="secondary" className="mt-2">
                {listing.category}
              </Badge>
            )}
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-3">
            {listing.price === null || listing.price === 0 ? (
              <span className="text-3xl font-bold text-green-600">Free</span>
            ) : (
              <>
                <span className="text-3xl font-bold">${listing.price}</span>
                {listing.originalPrice && (
                  <>
                    <span className="text-lg text-gray-400 line-through">
                      ${listing.originalPrice}
                    </span>
                    {discount && (
                      <Badge className="bg-red-500">-{discount}%</Badge>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Info */}
          <div className="space-y-2 text-gray-600">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {daysUntil !== null ? (
                daysUntil < 0 ? (
                  <span className="text-red-600">
                    Expired {Math.abs(daysUntil)} days ago
                  </span>
                ) : daysUntil === 0 ? (
                  <span className="text-yellow-600">Expires today</span>
                ) : (
                  <span>Expires in {daysUntil} days</span>
                )
              ) : (
                <span>No expiry date set</span>
              )}
            </div>

            {listing.pickupLocation && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{listing.pickupLocation}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>{listing.viewCount} views</span>
            </div>

            <p>
              <strong>Quantity:</strong> {listing.quantity} {listing.unit}
            </p>
          </div>

          {listing.description && (
            <div>
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-gray-600">{listing.description}</p>
            </div>
          )}

          {listing.pickupInstructions && (
            <div>
              <h3 className="font-semibold mb-2">Pickup Instructions</h3>
              <p className="text-gray-600">{listing.pickupInstructions}</p>
            </div>
          )}

          {/* Seller */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
              {listing.seller.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium">{listing.seller.name}</p>
              <p className="text-sm text-gray-500">Seller</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {isOwner ? (
              <>
                {listing.status === "active" && (
                  <Button
                    variant="outline"
                    onClick={handleGetPriceRecommendation}
                    className="flex-1"
                  >
                    <DollarSign className="h-4 w-4 mr-2" />
                    Get Price Recommendation
                  </Button>
                )}
                {(listing.status === "active" || listing.status === "reserved") && (
                  <Button onClick={handleMarkSold} className="flex-1">
                    Mark as Sold
                  </Button>
                )}
              </>
            ) : (
              <>
                {listing.status === "active" && (
                  <Button onClick={handleReserve} className="flex-1">
                    Reserve
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowMessages(true);
                    loadMessages();
                  }}
                  className="flex-1"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Message Seller
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Messages Modal */}
      {showMessages && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md max-h-[80vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Messages</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowMessages(false)}>
                &times;
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-3 min-h-[200px]">
              {messages.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No messages yet. Start the conversation!
                </p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3 rounded-lg ${
                      msg.senderId === user?.id
                        ? "bg-primary/10 ml-8"
                        : "bg-gray-100 mr-8"
                    }`}
                  >
                    <p className="text-sm font-medium">{msg.sender.name}</p>
                    <p>{msg.content}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDate(msg.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
            <div className="p-4 border-t flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <Button onClick={handleSendMessage} disabled={sendingMessage}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
