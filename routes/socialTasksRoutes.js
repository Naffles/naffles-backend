const express = require('express');
const router = express.Router();
const socialTasksController = require('../controllers/socialTasksController');
const authMiddleware = require('../middleware/auth'); // Assuming auth middleware exists

// Public routes
router.get('/types', socialTasksController.getTaskTypes);
router.get('/communities/:communityId/tasks', socialTasksController.getCommunityTasks);
router.get('/tasks/:taskId', socialTasksController.getTask);

// Protected routes (require authentication)
router.use(authMiddleware);

// Task management (community admin)
router.post('/communities/:communityId/tasks', socialTasksController.createTask);
router.put('/tasks/:taskId', socialTasksController.updateTask);
router.delete('/tasks/:taskId', socialTasksController.deleteTask);

// Task participation (community members)
router.post('/tasks/:taskId/start', socialTasksController.startTask);
router.post('/tasks/:taskId/submit', socialTasksController.submitTask);

// Task verification (community admin)
router.post('/completions/:completionId/verify', socialTasksController.verifyTask);
router.get('/communities/:communityId/verifications/pending', socialTasksController.getPendingVerifications);

// Analytics and history
router.get('/communities/:communityId/tasks/analytics', socialTasksController.getTaskAnalytics);
router.get('/communities/:communityId/tasks/history', socialTasksController.getUserTaskHistory);

module.exports = router;