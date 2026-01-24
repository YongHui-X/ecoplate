import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Badge } from "../components/ui/badge";
import { Refrigerator, Store, Trophy, AlertTriangle, TrendingUp, Leaf } from "lucide-react";
import { formatDate, getDaysUntilExpiry, getExpiryStatus } from "../lib/utils";

interface DashboardData {
  products: {
    total: number;
    expiringToday: number;
    expiringSoon: number;
  };
  listings: {
    active: number;
    sold: number;
  };
  gamification: {
    points: number;
    streak: number;
    wasteReductionRate: number;
    co2Saved: number;
  };
  expiringProducts: Array<{
    id: number;
    name: string;
    expiryDate: string;
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await api.get<DashboardData>("/gamification/dashboard");
      setData(response);
    } catch (error) {
      console.error("Failed to load dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-600">Your sustainability overview</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fridge Items</CardTitle>
            <Refrigerator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.products.total || 0}</div>
            {(data?.products.expiringSoon || 0) > 0 && (
              <p className="text-xs text-yellow-600">
                {data?.products.expiringSoon} expiring soon
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Listings</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.listings.active || 0}</div>
            <p className="text-xs text-muted-foreground">
              {data?.listings.sold || 0} sold total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Eco Points</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.gamification.points || 0}</div>
            <p className="text-xs text-muted-foreground">
              {data?.gamification.streak || 0} day streak
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">CO2 Saved</CardTitle>
            <Leaf className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(data?.gamification.co2Saved || 0).toFixed(1)} kg
            </div>
            <p className="text-xs text-green-600">
              <TrendingUp className="inline h-3 w-3" /> Helping the planet
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Waste Reduction Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Waste Reduction Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Current rate</span>
              <span className="font-medium">
                {(data?.gamification.wasteReductionRate || 0).toFixed(0)}%
              </span>
            </div>
            <Progress value={data?.gamification.wasteReductionRate || 0} />
            <p className="text-xs text-muted-foreground">
              Items consumed vs. items wasted
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Expiring Soon */}
      {(data?.expiringProducts?.length || 0) > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <CardTitle className="text-lg">Expiring Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.expiringProducts.slice(0, 5).map((product) => {
                const days = getDaysUntilExpiry(product.expiryDate);
                const status = getExpiryStatus(product.expiryDate);
                return (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-gray-50"
                  >
                    <span className="font-medium">{product.name}</span>
                    <Badge
                      variant={
                        status === "expired"
                          ? "destructive"
                          : status === "expiring-soon"
                          ? "warning"
                          : "success"
                      }
                    >
                      {days !== null && days < 0
                        ? "Expired"
                        : days === 0
                        ? "Today"
                        : `${days} days`}
                    </Badge>
                  </div>
                );
              })}
            </div>
            <Button variant="outline" className="w-full mt-4" asChild>
              <Link to="/myfridge">View all items</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <Link to="/myfridge">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Refrigerator className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Manage Fridge</h3>
                <p className="text-sm text-muted-foreground">
                  Add items or scan receipts
                </p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <Link to="/marketplace/create">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Store className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Share Food</h3>
                <p className="text-sm text-muted-foreground">
                  List items on marketplace
                </p>
              </div>
            </CardContent>
          </Link>
        </Card>
      </div>
    </div>
  );
}
