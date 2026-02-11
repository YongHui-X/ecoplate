import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Icon } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface VendingLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  itemCount: number;
}

// Singapore vending machine locations
export const SINGAPORE_VENDING_LOCATIONS: VendingLocation[] = [
  {
    id: "vm-1",
    name: "Orchard MRT Station",
    address: "Orchard Road, Singapore 238897",
    lat: 1.3044,
    lng: 103.8318,
    itemCount: 15,
  },
  {
    id: "vm-2",
    name: "Marina Bay Sands",
    address: "10 Bayfront Ave, Singapore 018956",
    lat: 1.2834,
    lng: 103.8607,
    itemCount: 20,
  },
  {
    id: "vm-3",
    name: "Changi Airport T3",
    address: "65 Airport Boulevard, Singapore 819663",
    lat: 1.3574,
    lng: 103.9884,
    itemCount: 25,
  },
  {
    id: "vm-4",
    name: "Jurong East MRT",
    address: "10 Jurong East Street 12, Singapore 609690",
    lat: 1.3329,
    lng: 103.7422,
    itemCount: 12,
  },
  {
    id: "vm-5",
    name: "Tampines Hub",
    address: "1 Tampines Walk, Singapore 528523",
    lat: 1.3531,
    lng: 103.9456,
    itemCount: 18,
  },
  {
    id: "vm-6",
    name: "Raffles Place MRT",
    address: "5 Raffles Place, Singapore 048618",
    lat: 1.2839,
    lng: 103.8515,
    itemCount: 22,
  },
  {
    id: "vm-7",
    name: "Sentosa Gateway",
    address: "8 Sentosa Gateway, Singapore 098269",
    lat: 1.2540,
    lng: 103.8238,
    itemCount: 10,
  },
  {
    id: "vm-8",
    name: "Woodlands MRT",
    address: "30 Woodlands Ave 2, Singapore 738343",
    lat: 1.4369,
    lng: 103.7866,
    itemCount: 14,
  },
];

// Custom vending machine icon
const vendingIcon = new Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#166534"/>
      <rect x="5" y="5" width="5" height="4" fill="#4ade80"/>
      <rect x="14" y="5" width="5" height="4" fill="#4ade80"/>
      <rect x="5" y="11" width="5" height="4" fill="#4ade80"/>
      <rect x="14" y="11" width="5" height="4" fill="#4ade80"/>
      <rect x="8" y="17" width="8" height="3" fill="#fbbf24"/>
    </svg>
  `),
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

interface VendingMapProps {
  onSelectLocation: (location: VendingLocation) => void;
}

export function VendingMap({ onSelectLocation }: VendingMapProps) {
  // Singapore center coordinates
  const singaporeCenter: [number, number] = [1.3521, 103.8198];

  return (
    <div className="h-[300px] sm:h-[400px] lg:h-[500px] w-full rounded-xl overflow-hidden border-2 border-gray-200 shadow-lg">
      <MapContainer
        center={singaporeCenter}
        zoom={11}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {SINGAPORE_VENDING_LOCATIONS.map((location) => (
          <Marker
            key={location.id}
            position={[location.lat, location.lng]}
            icon={vendingIcon}
          >
            <Popup>
              <div className="p-1">
                <h3 className="font-bold text-gray-900">{location.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{location.address}</p>
                <p className="text-sm text-green-600 font-medium mt-1">
                  {location.itemCount} items available
                </p>
                <button
                  onClick={() => onSelectLocation(location)}
                  className="mt-2 w-full px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  Open Machine
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
