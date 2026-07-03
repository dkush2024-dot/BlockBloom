const asyncHandler = require('../../utils/asyncHandler');
const { AuditLog, Vote, Election } = require('../../models');

/**
 * Get Audit Logs with pagination and filtering
 * GET /api/admin/audit-logs
 */
exports.getAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, action, performedBy } = req.query;

  const query = {};
  if (action) query.action = action;
  if (performedBy) query.performedBy = performedBy.toLowerCase();

  const skip = (Number(page) - 1) * Number(limit);

  const [logs, total] = await Promise.all([
    AuditLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(Number(limit)).lean(),
    AuditLog.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

/**
 * Get Voter Analytics
 * GET /api/admin/analytics/voters
 */
exports.getVoterAnalytics = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days));

  const pipeline = [
    { $match: { timestamp: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ];

  const [dailyVotes, totalVotes] = await Promise.all([
    Vote.aggregate(pipeline),
    Vote.countDocuments(),
  ]);

  res.json({
    success: true,
    data: {
      totalVotes,
      dailyTrend: dailyVotes,
    },
  });
});

/**
 * Get Election Analytics
 * GET /api/admin/analytics/elections
 */
exports.getElectionAnalytics = asyncHandler(async (req, res) => {
  const pipeline = [
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ];

  const statusDistribution = await Election.aggregate(pipeline);
  const totalElections = await Election.countDocuments();

  res.json({
    success: true,
    data: {
      totalElections,
      statusDistribution,
    },
  });
});
