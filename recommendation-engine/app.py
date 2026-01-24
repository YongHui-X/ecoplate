# Recommendation Engine for EcoPlate
# Flask API for buyer/seller matching and notifications

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any
import os

app = Flask(__name__)
CORS(app)

# ============================================================================
# Recommendation Models
# ============================================================================

class ExpiryUrgencyScorer:
    """Calculate urgency score based on days until expiry"""
    
    @staticmethod
    def calculate(expiry_date: str) -> float:
        """
        Returns urgency score 0-1 (1 = most urgent)
        Items expiring sooner get higher scores
        """
        if not expiry_date:
            return 0.5
        
        expiry = datetime.fromisoformat(expiry_date.replace('Z', '+00:00'))
        now = datetime.now(expiry.tzinfo) if expiry.tzinfo else datetime.now()
        days_until_expiry = (expiry - now).days
        
        if days_until_expiry <= 0:
            return 1.0  # Already expired - highest urgency
        elif days_until_expiry <= 1:
            return 0.95
        elif days_until_expiry <= 3:
            return 0.8
        elif days_until_expiry <= 7:
            return 0.5
        elif days_until_expiry <= 14:
            return 0.3
        else:
            return 0.1


class PriceRecommender:
    """Recommend optimal selling price based on freshness and market data"""
    
    @staticmethod
    def calculate(original_price: float, expiry_date: str, category: str) -> Dict[str, Any]:
        """
        Calculate recommended price based on:
        - Days until expiry (freshness discount)
        - Product category (perishability)
        - Market demand (simplified)
        """
        urgency = ExpiryUrgencyScorer.calculate(expiry_date)
        
        # Category-based perishability multiplier
        perishability = {
            'dairy': 0.9,
            'meat': 0.85,
            'seafood': 0.8,
            'produce': 0.85,
            'bakery': 0.9,
            'frozen': 0.95,
            'canned': 0.98,
            'beverages': 0.95,
            'snacks': 0.95,
            'other': 0.9
        }.get(category.lower() if category else 'other', 0.9)
        
        # Calculate discount based on urgency
        # Higher urgency = higher discount
        base_discount = urgency * 0.6  # Max 60% discount
        category_adjustment = (1 - perishability) * 0.2
        
        total_discount = min(base_discount + category_adjustment, 0.7)  # Cap at 70% off
        
        recommended_price = original_price * (1 - total_discount)
        min_price = original_price * 0.3  # Floor at 30% of original
        max_price = original_price * (1 - (total_discount * 0.5))  # More conservative max
        
        return {
            'recommended_price': round(max(recommended_price, min_price), 2),
            'min_price': round(min_price, 2),
            'max_price': round(max_price, 2),
            'discount_percentage': round(total_discount * 100, 1),
            'urgency_score': round(urgency, 2),
            'reasoning': _get_price_reasoning(urgency, category)
        }


def _get_price_reasoning(urgency: float, category: str) -> str:
    """Generate human-readable pricing reasoning"""
    if urgency >= 0.9:
        return f"Price reduced significantly - {category} item expiring very soon. Quick sale recommended."
    elif urgency >= 0.7:
        return f"Moderate discount applied - {category} item expiring within 3 days."
    elif urgency >= 0.4:
        return f"Light discount - {category} item has about a week of freshness remaining."
    else:
        return f"Minimal discount - {category} item still has good shelf life."


class BuyerMatcher:
    """Match listings with potential buyers based on preferences"""
    
    @staticmethod
    def score_match(listing: Dict, buyer_preferences: Dict) -> float:
        """
        Calculate match score between a listing and buyer preferences
        Returns score 0-1 (1 = perfect match)
        """
        score = 0.0
        weights = {
            'category': 0.3,
            'price': 0.25,
            'distance': 0.25,
            'freshness': 0.2
        }
        
        # Category match
        if buyer_preferences.get('preferred_categories'):
            if listing.get('category', '').lower() in [c.lower() for c in buyer_preferences['preferred_categories']]:
                score += weights['category']
        else:
            score += weights['category'] * 0.5  # Neutral if no preference
        
        # Price match
        max_price = buyer_preferences.get('max_price')
        if max_price and listing.get('price'):
            if listing['price'] <= max_price:
                # Better score for bigger savings
                price_ratio = listing['price'] / max_price
                score += weights['price'] * (1 - price_ratio + 0.5)
            # No score if over budget
        else:
            score += weights['price'] * 0.5
        
        # Distance match (simplified - assumes distance in km is provided)
        max_distance = buyer_preferences.get('max_distance_km', 10)
        listing_distance = listing.get('distance_km', 5)
        if listing_distance <= max_distance:
            distance_score = 1 - (listing_distance / max_distance)
            score += weights['distance'] * distance_score
        
        # Freshness preference
        min_days = buyer_preferences.get('min_days_until_expiry', 0)
        if listing.get('expiry_date'):
            expiry = datetime.fromisoformat(listing['expiry_date'].replace('Z', '+00:00'))
            now = datetime.now(expiry.tzinfo) if expiry.tzinfo else datetime.now()
            days_remaining = (expiry - now).days
            
            if days_remaining >= min_days:
                freshness_score = min(days_remaining / 7, 1)  # Normalize to week
                score += weights['freshness'] * freshness_score
        
        return min(score, 1.0)


class SellerNotificationEngine:
    """Generate notifications for sellers about their inventory"""
    
    @staticmethod
    def analyze_inventory(products: List[Dict]) -> List[Dict]:
        """
        Analyze seller's inventory and generate actionable notifications
        """
        notifications = []
        
        for product in products:
            urgency = ExpiryUrgencyScorer.calculate(product.get('expiry_date'))
            
            if urgency >= 0.9:
                notifications.append({
                    'type': 'critical_expiry',
                    'priority': 'high',
                    'product_id': product.get('product_id'),
                    'product_name': product.get('product_name'),
                    'message': f"⚠️ {product.get('product_name')} expires today/tomorrow! List now at 50%+ discount.",
                    'action': 'list_urgent',
                    'suggested_discount': 50
                })
            elif urgency >= 0.7:
                notifications.append({
                    'type': 'expiring_soon',
                    'priority': 'medium',
                    'product_id': product.get('product_id'),
                    'product_name': product.get('product_name'),
                    'message': f"🕐 {product.get('product_name')} expires in 2-3 days. Consider listing on marketplace.",
                    'action': 'list_soon',
                    'suggested_discount': 30
                })
            elif urgency >= 0.5:
                notifications.append({
                    'type': 'plan_ahead',
                    'priority': 'low',
                    'product_id': product.get('product_id'),
                    'product_name': product.get('product_name'),
                    'message': f"📅 {product.get('product_name')} expires within a week. Plan to use or sell.",
                    'action': 'plan',
                    'suggested_discount': 15
                })
        
        # Sort by priority
        priority_order = {'high': 0, 'medium': 1, 'low': 2}
        notifications.sort(key=lambda x: priority_order.get(x['priority'], 3))
        
        return notifications


class BuyerNotificationEngine:
    """Generate notifications for buyers about matching listings"""
    
    @staticmethod
    def find_matches(buyer_preferences: Dict, listings: List[Dict], limit: int = 10) -> List[Dict]:
        """
        Find and rank listings that match buyer preferences
        """
        matches = []
        
        for listing in listings:
            score = BuyerMatcher.score_match(listing, buyer_preferences)
            
            if score >= 0.3:  # Minimum threshold
                matches.append({
                    'listing': listing,
                    'match_score': round(score, 2),
                    'notification': _generate_buyer_notification(listing, score)
                })
        
        # Sort by match score descending
        matches.sort(key=lambda x: x['match_score'], reverse=True)
        
        return matches[:limit]


def _generate_buyer_notification(listing: Dict, score: float) -> Dict:
    """Generate notification message for buyer"""
    urgency = ExpiryUrgencyScorer.calculate(listing.get('expiry_date'))
    
    if score >= 0.8:
        message = f"🎯 Perfect match! {listing.get('title')} at great price."
    elif score >= 0.6:
        message = f"👍 Good deal: {listing.get('title')} matches your preferences."
    else:
        message = f"💡 You might like: {listing.get('title')}"
    
    if urgency >= 0.8:
        message += " Act fast - expiring soon!"
    
    return {
        'type': 'match_found',
        'priority': 'high' if score >= 0.7 else 'medium',
        'message': message,
        'listing_id': listing.get('listing_id')
    }


# ============================================================================
# API Routes
# ============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'service': 'recommendation-engine'})


@app.route('/api/v1/recommendations/price', methods=['POST'])
def get_price_recommendation():
    """
    Get recommended selling price for a product
    
    Request body:
    {
        "original_price": 10.00,
        "expiry_date": "2026-01-28",
        "category": "dairy"
    }
    """
    data = request.get_json()
    
    if not data.get('original_price'):
        return jsonify({'error': 'original_price is required'}), 400
    
    recommendation = PriceRecommender.calculate(
        original_price=float(data['original_price']),
        expiry_date=data.get('expiry_date'),
        category=data.get('category', 'other')
    )
    
    return jsonify(recommendation)


@app.route('/api/v1/recommendations/seller/notifications', methods=['POST'])
def get_seller_notifications():
    """
    Analyze seller's inventory and return notifications
    
    Request body:
    {
        "products": [
            {
                "product_id": "uuid",
                "product_name": "Milk",
                "expiry_date": "2026-01-26",
                "category": "dairy"
            }
        ]
    }
    """
    data = request.get_json()
    
    if not data.get('products'):
        return jsonify({'error': 'products array is required'}), 400
    
    notifications = SellerNotificationEngine.analyze_inventory(data['products'])
    
    return jsonify({
        'notifications': notifications,
        'count': len(notifications),
        'generated_at': datetime.utcnow().isoformat()
    })


@app.route('/api/v1/recommendations/buyer/matches', methods=['POST'])
def get_buyer_matches():
    """
    Find listings matching buyer preferences
    
    Request body:
    {
        "preferences": {
            "preferred_categories": ["dairy", "produce"],
            "max_price": 15.00,
            "max_distance_km": 5,
            "min_days_until_expiry": 2
        },
        "listings": [
            {
                "listing_id": "uuid",
                "title": "Fresh Milk",
                "price": 8.00,
                "category": "dairy",
                "expiry_date": "2026-01-28",
                "distance_km": 2.5
            }
        ]
    }
    """
    data = request.get_json()
    
    if not data.get('preferences') or not data.get('listings'):
        return jsonify({'error': 'preferences and listings are required'}), 400
    
    matches = BuyerNotificationEngine.find_matches(
        buyer_preferences=data['preferences'],
        listings=data['listings'],
        limit=data.get('limit', 10)
    )
    
    return jsonify({
        'matches': matches,
        'count': len(matches),
        'generated_at': datetime.utcnow().isoformat()
    })


@app.route('/api/v1/recommendations/urgency', methods=['POST'])
def calculate_urgency():
    """
    Calculate urgency score for items
    
    Request body:
    {
        "items": [
            {"id": "1", "expiry_date": "2026-01-26"},
            {"id": "2", "expiry_date": "2026-01-30"}
        ]
    }
    """
    data = request.get_json()
    
    if not data.get('items'):
        return jsonify({'error': 'items array is required'}), 400
    
    results = []
    for item in data['items']:
        urgency = ExpiryUrgencyScorer.calculate(item.get('expiry_date'))
        results.append({
            'id': item.get('id'),
            'expiry_date': item.get('expiry_date'),
            'urgency_score': round(urgency, 2),
            'urgency_level': _get_urgency_level(urgency)
        })
    
    return jsonify({'results': results})


def _get_urgency_level(score: float) -> str:
    if score >= 0.9:
        return 'critical'
    elif score >= 0.7:
        return 'high'
    elif score >= 0.4:
        return 'medium'
    else:
        return 'low'


# ============================================================================
# Entry Point
# ============================================================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    
    print(f"🚀 Recommendation Engine starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)
