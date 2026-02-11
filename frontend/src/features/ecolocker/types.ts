export interface Locker {
  id: number;
  name: string;
  address: string;
  coordinates: string;
  totalCompartments: number;
  availableCompartments: number;
  operatingHours?: string | null;
  status: string;
  distance?: number;
}

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "pickup_scheduled"
  | "in_transit"
  | "ready_for_pickup"
  | "collected"
  | "cancelled"
  | "expired";

export interface LockerOrder {
  id: number;
  listingId: number;
  lockerId: number;
  buyerId: number;
  sellerId: number;
  itemPrice: number;
  deliveryFee: number;
  totalPrice: number;
  status: OrderStatus;
  reservedAt: string;
  paymentDeadline?: string | null;
  paidAt?: string | null;
  pickupScheduledAt?: string | null;
  riderPickedUpAt?: string | null;
  deliveredAt?: string | null;
  pickedUpAt?: string | null;
  expiresAt?: string | null;
  pickupPin?: string | null;
  compartmentNumber?: number | null;
  cancelReason?: string | null;
  locker?: Locker;
  listing?: {
    id: number;
    title: string;
    description?: string | null;
    price?: number | null;
    status: string;
  };
  buyer?: { id: number; name: string; avatarUrl?: string };
  seller?: { id: number; name: string; avatarUrl?: string };
}

export interface LockerNotification {
  id: number;
  userId: number;
  orderId: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  order?: LockerOrder;
}
