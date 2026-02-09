import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import VendingMachinePage from "./VendingMachinePage";

// Define mock locations first (before vi.mock due to hoisting)
const MOCK_LOCATIONS = [
  {
    id: "1",
    name: "NUS Central Library",
    address: "12 Kent Ridge Crescent",
    lat: 1.2966,
    lng: 103.7764,
    itemCount: 15,
  },
  {
    id: "2",
    name: "Raffles Place MRT",
    address: "5 Raffles Place",
    lat: 1.2840,
    lng: 103.8514,
    itemCount: 20,
  },
  {
    id: "3",
    name: "Orchard Gateway",
    address: "277 Orchard Road",
    lat: 1.3005,
    lng: 103.8394,
    itemCount: 12,
  },
];

// Mock the VendingMachine component
vi.mock("../components/VendingMachine", () => ({
  VendingMachine: () => <div data-testid="vending-machine">Vending Machine Component</div>,
}));

// Mock the VendingMap component
vi.mock("../components/VendingMachine/VendingMap", () => {
  const locations = [
    {
      id: "1",
      name: "NUS Central Library",
      address: "12 Kent Ridge Crescent",
      lat: 1.2966,
      lng: 103.7764,
      itemCount: 15,
    },
    {
      id: "2",
      name: "Raffles Place MRT",
      address: "5 Raffles Place",
      lat: 1.2840,
      lng: 103.8514,
      itemCount: 20,
    },
    {
      id: "3",
      name: "Orchard Gateway",
      address: "277 Orchard Road",
      lat: 1.3005,
      lng: 103.8394,
      itemCount: 12,
    },
  ];

  return {
    VendingMap: ({ onSelectLocation }: { onSelectLocation: (location: any) => void }) => (
      <div data-testid="vending-map">
        {locations.map((loc) => (
          <button
            key={loc.id}
            data-testid={`map-marker-${loc.id}`}
            onClick={() => onSelectLocation(loc)}
          >
            {loc.name}
          </button>
        ))}
      </div>
    ),
    SINGAPORE_VENDING_LOCATIONS: locations,
  };
});

function renderWithProviders(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("VendingMachinePage - Map View", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render page title", () => {
    renderWithProviders(<VendingMachinePage />);
    expect(screen.getByText("EcoPlate Vending Machines")).toBeInTheDocument();
  });

  it("should display page subtitle", () => {
    renderWithProviders(<VendingMachinePage />);
    expect(screen.getByText("Find a vending machine near you in Singapore")).toBeInTheDocument();
  });

  it("should display location count stat", () => {
    renderWithProviders(<VendingMachinePage />);
    expect(screen.getByText("Locations")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("should display total items stat", () => {
    renderWithProviders(<VendingMachinePage />);
    expect(screen.getByText("Total Items")).toBeInTheDocument();
    expect(screen.getByText("47")).toBeInTheDocument();
  });

  it("should display 24/7 availability stat", () => {
    renderWithProviders(<VendingMachinePage />);
    expect(screen.getByText("24/7")).toBeInTheDocument();
    expect(screen.getByText("Availability")).toBeInTheDocument();
  });

  it("should display Eco Friendly stat", () => {
    renderWithProviders(<VendingMachinePage />);
    expect(screen.getByText("Eco")).toBeInTheDocument();
    expect(screen.getByText("Friendly")).toBeInTheDocument();
  });

  it("should display the map component", () => {
    renderWithProviders(<VendingMachinePage />);
    expect(screen.getByTestId("vending-map")).toBeInTheDocument();
  });

  it("should display All Locations heading", () => {
    renderWithProviders(<VendingMachinePage />);
    expect(screen.getByText("All Locations")).toBeInTheDocument();
  });

  it("should display location names in list", () => {
    renderWithProviders(<VendingMachinePage />);
    // Each location appears twice (once in map mock, once in list)
    expect(screen.getAllByText("NUS Central Library").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Raffles Place MRT").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Orchard Gateway").length).toBeGreaterThan(0);
  });

  it("should display location addresses in list", () => {
    renderWithProviders(<VendingMachinePage />);
    expect(screen.getByText("12 Kent Ridge Crescent")).toBeInTheDocument();
    expect(screen.getByText("5 Raffles Place")).toBeInTheDocument();
    expect(screen.getByText("277 Orchard Road")).toBeInTheDocument();
  });

  it("should display item counts for each location", () => {
    renderWithProviders(<VendingMachinePage />);
    expect(screen.getByText("15 items")).toBeInTheDocument();
    expect(screen.getByText("20 items")).toBeInTheDocument();
    expect(screen.getByText("12 items")).toBeInTheDocument();
  });

  it("should display Available label for locations", () => {
    renderWithProviders(<VendingMachinePage />);
    const availableLabels = screen.getAllByText("Available");
    expect(availableLabels.length).toBe(3);
  });
});

describe("VendingMachinePage - Location Selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show vending machine when location selected from map", () => {
    renderWithProviders(<VendingMachinePage />);

    fireEvent.click(screen.getByTestId("map-marker-1"));

    expect(screen.getByTestId("vending-machine")).toBeInTheDocument();
    expect(screen.getByText("NUS Central Library")).toBeInTheDocument();
    expect(screen.getByText("12 Kent Ridge Crescent")).toBeInTheDocument();
  });

  it("should show Back to Map button when location selected", () => {
    renderWithProviders(<VendingMachinePage />);

    fireEvent.click(screen.getByTestId("map-marker-1"));

    expect(screen.getByText("Back to Map")).toBeInTheDocument();
  });

  it("should return to map view when Back to Map clicked", () => {
    renderWithProviders(<VendingMachinePage />);

    // Select a location
    fireEvent.click(screen.getByTestId("map-marker-1"));
    expect(screen.getByTestId("vending-machine")).toBeInTheDocument();

    // Click back
    fireEvent.click(screen.getByText("Back to Map"));

    // Should see map view again
    expect(screen.getByText("EcoPlate Vending Machines")).toBeInTheDocument();
    expect(screen.getByTestId("vending-map")).toBeInTheDocument();
  });

  it("should show different location when different location selected", () => {
    renderWithProviders(<VendingMachinePage />);

    fireEvent.click(screen.getByTestId("map-marker-2"));

    expect(screen.getByText("Raffles Place MRT")).toBeInTheDocument();
    expect(screen.getByText("5 Raffles Place")).toBeInTheDocument();
  });
});

describe("VendingMachinePage - Location List Interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have clickable location items in list", () => {
    renderWithProviders(<VendingMachinePage />);

    const locationButtons = screen.getAllByRole("button");
    // Filter to get only location buttons (not map markers)
    const listButtons = locationButtons.filter(
      (btn) => btn.textContent?.includes("items")
    );
    expect(listButtons.length).toBeGreaterThan(0);
  });
});
