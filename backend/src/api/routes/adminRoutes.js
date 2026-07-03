const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbac');

// All admin routes require SuperAdmin role
router.use(requireAuth);
// Assuming rbac takes roles. If not available, we can just use a simple role check, 
// but we will assume rbac('SuperAdmin') works based on prior phases.
router.use(requireRole('SuperAdmin'));

router.get('/audit-logs', adminController.getAuditLogs);
router.get('/analytics/voters', adminController.getVoterAnalytics);
router.get('/analytics/elections', adminController.getElectionAnalytics);

module.exports = router;
