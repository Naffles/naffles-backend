# Gaming Infrastructure and House System

This document describes the gaming infrastructure and house system implementation for the Naffles platform.

## Overview

The gaming infrastructure provides a comprehensive system for managing house-banked games, player queuing, and third-party game integration. It consists of several key components:

1. **House Management System** - Manages house slots with fund management and rotation
2. **Game Session Management** - Handles game sessions with bet locking and state management
3. **Gaming API** - Provides complete queue abstraction for Naffles platform games
4. **Wagering API** - Handles balance validation and payouts for external third-party games
5. **Player Queue System** - Manages player queuing when house slots are unavailable

## Architecture

### Models

#### HouseSlot
- Represents a house slot with funding and queue management
- Tracks games played, winnings, losses, and fund utilization
- Automatically manages minimum fund requirements
- Supports activation/deactivation and fund management

#### GameSession
- Manages individual game sessions between players and house
- Supports both Naffles platform games and third-party games
- Handles game state, results, and expiration
- Integrates with VRF for fair randomness

#### PlayerQueue
- Manages player queuing when house slots are unavailable
- Automatic expiration and position management
- Supports queue notifications and matching

### Services

#### HouseManagementService
- `findAvailableHouseSlot()` - Finds available house slots for games
- `createHouseSlot()` - Creates new house slots with proper queue positioning
- `rotateHouseSlots()` - Ensures fair distribution of games across house slots
- `addFundsToHouseSlot()` / `withdrawFundsFromHouseSlot()` - Fund management
- `getHouseSlotStats()` - Provides detailed statistics and performance metrics

#### GameSessionService
- `createGameSession()` - Creates game sessions with automatic house matching or queuing
- `completeGameSession()` - Processes game results and updates house funds
- `processNextInQueue()` - Automatically processes queued players when slots become available
- `cleanupExpiredEntries()` - Handles expired sessions and queue entries

#### GamingApiService (Naffles Platform Games)
- `initializeGame()` - Initializes games with complete queue abstraction
- `submitMove()` - Handles game moves and state updates
- `finalizeGame()` - Processes final game results and payouts
- `getGameState()` - Retrieves current game state and queue information

#### WageringApiService (External Third-Party Games)
- `validateBalance()` - Validates player balance for external games
- `createWagerSession()` - Creates wager sessions for third-party games
- `processPayout()` - Processes payouts from external game results
- `getWagerSessionStatus()` - Retrieves session status and information

## API Endpoints

### House Management (`/house`)

#### Create House Slot
```http
POST /house/slots
Authorization: Bearer <token>
Content-Type: application/json

{
  "gameType": "rockPaperScissors",
  "tokenType": "points",
  "fundAmount": "1000000000000000000000"
}
```

#### Get My House Slots
```http
GET /house/slots/my
Authorization: Bearer <token>
```

#### Add Funds to House Slot
```http
POST /house/slots/:houseSlotId/add-funds
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": "500000000000000000000"
}
```

#### Get House Slot Statistics
```http
GET /house/slots/:houseSlotId/stats
Authorization: Bearer <token>
```

### Gaming API (`/gaming-api`) - Naffles Platform Games

#### Initialize Game
```http
POST /gaming-api/initialize
Authorization: Bearer <token>
Content-Type: application/json

{
  "gameType": "rockPaperScissors",
  "tokenType": "points",
  "betAmount": "100000000000000000000",
  "gameConfig": {
    "maxRounds": 1
  }
}
```

Response:
```json
{
  "sessionId": "64f8a1b2c3d4e5f6a7b8c9d0",
  "status": "in_progress",
  "gameState": {
    "playerMove": null,
    "houseMove": null,
    "gamePhase": "waiting_for_player_move"
  },
  "queuePosition": null,
  "estimatedWaitTime": null
}
```

#### Submit Move
```http
POST /gaming-api/sessions/:sessionId/move
Authorization: Bearer <token>
Content-Type: application/json

{
  "move": "rock"
}
```

#### Get Game State
```http
GET /gaming-api/sessions/:sessionId/state
Authorization: Bearer <token>
```

#### Finalize Game
```http
POST /gaming-api/sessions/:sessionId/finalize
Authorization: Bearer <token>
Content-Type: application/json

{
  "finalData": {
    "completed": true
  }
}
```

#### Get Queue Position
```http
GET /gaming-api/queue?gameType=rockPaperScissors&tokenType=points
Authorization: Bearer <token>
```

### Wagering API (`/wagering-api`) - External Third-Party Games

#### Validate Balance
```http
POST /wagering-api/validate-balance
Authorization: Bearer <token>
Content-Type: application/json

{
  "tokenType": "points",
  "betAmount": "100000000000000000000"
}
```

#### Create Wager Session
```http
POST /wagering-api/sessions
Authorization: Bearer <token>
Content-Type: application/json

{
  "tokenType": "points",
  "betAmount": "100000000000000000000",
  "thirdPartyGameId": "external-game-123",
  "gameMetadata": {
    "gameProvider": "ExternalProvider",
    "gameVersion": "1.0"
  }
}
```

#### Process Payout
```http
POST /wagering-api/sessions/:sessionId/payout
Authorization: Bearer <token>
Content-Type: application/json

{
  "winner": "player",
  "playerPayout": "200000000000000000000",
  "gameResult": {
    "outcome": "win",
    "details": "Player won the game"
  }
}
```

#### Get Wager Session Status
```http
GET /wagering-api/sessions/:sessionId/status
Authorization: Bearer <token>
```

## Queue Management

### How Queuing Works

1. **Player Requests Game**: When a player requests a game, the system first tries to find an available house slot
2. **House Slot Available**: If a house slot is available, the game starts immediately
3. **No House Slot**: If no house slot is available, the player is added to a queue
4. **Queue Processing**: When a house slot becomes available, the next player in queue is automatically matched
5. **Queue Expiration**: Queue entries expire after 5 minutes to prevent stale requests

### Queue Position Calculation

- Queue positions are assigned sequentially (1, 2, 3, ...)
- Estimated wait time is calculated as `queuePosition * 30 seconds`
- Players can check their queue position at any time

## Fund Management

### House Slot Funding

- **Initial Funding**: House owners fund their slots with a specified amount
- **Minimum Funds**: Automatically calculated as 10% of initial funding
- **Fund Tracking**: System tracks current funds, winnings, losses, and utilization
- **Auto-Deactivation**: Slots are automatically deactivated when funds fall below minimum

### Payout Processing

- **Player Wins**: House slot funds are reduced by payout amount
- **House Wins**: House slot funds are increased by bet amount
- **Draw Games**: Bet amount is returned to player (no house fund change)

## Security Features

### Session Management

- **Expiration**: All game sessions expire after 10 minutes
- **Bet Locking**: Player funds are locked during active sessions
- **State Validation**: Game state is validated at each step
- **VRF Integration**: Fair randomness using Chainlink VRF

### Balance Validation

- **Real-time Checks**: Balance is validated before each game
- **Concurrent Session Prevention**: Players can only have one active session per game type
- **Fund Locking**: Prevents double-spending during active games

## Monitoring and Analytics

### House Slot Statistics

- Games played count
- Total winnings and losses
- Net profit calculation
- Fund utilization percentage
- Performance metrics

### Session Tracking

- Active session monitoring
- Queue length tracking
- Average game duration
- Success/failure rates

## Error Handling

### Common Error Scenarios

1. **Insufficient Balance**: Player doesn't have enough funds
2. **No House Slots**: All house slots are unavailable or have insufficient funds
3. **Session Expired**: Game session has exceeded time limit
4. **Invalid Game State**: Game is in an invalid state for the requested operation
5. **Concurrent Sessions**: Player attempts to create multiple active sessions

### Error Responses

All errors follow a consistent format:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error information"
}
```

## Integration Examples

### Naffles Platform Game Integration

```javascript
// Initialize a rock-paper-scissors game
const gameSession = await gamingApiService.initializeGame(
  playerId,
  "rockPaperScissors",
  "points",
  "100000000000000000000"
);

// Submit player move
const moveResult = await gamingApiService.submitMove(
  gameSession.sessionId,
  { move: "rock" }
);

// Finalize game
const finalResult = await gamingApiService.finalizeGame(
  gameSession.sessionId,
  { completed: true }
);
```

### External Third-Party Game Integration

```javascript
// Validate player balance
const validation = await wageringApiService.validateBalance(
  playerId,
  "points",
  "100000000000000000000"
);

// Create wager session
const wagerSession = await wageringApiService.createWagerSession(
  playerId,
  "points",
  "100000000000000000000",
  "external-game-123"
);

// Process payout after external game completes
const payoutResult = await wageringApiService.processPayout(
  wagerSession.sessionId,
  {
    winner: "player",
    playerPayout: "200000000000000000000",
    gameResult: { outcome: "win" }
  }
);
```

## Maintenance

### Cleanup Tasks

- **Expired Sessions**: Automatically cleaned up every 5 minutes
- **Expired Queue Entries**: Removed during cleanup process
- **Inactive House Slots**: Can be manually deactivated by owners

### Database Indexes

The system uses optimized database indexes for:
- Game type and token type combinations
- Player and house slot lookups
- Queue position ordering
- Session status filtering
- Expiration time queries

## Performance Considerations

### Scalability

- **Queue Processing**: Asynchronous queue processing prevents blocking
- **House Slot Rotation**: Ensures fair distribution and prevents bottlenecks
- **Session Cleanup**: Regular cleanup prevents database bloat
- **Indexed Queries**: Optimized database queries for fast lookups

### Caching

- **Active Sessions**: Cached for quick access
- **Queue Positions**: Real-time queue position updates
- **House Slot Availability**: Cached availability status