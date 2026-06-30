const express = require('express');
const router = express.Router();
const orgController = require('../controllers/orgController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbac');

// Organization routes
router.post('/', requireAuth, orgController.createOrganization);
router.get('/', orgController.getOrganizations);

// Department routes nested under organizations
router.post('/:id/departments', requireAuth, requireRole('superadmin', 'admin'), orgController.createDepartment);
router.get('/:id/departments', orgController.getDepartments);

module.exports = router;
