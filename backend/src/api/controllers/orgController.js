const { Organization, Department, User } = require('../../models');
const { ApiError } = require('../../utils');

class OrgController {
  // POST /api/organizations
  async createOrganization(req, res, next) {
    try {
      const { name, description, adminAddress: bodyAdminAddress } = req.body;
      
      const exists = await Organization.findOne({ name });
      if (exists) {
        throw ApiError.badRequest('Organization name already exists');
      }

      const isSuperAdmin = (req.user.role === 'superadmin');
      // SuperAdmin can specify an admin address in the body; otherwise use the requester's address
      const assignedAdmin = (isSuperAdmin && bodyAdminAddress)
        ? bodyAdminAddress.toLowerCase()
        : req.user.address.toLowerCase();

      const org = await Organization.create({
        name,
        description,
        creatorAddress: req.user.address,
        adminAddress: assignedAdmin
      });

      // Link the admin user to this org (upsert=true creates the user record if needed)
      await User.findOneAndUpdate(
        { walletAddress: assignedAdmin },
        { organization: org._id, role: 'admin' },
        { upsert: true, new: true }
      );

      res.status(201).json({ success: true, organization: org });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/organizations
  async getOrganizations(req, res, next) {
    try {
      const orgs = await Organization.find({ isActive: true });
      res.json({ success: true, organizations: orgs });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/organizations/:id/departments
  async createDepartment(req, res, next) {
    try {
      const { name, description } = req.body;
      const orgId = req.params.id;

      const org = await Organization.findById(orgId);
      if (!org) {
        throw ApiError.notFound('Organization not found');
      }

      // Check if user is admin of this org (or superadmin)
      if (req.user.role !== 'superadmin' && org.adminAddress.toLowerCase() !== req.user.address.toLowerCase()) {
         throw ApiError.forbidden('Only organization admin can create departments');
      }

      const dept = await Department.create({
        name,
        description,
        organization: orgId
      });

      res.status(201).json({ success: true, department: dept });
    } catch (error) {
      if (error.code === 11000) { // MongoDB duplicate key
        return next(ApiError.badRequest('Department name already exists in this organization'));
      }
      next(error);
    }
  }

  // GET /api/organizations/:id/departments
  async getDepartments(req, res, next) {
    try {
      const depts = await Department.find({ organization: req.params.id });
      res.json({ success: true, departments: depts });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OrgController();
