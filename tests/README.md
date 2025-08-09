# Raffle System Tests

This directory contains comprehensive tests for the Naffles raffle system, covering all major functionality including raffle creation, ticket purchasing, VRF integration, and asset validation.

## Test Structure

### Test Files

- **`raffle.test.js`** - Core raffle functionality tests
- **`vrf.test.js`** - Chainlink VRF integration tests  
- **`assetValidation.test.js`** - NFT and token validation tests
- **`setup.js`** - Test environment setup and mocks
- **`auth.test.js`** - Authentication tests (existing)

### Configuration Files

- **`jest.config.js`** - Jest test runner configuration
- **`.env.test`** - Test environment variables

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Suites
```bash
# Raffle functionality tests
npm run test:raffle

# VRF integration tests  
npm run test:vrf

# Asset validation tests
npm run test:asset
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

## Test Database

Tests use a separate MongoDB database (`naffles_test`) to avoid interfering with development data. The database is automatically cleaned between test runs.

### Setup Test Database

1. Ensure MongoDB is running locally
2. The test database will be created automatically
3. No manual setup required - tests handle database lifecycle

## Mocked Services

The following external services are mocked in tests:

- **Alchemy SDK** - Blockchain data provider
- **Chainlink VRF** - Random number generation
- **Redis** - Caching and session storage
- **Socket.IO** - Real-time communications
- **Bull Queue** - Job processing

## Test Coverage

Current test coverage includes:

### Raffle System (raffle.test.js)
- ✅ Raffle creation (TOKEN, NFT, UNLIMITED types)
- ✅ Input validation and error handling
- ✅ Balance checking and deduction
- ✅ Ticket purchasing with various scenarios
- ✅ Winner drawing authorization
- ✅ Raffle cancellation and refunds
- ✅ Raffle browsing and filtering

### VRF Integration (vrf.test.js)
- ✅ VRF random number requests
- ✅ Fulfillment checking and status updates
- ✅ Failsafe mechanism when VRF fails
- ✅ Verifiable result generation
- ✅ Error handling and edge cases

### Asset Validation (assetValidation.test.js)
- ✅ NFT ownership verification
- ✅ Token balance validation
- ✅ Collection/contract allowlist checking
- ✅ Escrow address management
- ✅ Blockchain network support
- ✅ Error handling for API failures

## Test Data

Tests create and clean up their own data:

- Test users with various roles and balances
- Test raffles with different configurations
- Test NFT and token prizes
- Mock blockchain responses

## Environment Variables

Key test environment variables in `.env.test`:

```bash
NODE_ENV=test
MONGODB_TEST_URI=mongodb://localhost:27017/naffles_test
JWT_SECRET=test_jwt_secret_for_testing_only
DISABLE_EXTERNAL_APIS=true
```

## Debugging Tests

### Verbose Output
```bash
npm test -- --verbose
```

### Run Single Test
```bash
npm test -- --testNamePattern="should create a token raffle successfully"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Adding New Tests

When adding new raffle functionality:

1. Add test cases to appropriate test file
2. Mock any new external dependencies
3. Update test coverage expectations
4. Document new test scenarios in this README

### Test Structure Example

```javascript
describe('New Feature Tests', () => {
    beforeEach(async () => {
        // Setup test data
    });

    test('should handle new feature successfully', async () => {
        // Arrange
        const testData = { /* test input */ };
        
        // Act
        const result = await newFeature(testData);
        
        // Assert
        expect(result.success).toBe(true);
    });

    test('should handle error cases', async () => {
        // Test error scenarios
    });
});
```

## Continuous Integration

Tests are designed to run in CI/CD environments:

- No external API dependencies
- Deterministic test data
- Proper cleanup between tests
- Configurable timeouts
- Coverage reporting

## Performance Considerations

- Tests use in-memory database when possible
- Mocked external services for speed
- Parallel test execution where safe
- Optimized test data creation

## Troubleshooting

### Common Issues

**MongoDB Connection Errors**
- Ensure MongoDB is running locally
- Check connection string in `.env.test`

**Timeout Errors**
- Increase timeout in `jest.config.js`
- Check for hanging promises in tests

**Mock Issues**
- Verify mocks are properly reset between tests
- Check mock implementations in `setup.js`

### Getting Help

1. Check test logs for specific error messages
2. Run tests in verbose mode for more details
3. Verify environment setup matches requirements
4. Check that all dependencies are installed