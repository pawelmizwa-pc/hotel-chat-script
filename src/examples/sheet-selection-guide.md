# Sheet Selection Guide for Hotel Smile Chatbot

## Purpose
This guide helps the chatbot select the most relevant sheet(s) from the excel.md file based on user queries, ensuring optimal context retrieval and response accuracy.

## Available Sheets Overview

### 01_hotel_basic_info
**Content**: Hotel overview, contact information, basic policies, location details
**Use for queries about**:
- Hotel location, address, contact details
- General hotel information
- WiFi credentials
- Senior card discounts
- Hotel category and star rating
- Basic policies and payment info

### 02_rooms_and_accommodations
**Content**: Room types, amenities, room enhancement services
**Use for queries about**:
- Room types and configurations
- Bed arrangements and capacity
- Room amenities (TV, fridge, bathroom, etc.)
- Room enhancements (romantic setup, welcome gifts)
- Balcony availability
- Accommodation suitability for different groups

### 03_dining_and_restaurants
**Content**: Dining venues, meal times, special dining offers
**Use for queries about**:
- Restaurant information and hours
- Meal times (breakfast, lunch, dinner)
- Bar services
- Special dining promotions
- Romantic dinners
- Food and beverage options

### 04_wellness_and_spa_facilities
**Content**: Basic wellness facilities, access information, policies
**Use for queries about**:
- Pool access and hours
- Sauna facilities
- Jacuzzi availability
- Salt cave (grota solna)
- Wellness facility locations
- Basic SPA policies
- Towel services

### 05_spa_services_and_treatments
**Content**: Detailed SPA services including massages, facials, body treatments
**Use for queries about**:
- Massage types and prices
- Facial treatments
- Body treatments
- Treatment durations
- Specific therapy recommendations
- Individual SPA services

### 06_spa_packages_and_products
**Content**: SPA packages, products for purchase, vouchers, service add-ons
**Use for queries about**:
- SPA packages and combinations
- SPA products for purchase
- Gift vouchers
- Family packages
- Day SPA options
- Service add-ons and extras

### 07_activities_and_attractions
**Content**: On-site activities, nearby attractions, seasonal activities
**Use for queries about**:
- Things to do nearby
- Seasonal activities
- Children's activities
- Tourist attractions
- Dunajec rafting
- Hiking and outdoor activities
- Local sightseeing

### 08_business_services_and_events
**Content**: Business facilities, hotel services, event information
**Use for queries about**:
- Conference facilities
- Business events
- Hotel services (luggage storage, transfers)
- Event venues
- Group bookings
- Transportation services

### 09_therapeutic_and_medical_services
**Content**: Medical and therapeutic treatments, health guidelines
**Use for queries about**:
- Therapeutic treatments
- Medical services
- Health-related procedures
- Lymphatic drainage
- Therapeutic mud treatments
- Age restrictions for treatments

## Query-to-Sheet Mapping Examples

### Single Sheet Queries
- "What's the hotel address?" → **01_hotel_basic_info**
- "What room types do you have?" → **02_rooms_and_accommodations**
- "When is breakfast served?" → **03_dining_and_restaurants**
- "Is there a pool?" → **04_wellness_and_spa_facilities**
- "How much is a massage?" → **05_spa_services_and_treatments**
- "Do you have SPA packages?" → **06_spa_packages_and_products**
- "What can we do nearby?" → **07_activities_and_attractions**
- "Do you have conference rooms?" → **08_business_services_and_events**
- "Do you offer medical treatments?" → **09_therapeutic_and_medical_services**

### Multi-Sheet Queries
- "I want to book a romantic stay" → **02_rooms_and_accommodations** + **03_dining_and_restaurants**
- "What wellness facilities and treatments do you offer?" → **04_wellness_and_spa_facilities** + **05_spa_services_and_treatments**
- "Plan a spa day for me" → **05_spa_services_and_treatments** + **06_spa_packages_and_products**
- "What activities are available in winter?" → **07_activities_and_attractions** + **04_wellness_and_spa_facilities**
- "I'm organizing a business event" → **08_business_services_and_events** + **03_dining_and_restaurants**

## Selection Strategy

### 1. Analyze Query Keywords
- **Contact/Location**: Sheet 01
- **Room/Accommodation**: Sheet 02
- **Food/Dining/Restaurant**: Sheet 03
- **Pool/Sauna/Wellness**: Sheet 04
- **Massage/Treatment/Facial**: Sheet 05
- **Package/Product/Voucher**: Sheet 06
- **Activity/Attraction/Sightseeing**: Sheet 07
- **Business/Conference/Service**: Sheet 08
- **Therapeutic/Medical/Health**: Sheet 09

### 2. Consider Query Complexity
- **Simple queries**: Usually require 1 sheet
- **Complex queries**: May require 2-3 related sheets
- **Planning queries**: Often need multiple sheets

### 3. Prioritize Relevance
- Select the most directly relevant sheet first
- Add supporting sheets that provide context
- Avoid overwhelming with unnecessary information

### 4. Common Combinations
- **Romantic stay**: Sheets 02 + 03
- **Wellness experience**: Sheets 04 + 05 + 06
- **Family vacation**: Sheets 02 + 07 + 04
- **Business trip**: Sheets 08 + 01 + 02
- **Health retreat**: Sheets 09 + 04 + 05

## Implementation Notes

1. **Start with primary sheet**: Select the most relevant sheet first
2. **Add supporting context**: Include related sheets that enhance the response
3. **Limit selection**: Maximum 3 sheets per query to avoid information overload
4. **Consider user intent**: Think about what the user is really trying to accomplish
5. **Default fallback**: If unsure, start with sheet 01 for general information

This guide ensures efficient context retrieval while maintaining response quality and relevance. 