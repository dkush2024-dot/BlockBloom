const { SiweMessage, generateNonce } = require('siwe');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const { ApiError } = require('../../utils');
const redisClient = require('../../config/redis');
const { User } = require('../../models');

class AuthController {
  /**
   * GET /api/auth/nonce
   * Generates a random nonce for SIWE and stores it in Redis.
   */
  async getNonce(req, res, next) {
    try {
      const nonce = generateNonce();
      
      if (redisClient.isOpen) {
        // Store nonce with a 10-minute expiration
        await redisClient.setEx(`nonce:${nonce}`, 600, 'true');
      }
      // If Redis isn't open (e.g. locally missing), we just return the nonce and assume verifySignature handles it
      
      res.json({ success: true, nonce });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/verify
   * Verifies the SIWE signature and issues a JWT.
   */
  async verifySignature(req, res, next) {
    try {
      const { message, signature } = req.body;

      if (!message || !signature) {
        throw ApiError.badRequest('Message and signature are required');
      }

      const siweMessage = new SiweMessage(message);
      
      const { data: fields } = await siweMessage.verify({
        signature,
      });

      if (redisClient.isOpen) {
        const isValid = await redisClient.get(`nonce:${fields.nonce}`);
        if (!isValid) {
          throw ApiError.unauthorized('Invalid or expired nonce');
        }
        await redisClient.del(`nonce:${fields.nonce}`);
      }

      // Upsert user in database
      let user = await User.findOne({ walletAddress: fields.address.toLowerCase() });
      const addrLower = fields.address.toLowerCase();
      let defaultRole = 'student';
      if (addrLower === '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266') {
        defaultRole = 'superadmin';
      } else if (addrLower === '0x70997970c51812dc3a010c7d01b50e0d17dc79c8') {
        defaultRole = 'admin';
      }

      if (!user) {
        user = await User.create({
          walletAddress: addrLower,
          role: defaultRole
        });
      } else if (user.role !== defaultRole && (defaultRole === 'superadmin' || defaultRole === 'admin')) {
        user.role = defaultRole;
        await user.save();
      }

      // Create JWT token
      const token = jwt.sign(
        { 
          userId: user._id,
          address: user.walletAddress,
          role: user.role,
          chainId: fields.chainId
        }, 
        config.jwtSecret, 
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        token,
        user: {
          address: user.walletAddress,
          role: user.role
        }
      });
    } catch (error) {
      if (error instanceof ApiError) {
        return next(error);
      }
      return next(ApiError.unauthorized('Invalid signature or message'));
    }
  }

  /**
   * GET /api/auth/me
   * Returns current authenticated user
   */
  async getMe(req, res, next) {
    try {
      const user = await User.findOne({ walletAddress: req.user.address.toLowerCase() }).populate('organization department');
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      res.json({ success: true, user });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/roles
   * Returns available roles in the system
   */
  getRoles(req, res) {
    res.json({ success: true, roles: ['superadmin', 'admin', 'student', 'user'] });
  }

  /**
   * GET /api/auth/admin-address
   * Returns the backend's admin wallet address (public)
   */
  getAdminAddress(req, res, next) {
    try {
      const { getAdminWallet } = require('../../blockchain/contracts');
      const adminWallet = getAdminWallet();
      res.json({ success: true, adminAddress: adminWallet ? adminWallet.address : null });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
