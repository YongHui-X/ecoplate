import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ListingDetailPage from "./ListingDetailPage";
import { ToastProvider } from "../contexts/ToastContext";
import { AuthProvider } from "../contexts/AuthContext";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(() => "mock-token"),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: mockLocalStorage });

// Mock window.confirm
vi.spyOn(window, "confirm").mockImplementation(() => true);

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock services
vi.mock("../services/marketplace", () => ({
  marketplaceService: {
    getListing: vi.fn(() =>
      Promise.resolve({
        id: 1,
        title: "Fresh Organic Apples",
        description: "Delicious organic apples from local farm",
        category: "produce",
        quantity: 5,
        unit: "kg",
        price: 8.0,
        originalPrice: 12.0,
        expiryDate: new Date(Date.now() + 86400000 * 3).toISOString(),
        pickupLocation: "123 Main St",
        images: "image1.jpg,image2.jpg",
        co2Saved: 2.5,
        status: "active",
        sellerId: 2,
        seller: { id: 2, name: "John Seller" },
        createdAt: new Date().toISOString(),
      })
    ),
    deleteListing: vi.fn(() => Promise.resolve()),
    completeListing: vi.fn(() =>
      Promise.resolve({ points: { earned: 50 } })
    ),
    getInterestedBuyers: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock("../services/messages", () => ({
  messageService: {
    getOrCreateConversationForListing: vi.fn(() =>
      Promise.resolve({ id: 1 })
    ),
  },
}));

vi.mock("../services/upload", () => ({
  uploadService: {
    getListingImageUrls: vi.fn((images: string | null) => {
      if (!images) return [];
      return images.split(",").map((img: string) => `/uploads/${img}`);
    }),
  },
}));

// Mock AuthContext
vi.mock("../contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { id: 1, name: "Test User", email: "test@example.com" },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={["/marketplace/1"]}>
      <ToastProvider>
        <Routes>
          <Route path="/marketplace/:id" element={ui} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("ListingDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ id: 1, name: "Test User", email: "test@example.com" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it("should show loading state initially", () => {
    renderWithProviders(<ListingDetailPage />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("should display Back to Marketplace button", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Back to Marketplace")).toBeInTheDocument();
    });
  });

  it("should display listing title", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Fresh Organic Apples")).toBeInTheDocument();
    });
  });

  it("should display listing price", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("$8.00")).toBeInTheDocument();
    });
  });

  it("should display original price with strikethrough", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("$12.00")).toBeInTheDocument();
    });
  });

  it("should display discount badge", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("-33%")).toBeInTheDocument();
    });
  });

  it("should display status badge", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("active")).toBeInTheDocument();
    });
  });

  it("should display category badge", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Produce")).toBeInTheDocument();
    });
  });

  it("should display listing description", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Delicious organic apples from local farm")).toBeInTheDocument();
    });
  });

  it("should display pickup location", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("123 Main St")).toBeInTheDocument();
    });
  });

  it("should display seller name", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("John Seller")).toBeInTheDocument();
    });
  });

  it("should display Seller label", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Seller")).toBeInTheDocument();
    });
  });

  it("should display Environmental Impact section", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Environmental Impact")).toBeInTheDocument();
    });
  });

  it("should display Description heading", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Description")).toBeInTheDocument();
    });
  });

  it("should navigate back when Back to Marketplace clicked", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Back to Marketplace")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Back to Marketplace"));
    expect(mockNavigate).toHaveBeenCalledWith("/marketplace");
  });
});

describe("ListingDetailPage - Buyer View", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ id: 1, name: "Test User", email: "test@example.com" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it("should display Buy button for non-owners", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Buy")).toBeInTheDocument();
    });
  });

  it("should display Message Seller button for non-owners", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Message Seller")).toBeInTheDocument();
    });
  });

  it("should display EcoLocker Delivery button", async () => {
    renderWithProviders(<ListingDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Use EcoLocker Delivery")).toBeInTheDocument();
    });
  });
});
