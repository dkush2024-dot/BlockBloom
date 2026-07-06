const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

// GET /api/auth/nonce - Get a new SIWE nonce
router.get('/nonce', authController.getNonce);

// POST /api/auth/verify - Verify SIWE signature and get JWT
router.post('/verify', authController.verifySignature);

// GET /api/auth/me - Get current user profile
router.get('/me', requireAuth, authController.getMe);

// GET /api/auth/roles - Get available roles
router.get('/roles', authController.getRoles);

// GET /api/auth/admin-address - Get backend admin wallet address
router.get('/admin-address', authController.getAdminAddress);

module.exports = router;
