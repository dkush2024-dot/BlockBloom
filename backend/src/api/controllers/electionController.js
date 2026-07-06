const { Election, Proposal, Organization } = require('../../models');
const { ApiError } = require('../../utils');

class ElectionController {
  // GET /api/elections
  async getElections(req, res, next) {
    try {
      const orgId = req.query.orgId;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const skip = (page - 1) * limit;

      const query = orgId ? { orgId } : {};
      
      const elections = await Election.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
        
      const total = await Election.countDocuments(query);
      
      res.json({ success: true, elections, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/elections/:address
  async getElectionByAddress(req, res, next) {
    try {
      const election = await Election.findOne({ contractAddress: req.params.address.toLowerCase() });
      if (!election) {
        throw ApiError.notFound('Election not found');
      }
      res.json({ success: true, election });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/elections/:address/proposals
  async getElectionProposals(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const skip = (page - 1) * limit;

      const proposals = await Proposal.find({ daoAddress: req.params.address.toLowerCase() })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
        
      const total = await Proposal.countDocuments({ daoAddress: req.params.address.toLowerCase() });

      res.json({ success: true, proposals, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/elections/fix-orphaned  (admin utility)
  async fixOrphanedElections(req, res, next) {
    try {
      const { targetOrgId } = req.body;
      const orgs = await Organization.find({});
      
      if (orgs.length === 0) {
        return res.json({ success: false, message: 'No organizations found' });
      }

      const validOrgIds = orgs.map(o => o._id.toString());
      // Find elections whose orgId is NOT one of the valid org IDs
      const allElections = await Election.find({});
      let fixedCount = 0;

      for (const election of allElections) {
        if (!validOrgIds.includes(election.orgId)) {
          // Use targetOrgId if provided, otherwise use the only/first org
          const newOrgId = targetOrgId || (orgs.length === 1 ? orgs[0]._id.toString() : null);
          if (newOrgId) {
            await Election.findByIdAndUpdate(election._id, { orgId: newOrgId });
            fixedCount++;
          }
        }
      }

      res.json({ success: true, fixedCount, message: `Fixed ${fixedCount} orphaned elections` });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ElectionController();
