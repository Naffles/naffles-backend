# Blackjack Split Rules Implementation

## Overview

This document describes the proper casino split rules implementation for the Naffles blackjack game, following standard casino blackjack rules.

## Split Logic Rules

### 1. Split Hand Creation
- When a player splits, two hands are created from the original pair
- Each hand gets one card from the original pair
- The second card is dealt ONLY to the first hand initially
- The second hand remains with one card until the first hand is completed

### 2. Split Hand Progression
- Player plays the first hand completely before moving to the second hand
- Only after the first hand is finished (stand, bust, or 21) does the second hand receive its second card
- This follows proper casino rules where split hands are played sequentially, not simultaneously

### 3. Ace Split Special Rules
- When splitting Aces, each hand receives exactly one additional card
- No further actions (hit, stand, double) are allowed on split Aces
- Both hands are automatically completed after receiving their single additional card
- This follows standard casino rules for Ace splits

### 4. Split Eligibility
- Can split any pair with the same rank (A-A, 2-2, 3-3, etc.)
- Can split any pair with the same value (10-J, 10-Q, 10-K, J-Q, J-K, Q-K)
- Cannot split cards with different values (A-10, 7-8, etc.)
- Can only split with exactly 2 cards (no splitting after hitting)

### 5. Actions on Split Hands
- Hit: Available on non-Ace split hands
- Stand: Available on non-Ace split hands
- Double: Available on non-Ace split hands (first two cards only)
- Split: Not available (no re-splitting implemented)

## Implementation Details

### Backend Service Methods

#### `processSplit(gameState)`
- Creates two hands with one card each from the original pair
- Deals second card only to the first hand
- Sets `currentSplitHand` to 0 (first hand)
- Handles Ace split special case with automatic completion

#### `processHit(gameState)` - Split Hand Logic
- Adds card to the current split hand
- If current hand busts or gets 21, moves to next hand
- Deals second card to second hand only after first hand is done

#### `processStand(gameState)` - Split Hand Logic
- Moves to next split hand if available
- Deals second card to second hand only after first hand stands
- Moves to dealer turn if all split hands are complete

#### `processDouble(gameState)` - Split Hand Logic
- Adds one card to current split hand and automatically stands
- Moves to next split hand and deals its second card
- Not allowed on split Aces

### Frontend Display

#### Split Hand Spacing
- Split hands are positioned with `gap-48` (192px) spacing
- This ensures hand 1 can accommodate up to 5 additional cards without overlapping hand 2
- Card width: 64px, 60% overlap means each additional card adds 25.6px
- Maximum width for hand 1: 64px + (5 × 25.6px) = 192px
- Gap of 192px provides exact clearance needed

#### Visual Indicators
- Active split hand is highlighted with aqua color
- Hand values are displayed below each split hand
- Bust indication shown for hands that exceed 21

## Testing

Comprehensive tests verify:
- Proper split hand creation (one card each, second card to first hand only)
- Correct split hand progression (second hand waits for first hand completion)
- Ace split special handling (one card each, automatic completion)
- Split eligibility validation (same rank/value only)
- Double down on split hands (except Aces)
- Proper spacing in frontend display

## Compliance

This implementation follows standard casino blackjack rules:
- Sequential play of split hands (not simultaneous)
- Ace splits receive one card each with no further actions
- Proper card distribution timing
- Standard split eligibility rules

## Files Modified

### Backend
- `services/games/blackjackService.js` - Core split logic implementation
- `tests/blackjackSplitLogic.test.js` - Comprehensive test suite

### Frontend
- `src/components/GameSection/Games/BlackjackGame.tsx` - React component split logic and spacing
- `demo-standalone.html` - Standalone demo split logic and spacing

All implementations maintain consistency across React component, standalone demo, and iframe versions.