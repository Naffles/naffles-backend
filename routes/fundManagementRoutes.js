const express = require('express');
const router = express.Router();
const fundController = require('../controllers/fundManagementController');

// User deposit endpoints
router.get('/deposit/treasury-address/:chainId', fundController.getTreasuryAddress);
router.post('/deposits/pending', fundController.createPendingDeposit);
router.get('/deposits/pending/:userId', fundController.getUserPendingDeposits);
router.get('/deposits/history/:userId', fundController.getUserDepositHistory);

// User withdrawal endpoints
router.post('/withdrawals/request', fundController.createWithdrawalRequest);
router.get('/withdrawals/history/:userId', fundController.getUserWithdrawalHistory);

// User balance endpoints
router.get('/balances/:userId', fundController.getUserBalances);
router.get('/balances/:userId/summary', fundController.getUserBalanceSummary);

// Transaction history endpoints
router.get('/transactions/:userId', fundController.getUserTransactionHistory);
router.get('/transaction/:txHash', fundController.getTransactionDetails);

// Admin withdrawal management endpoints
router.get('/admin/withdrawals/pending', fundController.getPendingWithdrawals);
router.post('/admin/withdrawals/:withdrawalId/approve', fundController.approveWithdrawal);
router.post('/admin/withdrawals/:withdrawalId/reject', fundController.rejectWithdrawal);
router.post('/admin/withdrawals/:withdrawalId/process', fundController.processWithdrawal);

// Admin treasury management endpoints
router.get('/admin/treasury/balances', fundController.getTreasuryBalances);
router.get('/admin/treasury/health', fundController.getTreasuryHealth);
router.get('/admin/treasury/configurations', fundController.getTreasuryConfigurations);
router.post('/admin/treasury/update-address', fundController.updateTreasuryAddress);
router.get('/admin/treasury/address/:chainId', fundController.getTreasuryAddressAdmin);

// Admin transaction monitoring endpoints
router.get('/admin/transactions/recent', fundController.getRecentTransactions);
router.get('/admin/transactions/stats', fundController.getTransactionStats);
router.get('/admin/transactions/large', fundController.getLargeTransactions);
router.get('/admin/transactions/failed', fundController.getFailedTransactions);

// Monitoring and health endpoints
router.get('/health', fundController.healthCheck);
router.get('/monitoring/status', fundController.getMonitoringStatus);
router.post('/monitoring/start', fundController.startMonitoring);
router.post('/monitoring/stop', fundController.stopMonitoring);

// Exchange rate endpoints
router.get('/exchange-rates', fundController.getExchangeRates);
router.get('/supported-chains', fundController.getSupportedChains);

module.exports = router;