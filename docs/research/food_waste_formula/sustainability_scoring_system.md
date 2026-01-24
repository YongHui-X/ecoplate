# Comprehensive Sustainability Scoring System
## Combining Cost + Carbon Emissions for Food Waste Analysis

---

## Overview

This scoring system integrates both **economic impact** (cost) and **environmental impact** (carbon emissions) to provide a holistic view of food waste sustainability. Each food item receives a composite score that reflects its true impact.

---

## System Components

### 1. Carbon Emission Factors (EF) Database

#### Production Stage Emissions (kg CO₂e per kg food)

| Food Category | EF_Production | Notes |
|--------------|---------------|--------|
| **Proteins** | | |
| Beef | 99.0 | Highest impact due to methane |
| Lamb | 39.0 | High methane emissions |
| Pork | 12.0 | Moderate impact |
| Chicken | 9.0 | Lower than red meat |
| Fish (farmed) | 13.0 | Varies by species |
| Fish (wild) | 5.0 | Lower than farmed |
| Eggs | 4.5 | Relatively efficient |
| Tofu | 3.0 | Plant-based protein |
| Legumes/Beans | 0.9 | Lowest protein source |
| **Dairy** | | |
| Cheese | 13.5 | Concentrated dairy product |
| Milk | 8.0 | Moderate impact |
| Yogurt | 5.0 | Lower than cheese |
| Butter | 12.0 | High fat concentration |
| **Grains & Starches** | | |
| Rice | 4.0 | Methane from paddies |
| Wheat/Bread | 1.5 | Relatively low |
| Pasta | 2.5 | Processed wheat |
| Potatoes | 0.5 | Very low impact |
| **Vegetables** | | |
| Leafy greens | 2.0 | Short growing cycle |
| Root vegetables | 0.4 | Efficient growing |
| Tomatoes | 2.0 | Greenhouse often used |
| Onions/Garlic | 0.5 | Hardy crops |
| Mushrooms | 2.5 | Energy-intensive growing |
| **Fruits** | | |
| Berries | 1.5 | Delicate, short season |
| Apples | 0.6 | Hardy, efficient |
| Bananas | 0.9 | Import emissions |
| Citrus | 0.7 | Efficient growing |
| Tropical (mango, etc) | 1.5 | Import + growing |
| **Processed Foods** | | |
| Canned goods | 3.0 | + processing energy |
| Frozen meals | 4.0 | + freezing energy |
| Snack foods | 5.0 | High processing |

#### Disposal Stage Emissions (kg CO₂e per kg waste)

| Disposal Method | EF_Disposal | Notes |
|----------------|-------------|--------|
| Landfill | 0.5 | Methane generation (CH₄ = 25x CO₂) |
| Incineration | 0.9 | Direct CO₂ emissions |
| Composting | 0.1 | Minimal emissions |
| Anaerobic Digestion | -0.2 | Negative (energy recovery) |
| Sewer/Drain | 0.3 | Wastewater treatment |

---

## 2. Sustainability Impact Calculation

### Formula Components

```
For each food waste item:

1. Production Impact Saved (PIS):
   PIS = Weight × EF_Production[category]

2. Disposal Impact Cost (DIC):
   DIC = Weight × EF_Disposal[method]

3. Net Carbon Saved (NCS):
   NCS = PIS - DIC

4. Economic Cost (EC):
   EC = (Waste_Weight / Total_Weight) × Purchase_Cost

5. Water Footprint (WF) - Optional Advanced:
   WF = Weight × Water_Factor[category] liters
```

### Example Calculation

**Item:** 6 kg chicken breast wasted, landfill disposal
```
PIS = 6 kg × 9.0 = 54 kg CO₂e saved if not wasted
DIC = 6 kg × 0.5 = 3 kg CO₂e cost from disposal
NCS = 54 - 3 = 51 kg CO₂e net impact
EC = (6/10) × $25 = $15 economic cost

Combined Impact Score (see scoring below)
```

---

## 3. Composite Scoring System

### Three Scoring Approaches

#### Approach A: Normalized Points System (0-100 scale)

```
Step 1: Calculate normalized scores

Economic Score (ES):
ES = (Waste_Cost / Monthly_Budget) × 1000
Then normalize: ES_normalized = min(ES, 100)

Environmental Score (EnS):
EnS = (Net_Carbon_Saved / 100) × 100
Then normalize: EnS_normalized = min(EnS, 100)

Step 2: Weight the scores

Default weights:
- Economic: 50%
- Environmental: 50%

Composite Score = (ES_normalized × 0.5) + (EnS_normalized × 0.5)

Interpretation:
0-20: Excellent (minimal impact)
21-40: Good (room for improvement)
41-60: Moderate (significant impact)
61-80: Poor (major waste issue)
81-100: Critical (immediate action needed)
```

#### Approach B: CO₂e Equivalent Cost System

```
Convert everything to CO₂e equivalent:

Social Cost of Carbon = $51 per ton CO₂e (US EPA 2023)
                      = $0.051 per kg CO₂e

Total Impact in CO₂e terms:
1. Carbon impact: NCS kg CO₂e
2. Economic impact: EC / $0.051 = equivalent kg CO₂e
3. Total = NCS + (EC / 0.051)

Example:
Chicken waste: 51 kg CO₂e + ($15 / 0.051) = 51 + 294 = 345 kg CO₂e total impact

Ranking: Higher = worse impact
```

#### Approach C: Sustainability Index (0-10 scale)

```
Calculate for each item:

Impact Score (IS) = √[(NCS/10)² + (EC/5)²]

Then convert to 0-10 scale:
Sustainability Index = 10 / (1 + IS)

Interpretation:
9-10: Excellent
7-9: Good
5-7: Fair
3-5: Poor
0-3: Critical

Example:
Chicken: IS = √[(51/10)² + (15/5)²] = √[26.01 + 9] = √35.01 = 5.92
Index = 10 / (1 + 5.92) = 1.45 (Critical - needs action!)
```

---

## 4. Category Risk Scoring

### High-Impact Category Matrix

```
Risk Score = (Average Waste %) × (Carbon Intensity) × (Cost per kg)

Categories ranked by Risk Score:
```

| Category | Avg Waste % | Carbon Intensity | Cost/kg | Risk Score | Priority |
|----------|-------------|------------------|---------|------------|----------|
| Beef | 20% | 99.0 | $12 | 237.6 | CRITICAL |
| Seafood | 30% | 13.0 | $25 | 97.5 | HIGH |
| Cheese | 25% | 13.5 | $15 | 50.6 | HIGH |
| Berries | 50% | 1.5 | $16 | 12.0 | MEDIUM |
| Chicken | 15% | 9.0 | $8 | 10.8 | MEDIUM |
| Leafy greens | 40% | 2.0 | $8 | 6.4 | MEDIUM |
| Bread | 30% | 1.5 | $5 | 2.3 | LOW |
| Root veg | 15% | 0.4 | $3 | 0.2 | LOW |

**Action Priority:**
- CRITICAL (>200): Immediate behavior change required
- HIGH (50-200): Focus area for reduction
- MEDIUM (10-50): Optimize when possible
- LOW (<10): Maintain current practices

---

## 5. Monthly Dashboard Metrics

### Key Performance Indicators (KPIs)

```
1. Total Sustainability Impact (TSI):
   TSI = Σ(Economic Cost) + Σ(Net Carbon Saved × $0.051)

2. Carbon Efficiency Ratio (CER):
   CER = kg CO₂e saved / $ spent
   Target: > 5 kg CO₂e / $

3. Waste Intensity Index (WII):
   WII = Total Impact / Total Food Purchased
   Target: < 0.3

4. Category Performance:
   For each category:
   - Waste %
   - Total carbon impact
   - Total cost impact
   - Trend (improving/worsening)

5. Improvement Rate:
   Month-over-month % reduction in:
   - Total waste cost
   - Total carbon impact
   - Overall sustainability score
```

---

## 6. Gamification & Rewards System

### Point System

```
Base Points Earned = 100 - Sustainability Index

Multipliers:
- Streak bonus: +10% for each consecutive week of improvement
- Category mastery: +20% when category waste < 10%
- Zero waste day: +50 points
- Composting: +2 points per kg composted vs landfill

Achievements:
🌱 Sprout (Level 1): 0-500 points - "Getting Started"
🌿 Seedling (Level 2): 500-2000 points - "Building Habits"
🌳 Tree (Level 3): 2000-5000 points - "Sustainability Champion"
🌍 Forest (Level 4): 5000+ points - "Environmental Hero"

Badges:
- "Beef Saver" - Reduce beef waste by 50%
- "Zero Hero" - 7 consecutive days no food waste
- "Composter" - Compost 10kg+ in a month
- "Budget Master" - Keep waste cost under $50/month
- "Carbon Crusher" - Save 100kg CO₂e in a month
```

---

## 7. Advanced: Water Footprint Integration

### Water Factors (liters per kg food)

| Food Category | Water Footprint (L/kg) |
|--------------|----------------------|
| Beef | 15,415 |
| Pork | 5,988 |
| Chicken | 4,325 |
| Rice | 2,497 |
| Wheat/Bread | 1,827 |
| Vegetables (avg) | 322 |
| Fruits (avg) | 962 |

### Triple Bottom Line Score

```
TBL Score = 0.4×Economic + 0.4×Carbon + 0.2×Water

Where each component is normalized 0-100

Example:
Economic: $15 waste = 75 points (high impact)
Carbon: 51 kg CO₂e = 85 points (very high impact)
Water: 6kg × 4,325L = 25,950L = 90 points (critical)

TBL = 0.4×75 + 0.4×85 + 0.2×90 = 30 + 34 + 18 = 82 (Poor rating)
```

---

## 8. Predictive Waste Probability Model

### Days to Expiry Risk Scoring

```
P_waste(d) = Probability of waste based on days to expiry

Sigmoid function:
P_waste(d) = 1 / (1 + e^(0.5×(d-2)))

Where d = days to expiry

Results:
d = 0 (expired): P_waste = 88%
d = 1: P_waste = 73%
d = 2: P_waste = 50%
d = 3: P_waste = 31%
d = 5: P_waste = 12%
d = 7: P_waste = 5%
d = 10: P_waste = 1%

Category modifiers (multiply base probability):
- High risk (berries, leafy greens): ×1.5
- Medium risk (bread, dairy): ×1.0
- Low risk (root veg, apples): ×0.7
- Very low risk (canned, dry goods): ×0.3
```

### Predictive Impact Score

```
Expected Waste Impact = P_waste(d) × Total Impact

Use this to prioritize which items to consume first:

Example:
Item A: Lettuce, 2 days to expiry, $4, 0.5kg, 2.0 CO₂e/kg
  P_waste = 50% × 1.5 (high risk) = 75%
  Impact = 75% × [$4 + (0.5×2.0×$0.051)] = $3.04

Item B: Apple, 7 days to expiry, $1, 0.2kg, 0.6 CO₂e/kg
  P_waste = 5% × 0.7 (low risk) = 3.5%
  Impact = 3.5% × [$1 + (0.2×0.6×$0.051)] = $0.035

Priority: Eat lettuce first (100x higher expected impact)
```

---

## 9. Comparative Benchmarking

### Personal Performance vs Targets

```
Your Monthly Performance Card:

┌─────────────────────────────────────────┐
│ Food Waste Sustainability Report        │
├─────────────────────────────────────────┤
│ Economic Impact:                        │
│   Your waste: $85                       │
│   Target: <$50                          │
│   Status: ⚠️ Needs Improvement          │
│                                         │
│ Carbon Impact:                          │
│   CO₂e wasted: 45 kg                    │
│   Target: <30 kg                        │
│   Status: ⚠️ Needs Improvement          │
│                                         │
│ Composite Score: 58/100                 │
│   Rating: MODERATE                      │
│                                         │
│ Top Offenders:                          │
│   1. Chicken (18 kg CO₂e, $22)         │
│   2. Cheese (8 kg CO₂e, $15)           │
│   3. Berries (3 kg CO₂e, $18)          │
│                                         │
│ Improvement Potential: $55/month        │
│                     = $660/year         │
│                     = 25 kg CO₂e/month  │
└─────────────────────────────────────────┘
```

---

## 10. Implementation Tracking Template

### Weekly Sustainability Scorecard

| Week | Items Wasted | Total Cost | Total CO₂e | Composite Score | Trend |
|------|--------------|------------|------------|-----------------|-------|
| 1 | 12 | $85 | 45 kg | 58 | Baseline |
| 2 | 10 | $72 | 38 kg | 52 | ↓ Improving |
| 3 | 8 | $65 | 32 kg | 45 | ↓ Improving |
| 4 | 9 | $68 | 35 kg | 47 | ↑ Slight increase |

**Monthly Summary:**
- Average Score: 50.5 (Moderate → Fair transition)
- Total Savings: $83 economic, 38 kg CO₂e environmental
- Equivalent to: 83 miles NOT driven in a car
- Achievement: "Sprout" level reached! 🌱

---

## 11. Decision Support Matrix

### Should I Buy in Bulk? Calculator

```
Inputs:
- Regular price: $Pr per kg
- Bulk price: $Pb per kg
- Expected waste rate: W%
- Carbon intensity: C kg CO₂e/kg

True cost analysis:
Regular true cost = $Pr (assuming 0% waste)
Bulk true cost = $Pb / (1 - W%)

Carbon adjusted cost:
Add carbon cost: + (W% × C × $0.051)

Decision:
IF Bulk true cost + carbon cost < Regular price
THEN bulk buying is worth it
ELSE buy regular quantities

Example:
Regular chicken: $8/kg, 0% waste
Bulk chicken: $2.50/kg, 60% waste, 9 CO₂e/kg

Bulk true cost = $2.50 / 0.4 = $6.25
+ Carbon: 0.6 × 9 × $0.051 = $0.28
Total: $6.53/kg

Decision: ✓ Bulk still better ($6.53 < $8)
But warning: Close call, improve storage to maintain advantage
```

---

## 12. CSV Template for Sustainability Tracking

```csv
Date,Item,Category,Weight_kg,Cost,Waste_kg,Days_to_Expiry,EF_Production,EF_Disposal,Disposal_Method,PIS_kg_CO2e,DIC_kg_CO2e,NCS_kg_CO2e,Waste_Cost,Economic_Score,Environmental_Score,Composite_Score,P_Waste,Action_Priority
```

### Formulas for Spreadsheet:

```
Column K (PIS): =C × H (Weight × EF_Production)
Column L (DIC): =F × I (Waste_Weight × EF_Disposal)
Column M (NCS): =K - L (PIS - DIC)
Column N (Waste_Cost): =(F/C) × E
Column O (Economic_Score): =(N/Monthly_Budget)*1000, min 100
Column P (Environmental_Score): =(M/100)*100, min 100
Column Q (Composite_Score): =(O*0.5)+(P*0.5)
Column R (P_Waste): =1/(1+EXP(0.5*(G-2))) [sigmoid function]
Column S (Action_Priority): =IF(Q>60,"HIGH",IF(Q>40,"MEDIUM","LOW"))
```

---

## 13. Mobile App Mock Data Structure

```json
{
  "user_id": "user123",
  "month": "2025-01",
  "sustainability_metrics": {
    "total_economic_impact": 85.50,
    "total_carbon_impact": 45.2,
    "total_water_impact": 156780,
    "composite_score": 58,
    "rating": "MODERATE",
    "improvement_trend": "IMPROVING"
  },
  "category_breakdown": [
    {
      "category": "Protein",
      "waste_percentage": 25,
      "economic_impact": 35.00,
      "carbon_impact": 28.5,
      "risk_score": "HIGH"
    },
    {
      "category": "Vegetables",
      "waste_percentage": 40,
      "economic_impact": 25.00,
      "carbon_impact": 8.2,
      "risk_score": "MEDIUM"
    }
  ],
  "achievements": [
    "Sprout Level Reached",
    "Week 2 Improvement Streak"
  ],
  "recommendations": [
    "Focus on reducing chicken waste (highest impact)",
    "Consider composting vegetable waste",
    "Freeze bread before it goes stale"
  ]
}
```

---

## 14. Summary: Quick Start Guide

### 3-Step Implementation

**Step 1: Data Collection (Week 1)**
- Track all food waste with weight
- Record purchase costs
- Note food categories

**Step 2: Calculate Impacts (Week 2)**
- Apply carbon emission factors
- Calculate economic costs
- Generate composite scores

**Step 3: Take Action (Week 3+)**
- Focus on highest-impact categories
- Set monthly reduction targets
- Track improvement trends
- Earn achievements

### Target Scores by Month

```
Month 1: Establish baseline
Month 2: Reduce to Composite Score < 50
Month 3: Reduce to Composite Score < 40
Month 6: Reach Composite Score < 30 (Good rating)
Month 12: Maintain < 25 (Excellent rating)
```

---

## Conclusion

This sustainability scoring system provides:
- **Holistic view**: Both economic and environmental impacts
- **Actionable insights**: Prioritized recommendations
- **Motivation**: Gamification and achievements
- **Flexibility**: Multiple scoring approaches
- **Scalability**: From individual to household to community

**Expected outcomes after 3 months:**
- 30-50% reduction in food waste
- $50-150 monthly savings
- 20-40 kg CO₂e monthly reduction
- Equivalent to: 200+ miles NOT driven

---

**Document Version:** 1.0  
**Last Updated:** January 2025  
**License:** Free to use for personal or educational purposes