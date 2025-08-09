# Raffle API Documentation

## Overview

The Raffle API provides endpoints for creating, managing, and participating in raffles on the Naffles platform. It supports NFT raffles, token raffles, and allowlist raffles with comprehensive validation and VRF integration.

## Base URL

```
/raffle
```

## Authentication

Most endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## Endpoints

### 1. Get Raffle Creation Options

**GET** `/raffle/options`

Returns dropdown options for raffle creation form.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "message": "Successfully fetched dropdown options!",
  "data": {
    "lotteryTypes": ["TOKEN", "NFT", "NAFFLINGS", "ALLOWLIST"],
    "raffleTypes": ["STANDARD", "UNLIMITED", "UNCONDITIONAL"],
    "supportedTokens": [...],
    "supportedChains": [...]
  }
}
```

### 2. Create New Raffle

**POST** `/raffle`

Creates a new raffle with specified parameters.

**Authentication:** Required

**Request Body:**
```json
{
  "lotteryTypeEnum": "TOKEN|NFT|NAFFLINGS|ALLOWLIST",
  "raffleTypeEnum": "STANDARD|UNLIMITED|UNCONDITIONAL",
  "coinType": "string",
  "ticketsAvailable": "number (required for STANDARD)",
  "perTicketPrice": "string",
  "raffleDurationDays": "number",
  "discountCode": "number (optional)",
  "clientProfileId": "string (optional)",
  "rafflePrize": {
    // For TOKEN raffles
    "token": "string",
    "amount": "string",
    "chainId": "string",
    
    // For NFT raffles
    "contractAddress": "string",
    "tokenId": "string",
    "chainId": "string",
    "collection": "string",
    
    // For NAFFLINGS raffles
    "nafflings": "string"
  },
  "reservePrice": "string (for UNLIMITED raffles)"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Raffle created successfully!",
  "data": {
    "_id": "raffle_id",
    "eventId": "RAFFLE_001",
    "lotteryTypeEnum": "TOKEN",
    "raffleTypeEnum": "STANDARD",
    "ticketsAvailable": 100,
    "perTicketPrice": "1000000",
    "raffleEndDate": "2024-01-01T00:00:00.000Z",
    "status": {
      "isActive": true,
      "isCompleted": false
    },
    "vrf": {
      "status": "Pending"
    }
  }
}
```

**Error Responses:**
- `400` - Invalid input parameters
- `400` - Insufficient balance for prize
- `401` - Authentication required
- `500` - Server error

### 3. Get Active Raffles

**GET** `/raffle`

Retrieves a list of active raffles with filtering and pagination.

**Authentication:** Optional

**Query Parameters:**
- `cursor` (string): Pagination cursor
- `limit` (number): Number of results (max 40, default 20)
- `isActive` (boolean): Filter by active status
- `lotteryTypes` (string): Comma-separated lottery types
- `raffleTypes` (string): Comma-separated raffle types
- `coinType` (string): Filter by coin type
- `sortField` (string): Field to sort by (default: createdAt)
- `sortOrder` (string): Sort order (asc/desc, default: desc)
- `personal` (boolean): Show only user's raffles
- `hasOpenEntry` (boolean): Filter raffles with open entry tickets
- `clientProfileId` (string): Filter by community ID

**Response:**
```json
{
  "success": true,
  "message": "Successfully fetched raffles",
  "data": {
    "raffles": [
      {
        "_id": "raffle_id",
        "eventId": "RAFFLE_001",
        "lotteryTypeEnum": "TOKEN",
        "raffleTypeEnum": "STANDARD",
        "coinType": "usdc",
        "ticketsAvailable": 95,
        "ticketsSold": 5,
        "perTicketPrice": "1000000",
        "raffleEndDate": "2024-01-01T00:00:00.000Z",
        "rafflePrize": {
          "tokenPrize": {
            "token": "usdc",
            "amount": "100000000",
            "symbol": "USDC"
          }
        },
        "status": {
          "isActive": true,
          "isCompleted": false
        }
      }
    ],
    "nextCursor": "next_page_cursor"
  }
}
```

### 4. Get Raffle Details

**GET** `/raffle/:raffleId`

Retrieves detailed information about a specific raffle.

**Authentication:** Optional

**Parameters:**
- `raffleId` (string): The raffle ID

**Response:**
```json
{
  "success": true,
  "message": "Successfully fetched raffle details!",
  "data": {
    "_id": "raffle_id",
    "eventId": "RAFFLE_001",
    "lotteryTypeEnum": "TOKEN",
    "raffleTypeEnum": "STANDARD",
    "coinType": "usdc",
    "ticketsAvailable": 95,
    "ticketsSold": 5,
    "perTicketPrice": "1000000",
    "raffleEndDate": "2024-01-01T00:00:00.000Z",
    "rafflePrize": {
      "tokenPrize": {
        "token": "usdc",
        "amount": "100000000",
        "symbol": "USDC",
        "validated": true
      }
    },
    "status": {
      "isActive": true,
      "isCompleted": false,
      "wonBy": null
    },
    "vrf": {
      "status": "Pending",
      "winningTicketNumber": 0,
      "failsafeUsed": false
    },
    "createdBy": "user_id",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 5. Purchase Raffle Tickets

**POST** `/raffle/:raffleId/ticket-purchase`

Purchases tickets for a specific raffle.

**Authentication:** Required

**Parameters:**
- `raffleId` (string): The raffle ID

**Request Body:**
```json
{
  "quantity": 5,
  "userId": "user_id (optional)",
  "isOpenEntry": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully bought raffle tickets!",
  "data": {
    "purchasedTicketsCount": 5,
    "freeTicketsCount": 1,
    "total": 6,
    "purchasedTickets": [
      {
        "_id": "ticket_id",
        "naffleTicketId": "TICKET001",
        "ticketNumber": 1,
        "purchasedBy": "user_id",
        "raffle": "raffle_id",
        "isFree": false
      }
    ],
    "freeTickets": [
      {
        "_id": "free_ticket_id",
        "naffleTicketId": "TICKET002",
        "ticketNumber": 2,
        "purchasedBy": "user_id",
        "raffle": "raffle_id",
        "isFree": true
      }
    ]
  }
}
```

**Error Responses:**
- `400` - Invalid quantity or insufficient balance
- `401` - Authentication required
- `404` - Raffle not found
- `500` - Not enough tickets available

### 6. Draw Raffle Winner

**POST** `/raffle/:raffleId/draw`

Initiates the winner selection process for a raffle.

**Authentication:** Required (must be raffle creator)

**Parameters:**
- `raffleId` (string): The raffle ID

**Response:**
```json
{
  "success": true,
  "message": "Successfully requested for raffle draw!"
}
```

**Error Responses:**
- `401` - Not authorized (not raffle creator)
- `400` - Raffle already drawn or no tickets sold
- `500` - VRF queue full or other server error

### 7. Claim Raffle Prize

**POST** `/raffle/:raffleId/claim`

Claims the prize for a won raffle (primarily for NFT raffles).

**Authentication:** Required (must be winner or admin)

**Parameters:**
- `raffleId` (string): The raffle ID

**Response:**
```json
{
  "success": true,
  "message": "Prize claimed successfully!"
}
```

### 8. Cancel and Refund Raffle

**POST** `/raffle/:raffleId/cancel-and-refund`

Cancels a raffle and refunds all participants.

**Authentication:** Required (must be raffle creator or admin)

**Parameters:**
- `raffleId` (string): The raffle ID

**Response:**
```json
{
  "success": true,
  "message": "Raffle has been successfully cancelled and refunded!",
  "data": {
    "_id": "raffle_id",
    "isCancelled": true,
    "cancelledBy": "user_id",
    "cancelledAt": "2024-01-01T00:00:00.000Z",
    "status": {
      "isActive": false
    }
  }
}
```

**Error Responses:**
- `400` - Cannot cancel unconditional raffles or before end date
- `401` - Not authorized
- `404` - Raffle not found

### 9. Get Ticket Sales History

**GET** `/raffle/:raffleId/ticket-sales-history`

Retrieves the ticket purchase history for a raffle.

**Authentication:** Optional

**Parameters:**
- `raffleId` (string): The raffle ID

**Query Parameters:**
- `max` (number): Maximum number of sales to return (default: 4)

**Response:**
```json
{
  "success": true,
  "message": "Successfully fetch ticket sales history!",
  "data": [
    {
      "username": "user123",
      "quantity": 5,
      "ticketsBought": ["TICKET001", "TICKET002", "TICKET003", "TICKET004", "TICKET005"],
      "isFree": false,
      "datePurchased": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 10. Get Allowlist Raffles

**GET** `/raffle/allowlists`

Retrieves allowlist raffles with pagination.

**Authentication:** Optional

**Query Parameters:**
- `cursor` (string): Pagination cursor
- `limit` (number): Number of results (max 40, default 20)

**Response:**
```json
{
  "success": true,
  "message": "Successfully fetched raffles",
  "data": {
    "allowlistRaffles": [
      {
        "_id": "allowlist_id",
        "raffleName": "NFT Allowlist",
        "description": "Get on the allowlist for our NFT drop",
        "winnerCount": 100,
        "startTime": "2024-01-01T00:00:00.000Z",
        "endTime": "2024-01-07T00:00:00.000Z",
        "blockchain": "ethereum",
        "requireCaptcha": true
      }
    ],
    "nextCursor": "next_page_cursor"
  }
}
```

## Error Handling

All endpoints return errors in the following format:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error information (optional)"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created successfully
- `400` - Bad request (validation errors)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not found
- `500` - Internal server error

## Rate Limiting

API endpoints are rate-limited to prevent abuse. Limits vary by endpoint:
- Read operations: 100 requests per minute
- Write operations: 20 requests per minute
- VRF operations: 5 requests per minute

## Validation Rules

### Raffle Creation
- `ticketsAvailable`: Must be positive integer for STANDARD raffles
- `perTicketPrice`: Must be valid number string
- `raffleDurationDays`: Must be between 1 and 30 days
- `rafflePrize`: Must match lottery type requirements

### Ticket Purchase
- `quantity`: Must be positive integer
- User must have sufficient balance
- Cannot exceed available tickets for STANDARD raffles

### Asset Validation
- NFT contracts must be in approved collections list
- Token contracts must be in approved tokens list
- User must own the asset being raffled

## VRF Integration

The platform uses Chainlink VRF for verifiable randomness in winner selection:

1. When a raffle is drawn, a VRF request is submitted
2. The raffle status changes to "In Progress"
3. When VRF fulfills the request, winner is selected
4. If VRF fails, a cryptographically secure failsafe is used
5. Results are verifiable on-chain (except for failsafe cases)

## WebSocket Events

Real-time updates are available via WebSocket for:
- Raffle countdown updates
- Ticket purchase notifications
- Winner announcements
- VRF status changes

Connect to: `ws://your-domain/socket.io`

Events:
- `raffle:updated` - Raffle data changed
- `raffle:ticket_purchased` - New ticket purchased
- `raffle:winner_selected` - Winner announced
- `raffle:countdown` - Time remaining updates